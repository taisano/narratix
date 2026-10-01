import type { Locale } from '@/registry';
import type { SceneItem, TextLine } from '../../scene';
import { FOCUS, INK, SEC, WHITE, mixColor } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { formatCell, parseCell } from './cells';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import type { Kpi, KpiContent, KpiLook, NumberFormatDef, TextAlign } from './types';

/**
 * KPI スコアカード（STORY_TABLE_KPI）の配置。カードの作り（細いアクセントライン・同じ幅と高さ・強調）は結論＋根拠と同じ。
 * 1枚のカード：指標名・大きな数字と単位・対象期間・比較基準と増減。増減はアプリが計算する（今の値と比較の値から）。
 * 4つまで1段、5つから2段（選べる）。入れていない KPI は描かない
 */

export const KPI_STYLE = {
  /** 良い向きの増減（紺）・悪い向き（赤）。良し悪しの緑は使わない（docs/decisions.md「ストーリーの色」） */
  good: FOCUS.primary,
  bad: '#C62828',
  flat: SEC,
  valueSizes: [48, 44, 40, 36, 32, 28, 24],
  minValue: 24,
} as const;

/** 入っている KPI（指標名か今の値がある） */
export const filledKpis = (c: KpiContent): Kpi[] => c.kpis.filter((k) => k.name.trim() || k.value.trim());

export interface KpiDelta {
  /** 差（今 − 比較） */
  diff: number;
  /** 率（%。比較が0なら null） */
  pct: number | null;
  /** 今の値が % の指標（差は pt で出す） */
  isPct: boolean;
}

const PCT_UNIT = /^[%％]$/;

/** % の指標か：今の値に % が付いている、単位が %、数の形が % のどれか */
export const isPctKpi = (k: Pick<Kpi, 'value' | 'unit'>, f?: NumberFormatDef): boolean =>
  parseCell(k.value).mark === 'pct' || PCT_UNIT.test(k.unit.trim()) || f?.kind === 'pct';

/** 増減を計算する（今の値と比較の値の両方が数として読める時だけ）。f＝その KPI の数の形 */
export function kpiDelta(k: Pick<Kpi, 'value' | 'compare'> & Partial<Pick<Kpi, 'unit'>>, f?: NumberFormatDef): KpiDelta | null {
  const v = parseCell(k.value), c = parseCell(k.compare);
  if (v.value == null || c.value == null) return null;
  const diff = v.value - c.value;
  return { diff, pct: c.value === 0 ? null : (diff / Math.abs(c.value)) * 100, isPct: isPctKpi({ value: k.value, unit: k.unit ?? '' }, f) };
}

/** カードに出す単位：数字の側にもう % が付いていれば、単位の % は出さない（% を2回出さない） */
export const kpiUnit = (k: Pick<Kpi, 'unit'>, shown: string): string => {
  const u = k.unit.trim();
  return PCT_UNIT.test(u) && /[%％]$/.test(shown.trim()) ? '' : u;
};

const fmtSigned = (n: number, digits: number) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  if (r === 0) return '±0';
  return (r > 0 ? '+' : '−') + Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

/** 増減の文字（例：+47.0%、+1,180万人、+3.0pt） */
export function deltaText(k: Kpi, d: KpiDelta, mode: KpiLook['delta'], digitsOf: (n: number) => number): string {
  // % の指標は、差を pt で（率の率は出さない）
  if (d.isPct) return fmtSigned(d.diff, 1) + 'pt';
  const diff = fmtSigned(d.diff, digitsOf(d.diff)) + k.unit.trim();
  const pct = d.pct == null ? null : fmtSigned(d.pct, 1) + '%';
  if (mode === 'diff' || pct == null) return diff;
  if (mode === 'pct') return pct;
  return `${pct}（${diff}）`;
}

/** 増減の色：良い向きは紺、悪い向きは赤、色を付けない・変わらないは灰 */
export function deltaColor(k: Kpi, d: KpiDelta): string {
  if (k.good === 'none' || Math.abs(d.diff) < 1e-12) return KPI_STYLE.flat;
  const up = d.diff > 0;
  return (k.good === 'up') === up ? KPI_STYLE.good : KPI_STYLE.bad;
}

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

export function layoutKpi(c: KpiContent, look: KpiLook, area: TableBox, _locale: Locale): { items: SceneItem[]; dense: boolean } {
  const S = CARD_STYLE;
  const K = KPI_STYLE;
  const items: SceneItem[] = [];
  const kpis = filledKpis(c);
  const al: TextAlign = look.align ?? 'left';
  let bottom = area.y + area.h;
  const noteLines = c.note.trim() ? wrapText(c.note.trim(), 10, area.w, 2) : [];
  const noteH = noteLines.length * lineH(10);
  if (noteH) bottom -= noteH + 0.2;
  const top = area.y + 0.15;
  if (!kpis.length) {
    if (noteH) items.push(text(area.x, top, area.w, noteH, noteLines.map((t) => ({ t, size: 10, color: SEC })), 'left'));
    return { items, dense: false };
  }
  const n = kpis.length;
  const rows = look.rows === 'one' ? 1 : look.rows === 'two' ? Math.min(2, n) : n <= 4 ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const gapV = 0.3;
  const cardW = (area.w - S.gap * (perRow - 1)) / perRow;
  const inner = cardW - 2 * S.pad;
  const fmt = (k: Kpi) => formatCell(k.value, look.formats[k.id]);
  const digitsOf = (k: Kpi) => (x: number) => (look.formats[k.id]?.kind === 'dec' ? look.formats[k.id]!.digits ?? 1 : Number.isInteger(Math.round(x * 100) / 100) ? 0 : 1);

  // 大きな数字の文字：全部のカードで同じ大きさ（数字と単位が1行に入る大きさ）
  const unitSize = (vs: number) => Math.max(14, Math.round(vs * 0.42));
  const unitOf = (k: Kpi) => kpiUnit(k, fmt(k));
  const fits = (vs: number) => kpis.every((k) => textWidth(fmt(k), vs) * 0.98 + (unitOf(k) ? 0.08 + textWidth(unitOf(k), unitSize(vs)) : 0) <= inner);
  let vs: number = K.valueSizes.find(fits) ?? K.minValue;
  const dense = !fits(vs);
  // カードの中身の高さ
  const nameLines = (k: Kpi) => (k.name.trim() ? wrapText(k.name.trim(), 15, inner, 2) : []);
  const hasDelta = (k: Kpi) => look.showDelta && !!kpiDelta(k, look.formats[k.id]);
  const need = (k: Kpi) =>
    0.08 + nameLines(k).length * lineH(15) + 0.12 + lineH(vs) * 0.95
    + (look.showPeriod && k.period.trim() ? lineH(12) : 0)
    + (look.showBasis && k.basis.trim() && hasDelta(k) ? 0.12 + lineH(12) : 0)
    + (hasDelta(k) ? (look.showBasis && k.basis.trim() ? 0 : 0.12) + lineH(18) : 0)
    + 2 * S.pad;
  const availH = (bottom - top - gapV * (rows - 1)) / rows;
  // 数字が大きすぎて高さに入らなければ、小さくする
  while (vs > K.minValue && Math.max(...kpis.map(need)) > availH) vs = K.valueSizes.find((x) => x < vs) ?? K.minValue;
  const maxNeed = Math.max(...kpis.map(need));
  const cardH = Math.min(availH, Math.max(maxNeed + 0.3, rows === 1 ? 3.0 : 2.1));
  const tooTall = maxNeed > availH;

  // カードの塊は、内容の領域の上寄り（空きの3分の1を上に）に置く
  const blockH = rows * cardH + (rows - 1) * gapV;
  const y0 = top + Math.max(0, (bottom - top - blockH) / 3);
  kpis.forEach((k, idx) => {
    const r = Math.floor(idx / perRow), col = idx % perRow;
    // 2段で最後の段が少ない時も、左から同じ幅で並べる
    const x = area.x + col * (cardW + S.gap);
    const y = y0 + r * (cardH + gapV);
    const em = look.emphasis === k.id;
    const accent = em ? S.accent : S.number;
    items.push({ kind: 'box', x, y, w: cardW, h: cardH, fill: em ? mixColor(S.accent, WHITE, 0.9) : WHITE, line: em ? S.accent : S.border });
    items.push({ kind: 'line', x1: x, y1: y, x2: x + cardW, y2: y, color: accent, width: em ? 4 : 3 });
    const ix = x + S.pad;
    let cy = y + S.pad + 0.08;
    const nl = nameLines(k);
    if (nl.length) { items.push(text(ix, cy, inner, nl.length * lineH(15), nl.map((t) => ({ t, size: 15, bold: true, color: INK })), al)); cy += nl.length * lineH(15); }
    cy += 0.12;
    // 数字と単位（数字は大きく、単位はその後ろに小さく。揃えは2つ合わせた幅で）
    const value = fmt(k);
    const unit = unitOf(k);
    const us = unitSize(vs);
    const vw = textWidth(value, vs) * 0.98;
    const uw = unit ? textWidth(unit, us) + 0.1 : 0;
    const total = vw + (unit ? 0.08 + uw : 0);
    const startX = al === 'left' ? ix : al === 'center' ? ix + (inner - total) / 2 : ix + inner - total;
    const vh = lineH(vs) * 0.95;
    if (value) items.push(text(startX, cy, vw + 0.05, vh, [{ t: value, size: vs, bold: true, color: accent }], 'left'));
    if (unit) items.push(text(startX + vw + 0.08, cy + vh - lineH(us) * 1.15, uw, lineH(us), [{ t: unit, size: us, color: SEC }], 'left'));
    cy += vh;
    if (look.showPeriod && k.period.trim()) { items.push(text(ix, cy, inner, lineH(12), [{ t: k.period.trim(), size: 12, color: SEC }], al)); cy += lineH(12); }
    const d = look.showDelta ? kpiDelta(k, look.formats[k.id]) : null;
    if (d) {
      cy += 0.12;
      const lines: TextLine[] = [];
      if (look.showBasis && k.basis.trim()) lines.push({ t: k.basis.trim(), size: 12, color: SEC });
      lines.push({ t: deltaText(k, d, look.delta, digitsOf(k)), size: 18, bold: true, color: deltaColor(k, d) });
      items.push(text(ix, cy, inner, (lines.length > 1 ? lineH(12) : 0) + lineH(18), lines, al));
    }
  });
  const cardsBottom = y0 + blockH;
  if (noteH) items.push(text(area.x, cardsBottom + 0.2, area.w, noteH, noteLines.map((t) => ({ t, size: 10, color: SEC })), 'left'));
  return { items, dense: dense || tooTall };
}
