import { slideText } from '@/i18n/slide';
import { formatMetric, nonAdditiveUnit, type NumberFormat } from '../../format';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { textWidth } from '../../text';
import { AXIS, FOCUS, INK, SEC, seriesColor } from '../../theme';
import { cagr, timeRange } from '../../transform/cagr';
import type { Matrix } from '../../transform/matrix';
import { layoutHeader } from './common';
import { envOf, type ChartCtx, type ChartLayout } from './context';
import { GROUP_COLORS } from './relationship';
import { TOTAL_CHANGE_H, totalChangeText } from './total-change';
import { spreadLabels } from './twopoint';

const UP = '#2E7D32', DOWN = '#C62828', FLAT = '#6B7280';
type ChangeMode = 'pct' | 'diff' | 'cagr' | 'none';
interface SlopeLine { name: string; k: number; from: number | null; to: number | null }

const yearOf = (s: string) => (/^\d{4}$/.test(s.trim()) ? Number(s) : null);
const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±');

/**
 * 始点・終点の行（年）。設定で選んでいればその行、無ければ年の最小と最大（年でなければ最初と最後の行）。
 * 同じ行を選んだ時は null（2時点にならない）
 */
export function slopeEnds(rows: readonly string[], from?: string, to?: string): { a: number; b: number } | null {
  if (rows.length < 2) return null;
  const r = timeRange(rows);
  const a = from && rows.includes(from) ? rows.indexOf(from) : r ? r.fromIndex : 0;
  const b = to && rows.includes(to) ? rows.indexOf(to) : r ? r.toIndex : rows.length - 1;
  return a === b ? null : { a, b };
}

/** 数値の表示（小数点以下の桁を選んでいれば、その桁にそろえる） */
export function slopeFormatter(nf: NumberFormat, decimals: string | undefined): (v: number) => string {
  const d = decimals == null || decimals === 'auto' ? null : Number(decimals);
  if (d == null || !Number.isFinite(d)) return (v) => formatMetric(v, nf);
  const fixed = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v) => {
    const abs = Math.abs(v);
    if (nf === '%') return fixed(v) + '%';
    if (nf === 'K' || (nf === 'auto' && abs >= 1000 && abs < 1_000_000)) return fixed(v / 1000) + 'K';
    if (nf === 'M' || (nf === 'auto' && abs >= 1_000_000)) return fixed(v / 1_000_000) + 'M';
    return fixed(v);
  };
}

/** 項目ごとの変化の文字（計算できない時は —） */
export function changeText(mode: ChangeMode, from: number, to: number, years: number | null, fmt: (v: number) => string): { t: string; v: number | null } {
  if (mode === 'diff') { const d = to - from; return { t: Math.abs(d) < 1e-9 ? '±0' : sign(d) + fmt(Math.abs(d)), v: d }; }
  if (mode === 'pct') {
    if (!(from > 0)) return { t: '—', v: null };
    const g = to / from - 1, p = Math.abs(g * 100);
    return { t: sign(g) + (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%', v: g };
  }
  if (mode === 'cagr') {
    const g = years != null && years > 0 ? cagr(from, to, years) : null;
    return g == null ? { t: '—', v: null } : { t: sign(g) + Math.abs(g * 100).toFixed(1) + '%', v: g };
  }
  return { t: '', v: null };
}

interface PanelOpts {
  lines: SlopeLine[];
  fromLabel: string;
  toLabel: string;
  title: string | null;
  total: string | null;
  source: string | null;
  fmt: (v: number) => string;
  mode: ChangeMode;
  colorOf: (l: SlopeLine) => string;
  emphasized: (l: SlopeLine) => boolean;
  dimmed: (l: SlopeLine) => boolean;
}

/**
 * スロープの1枚分。左に「名前｜値」、右に「値｜変化」を別々の欄として並べる（名前は左だけ。数値は右揃え）。
 * 始点・終点のどちらかが空の項目は線を引かず、下に「データなし」として名前を出す
 */
function slopePanel(ctx: ChartCtx, rect: Rect, o: PanelOpts): SceneItem[] {
  const items: SceneItem[] = [];
  const drawn = o.lines.filter((l): l is SlopeLine & { from: number; to: number } => l.from != null && l.to != null && Number.isFinite(l.from) && Number.isFinite(l.to));
  const missing = o.lines.filter((l) => !drawn.includes(l as never));
  let y = rect.y;
  if (o.title) {
    items.push({ kind: 'text', x: rect.x, y, w: rect.w, h: 0.28, lines: [{ t: o.title, size: 12, bold: true, color: INK }], align: 'left', valign: 'middle' });
    y += 0.34;
  }
  if (o.total) {
    items.push({ kind: 'text', x: rect.x, y, w: rect.w, h: TOTAL_CHANGE_H - 0.06, lines: [{ t: o.total, size: 10, bold: true, color: INK }], align: 'left', valign: 'middle' });
    y += TOTAL_CHANGE_H;
  }
  const footer = (missing.length ? 0.22 : 0) + (o.source ? 0.22 : 0);
  const size = drawn.length > 8 ? 9 : 10;
  const y0 = yearOf(o.fromLabel), y1 = yearOf(o.toLabel);
  const years = y0 != null && y1 != null ? y1 - y0 : null;
  const changes = drawn.map((l) => changeText(o.mode, l.from, l.to, years, o.fmt));
  const changeHead = o.mode === 'none' ? '' : o.mode === 'pct' ? slideText(ctx.locale, 'slopeChangePct') : o.mode === 'diff' ? slideText(ctx.locale, 'slopeChangeDiff')
    : slideText(ctx.locale, 'slopeChangeCagr', { from: o.fromLabel, to: y1 != null ? String(y1).slice(2) : o.toLabel });
  const w = (ts: string[], sz = size) => (ts.length ? Math.max(...ts.map((t) => textWidth(t, sz))) : 0);
  const nameW = Math.min(rect.w * 0.3, w(drawn.map((l) => l.name)) + 0.16);
  const valLW = w(drawn.map((l) => o.fmt(l.from))) + 0.12;
  const valRW = w(drawn.map((l) => o.fmt(l.to))) + 0.12;
  const chgW = o.mode === 'none' ? 0 : Math.max(w(changes.map((c) => c.t)), w([changeHead], 8)) + 0.16;
  const xL = rect.x + nameW + valLW + 0.08;
  const xR = rect.x + rect.w - chgW - valRW - 0.08;
  const head = y;
  const top = head + 0.34;
  const plot: Rect = { x: xL, y: top, w: Math.max(0.5, xR - xL), h: rect.y + rect.h - footer - top - 0.08 };
  // 年の見出しと、変化の見出し
  for (const [x, t] of [[xL, o.fromLabel], [xR, o.toLabel]] as const) {
    items.push({ kind: 'line', x1: x, y1: plot.y - 0.04, x2: x, y2: plot.y + plot.h, color: AXIS.grid, width: 1 });
    items.push({ kind: 'text', x: x - 0.8, y: head, w: 1.6, h: 0.26, lines: [{ t, size: 11, bold: true, color: INK }], align: 'center', valign: 'middle' });
  }
  if (changeHead) items.push({ kind: 'text', x: rect.x + rect.w - chgW - 0.2, y: head, w: chgW + 0.2, h: 0.26, lines: [{ t: changeHead, size: 8, color: SEC }], align: 'right', valign: 'middle' });
  if (drawn.length) {
    const scale = valueScale(drawn.flatMap((l) => [l.from, l.to]));
    const yOf = (v: number) => plot.y + plot.h * (1 - scale.ratio(v));
    // 強調した線は最後に描いて上に出す
    for (const l of [...drawn].sort((p, q) => Number(o.emphasized(p)) - Number(o.emphasized(q)))) {
      const em = o.emphasized(l), c = o.colorOf(l);
      const ya = yOf(l.from), yb = yOf(l.to);
      items.push({ kind: 'line', x1: xL, y1: ya, x2: xR, y2: yb, color: c, width: em ? 3 : 2 });
      const r = em ? 0.06 : 0.05;
      items.push({ kind: 'ellipse', x: xL - r, y: ya - r, w: r * 2, h: r * 2, fill: c }, { kind: 'ellipse', x: xR - r, y: yb - r, w: r * 2, h: r * 2, fill: c });
    }
    const gap = (size / 72) * 1.35;
    const lo = plot.y - 0.02, hi = plot.y + plot.h;
    const ysL = spreadLabels(drawn.map((l) => yOf(l.from)), gap, lo, hi);
    const ysR = spreadLabels(drawn.map((l) => yOf(l.to)), gap, lo, hi);
    drawn.forEach((l, i) => {
      const dim = o.dimmed(l), bold = !dim;
      const color = dim ? SEC : INK;
      const t = (x: number, yy: number, ww: number, s: string, align: 'left' | 'right', c = color): SceneItem =>
        ({ kind: 'text', x, y: yy - 0.11, w: ww, h: 0.22, lines: [{ t: s, size, bold, color: c }], align, valign: 'middle' });
      items.push(t(rect.x, ysL[i]!, nameW - 0.06, l.name, 'left'));
      items.push(t(rect.x + nameW, ysL[i]!, valLW, o.fmt(l.from), 'right'));
      items.push(t(xR + 0.08, ysR[i]!, valRW, o.fmt(l.to), 'right'));
      if (o.mode !== 'none') {
        const ch = changes[i]!;
        const c = dim ? SEC : ch.v == null || Math.abs(ch.v) < 1e-9 ? FLAT : ch.v > 0 ? UP : DOWN;
        items.push(t(xR + 0.08 + valRW, ysR[i]!, chgW, ch.t, 'right', c));
      }
    });
  }
  let fy = rect.y + rect.h - footer;
  if (missing.length) {
    items.push({ kind: 'text', x: rect.x, y: fy, w: rect.w, h: 0.2, lines: [{ t: slideText(ctx.locale, 'slopeNoData', { names: missing.map((l) => l.name).join(ctx.locale === 'ja' ? '、' : ', ') }), size: 8, color: SEC }], align: 'left', valign: 'middle' });
    fy += 0.22;
  }
  if (o.source) items.push({ kind: 'text', x: rect.x, y: fy, w: rect.w, h: 0.2, lines: [{ t: o.source, size: 8, color: SEC }], align: 'left', valign: 'middle' });
  return items;
}

/** 線の色：強調があれば、強調した項目に順に色を付け、ほかは薄いグレー。無ければ項目ごとの色（左右のパネルで同じ） */
function colorsFor(ctx: ChartCtx, names: readonly string[]) {
  const hs = (ctx.control<string[]>('highlights') ?? []).filter((h) => names.includes(h));
  const legacy = ctx.control<string>('highlight');
  const hl = hs.length ? hs : legacy && names.includes(legacy) ? [legacy] : [];
  return {
    colorOf: (l: SlopeLine) => (hl.length ? (hl.includes(l.name) ? GROUP_COLORS[hl.indexOf(l.name) % GROUP_COLORS.length]! : FOCUS.otherLine) : seriesColor(l.k)),
    emphasized: (l: SlopeLine) => hl.includes(l.name),
    dimmed: (l: SlopeLine) => hl.length > 0 && !hl.includes(l.name),
  };
}

function linesOf(m: Matrix, values: (number | null)[][], a: number, b: number): SlopeLine[] {
  const ra = values[a] ?? [], rb = values[b] ?? [];
  return m.cols.map((name, k) => ({ name, k, from: ra[k] ?? null, to: rb[k] ?? null }));
}

/** 合計の1行（名前は設定、無ければ「掲載N項目計」） */
function totalFor(ctx: ChartCtx, lines: SlopeLine[], fromLabel: string, toLabel: string, unit: string): string | null {
  const pairs = lines.filter((l) => l.from != null && l.to != null).map((l) => ({ base: l.from!, compare: l.to! }));
  const name = ctx.control<string>('total_label')?.trim() || slideText(ctx.locale, 'shownTotal', { n: pairs.length });
  return totalChangeText({ ...ctx, unit }, pairs, fromLabel, toLabel, name);
}

const needs = (ctx: ChartCtx, key: 'needTwoPoints' | 'slopePairNeeds'): ReturnType<ChartLayout> => ({
  items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.5, lines: [{ t: slideText(ctx.locale, key), size: 10, color: SEC }], align: 'left', valign: 'top' }],
  anchors: {},
});

/**
 * スロープ：選んだ2時点（初期値は最初と最後の年）を線で結ぶ。
 * 左に「名前｜値」、右に「値｜変化（増減率・増減・CAGR）」。複数の項目を強調できる
 */
export const slope: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const e = slopeEnds(m.rows, ctx.control<string>('slope_from'), ctx.control<string>('slope_to'));
  if (!e) return needs(ctx, 'needTwoPoints');
  const lines = linesOf(m, m.current.values, e.a, e.b);
  if (!lines.some((l) => l.from != null && l.to != null)) return needs(ctx, 'needTwoPoints');
  const unit = ctx.unit;
  const head = layoutHeader(ctx.rect, [], unit ? slideText(ctx.locale, 'unitNote', { unit }) : null);
  const fromLabel = m.rows[e.a]!, toLabel = m.rows[e.b]!;
  const items = [...head.items, ...slopePanel(ctx, { x: ctx.rect.x, y: ctx.rect.y + head.height, w: ctx.rect.w, h: ctx.rect.h - head.height }, {
    lines, fromLabel, toLabel, title: null,
    total: totalFor(ctx, lines, fromLabel, toLabel, unit), source: null,
    fmt: slopeFormatter(env.numberFormat, ctx.control<string>('decimals')),
    mode: (ctx.control<ChangeMode>('slope_change') ?? 'pct'),
    ...colorsFor(ctx, m.cols),
  })];
  return { items, anchors: {} };
};

/** 指標の名前の括弧の中を単位として読む（例：訪日客数（万人）→ 万人） */
export const unitInName = (name: string): string | null => /[（(]([^（()）]{1,12})[）)]\s*$/.exec(name)?.[1]?.trim() ?? null;

/**
 * 2指標スロープ：左右に同じ形のスロープを並べる（左＝「現在」の表、右＝「比較」の表。表の名前が指標の名前）。
 * 年と項目は左右で共通。項目の色は左右で同じ。合計・出典はパネルごと
 */
export const slopePair: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const e = slopeEnds(m.rows, ctx.control<string>('slope_from'), ctx.control<string>('slope_to'));
  if (!e) return needs(ctx, 'needTwoPoints');
  if (!m.base || !m.base.values.some((r) => r.some((v) => v != null))) return needs(ctx, 'slopePairNeeds');
  const fromLabel = m.rows[e.a]!, toLabel = m.rows[e.b]!;
  const fmt = slopeFormatter(env.numberFormat, ctx.control<string>('decimals'));
  const mode = ctx.control<ChangeMode>('slope_change') ?? 'pct';
  const colors = colorsFor(ctx, m.cols);
  const gap = 0.5;
  const pw = (ctx.rect.w - gap) / 2;
  const items: SceneItem[] = [];
  const panels = [
    { values: m.current.values, label: m.current.label, source: ctx.control<string>('source_left') },
    { values: m.base.values, label: m.base.label, source: ctx.control<string>('source_right') },
  ];
  panels.forEach((p, i) => {
    const lines = linesOf(m, p.values, e.a, e.b);
    const unit = unitInName(p.label) ?? ctx.unit;
    const title = p.label && ctx.unit && !unitInName(p.label) ? `${p.label}（${ctx.unit}）` : p.label || null;
    const additive = !nonAdditiveUnit(unit);
    items.push(...slopePanel(ctx, { x: ctx.rect.x + i * (pw + gap), y: ctx.rect.y, w: pw, h: ctx.rect.h }, {
      lines, fromLabel, toLabel, title,
      total: additive ? totalFor(ctx, lines, fromLabel, toLabel, unit) : null,
      source: p.source?.trim() || null, fmt, mode, ...colors,
    }));
  });
  // 左右の区切り
  const xm = ctx.rect.x + pw + gap / 2;
  items.push({ kind: 'line', x1: xm, y1: ctx.rect.y, x2: xm, y2: ctx.rect.y + ctx.rect.h, color: '#D5DBE0', width: 0.75 });
  return { items, anchors: {} };
};
