import { OTHER_GREY } from './bars';
import type { Locale } from '@/registry';
import { periodText, slideText } from '@/i18n/slide';
import { formatNumber, formatPt } from '../../format';
import type { MekkoModel } from '../../model/mekko';
import type { BoxItem, Rect, SceneItem, TextLine } from '../../scene';
import { textWidth } from '../../text';
import { layoutHeader } from './common';
import { INK, SEC, WHITE, textOn } from '../../theme';
import type { PanelAnchors } from '../anchors';

export type MekkoLabelMode = 'pct' | 'abs_pct' | 'abs' | 'none';

export interface MekkoLayoutInput {
  rect: Rect;
  model: MekkoModel;
  locale: Locale;
  unit: string;
  /** 列（セグメント）が何を表すか。例：形状 */
  colsLabel: string;
  periodLabel: string;
  labels: MekkoLabelMode;
  deltaLabels: boolean;
  /** 強調するセグメントの番号（-1 はなし） */
  highlight: number;
  /** 強調色（Plus）。強調したセグメントだけこの色、ほかはテーマの色のまま */
  accent?: string | null;
  /** 読み方の注記（幅・高さ）をチャートの中に出すか（readingNote）。無ければ出す */
  note?: (text: string) => string | null;
  palette: { series: string[]; greys: string[] };
  /** 左の余白（軸ラベルと、下に揃える表の行ラベル） */
  gutter: number;
  /** 左上の「形状構成比（2025年）」。左に合計棒を並べる時は出さない */
  axisTitle?: boolean;
}

/** 凡例の行の高さ、列ラベルの高さ */
export const MEKKO = { legendH: 0.4, labelH: 0.5, defaultGutter: 1.75 } as const;

/**
 * Mekko の配置（reference/mekko-builder.html の layout() を移植）。
 * 上に凡例、左に軸、下に列ラベル。列の位置は揃えのために anchors で返す。
 */
export function layoutMekko(p: MekkoLayoutInput): { items: SceneItem[]; anchors: PanelAnchors } {
  const { rect, model: m, locale } = p;
  const items: SceneItem[] = [];
  const L = rect.x, LW = p.gutter;
  const { series: PAL, greys: GREYS } = p.palette;
  // 「その他」（上位だけ表示でまとめた残り）はグレー
  const accent = p.highlight >= 0 ? p.accent ?? null : null;
  const segColor = (k: number) => (accent && k === p.highlight ? accent : m.segments[k] === slideText(p.locale, 'others') ? OTHER_GREY : PAL[k % PAL.length]!);

  // 凡例と右の注記（重なる時は注記を下の行へ。凡例も入り切らなければ折り返す）
  const period = periodText(locale, p.periodLabel);
  const note0 = slideText(locale, 'mekkoNote', { period, unit: p.unit, cols: p.colsLabel });
  const note = p.note ? p.note(note0) : note0;
  const head = layoutHeader(rect, m.segments.map((s, k) => ({ name: s, color: segColor(k), shape: 'box' as const })), note);
  items.push(...head.items);

  // 形
  const x0 = L + LW, MW = rect.x + rect.w - x0, y0 = rect.y + MEKKO.legendH + (Math.round((head.height - 0.14) / 0.28) - 1) * 0.28;
  const labH = MEKKO.labelH;
  const MH = Math.max(1.6, rect.y + rect.h - y0 - labH);

  // 縦軸
  ([[0, '100%'], [0.5, '50%'], [1, '0%']] as const).forEach(([f, t]) =>
    items.push({ kind: 'text', x: x0 - 0.52, y: y0 + MH * f - 0.1, w: 0.46, h: 0.2, lines: [{ t, size: 9, color: SEC }], align: 'right', valign: 'middle' }));
  if (p.axisTitle !== false) items.push({
    kind: 'text', x: L, y: y0, w: LW - 0.6, h: 0.5,
    lines: [
      { t: slideText(locale, 'mixAxis', { cols: p.colsLabel }), size: 10, color: SEC },
      { t: slideText(locale, 'paren', { text: period }), size: 9, color: SEC },
    ],
    align: 'left', valign: 'top',
  });

  // 列
  let x = x0;
  const colX: number[] = [], colW: number[] = [];
  m.columns.forEach((r) => {
    const w = MW * r.share;
    colX.push(x); colW.push(w);
    let y = y0;
    r.mix.forEach((v, k) => {
      const h = MH * v;
      if (h <= 0.001) return;
      let fill = segColor(k);
      if (p.highlight >= 0 && k !== p.highlight) fill = GREYS[k % GREYS.length]!;
      const lines: TextLine[] = [];
      if (h >= 0.26 && w >= 0.5 && p.labels !== 'none') {
        lines.push({ t: segmentLabel(p.labels, v, r.tot, locale), size: 11, bold: true, color: textOn(fill) });
        const b = r.mixB[k];
        if (p.deltaLabels && b != null && b !== undefined && h >= 0.46) lines.push({ t: formatPt(v - b), size: 9, color: textOn(fill) });
      }
      const box: BoxItem = { kind: 'box', x, y, w, h, fill, line: WHITE, lines, align: 'center', valign: 'middle' };
      items.push(box);
      y += h;
    });
    const small = w < 0.9;
    const nm = small && textWidth(r.name, 10) > w ? r.name.slice(0, Math.max(1, Math.floor(w / (10 / 72)))) : r.name;
    const sub = slideText(locale, 'valueShare', { value: formatNumber(r.tot, locale), pct: Math.round(r.share * 100) + '%' });
    items.push({
      kind: 'text', x, y: y0 + MH + 0.04, w, h: labH,
      lines: [{ t: nm, size: small ? 9 : 10.5, bold: true, color: INK }, { t: sub, size: small ? 8 : 9, color: SEC }],
      align: 'center', valign: 'top',
    });
    x += w;
  });

  return {
    items,
    anchors: {
      columns: { keys: m.columns.map((c) => c.name), x: colX, w: colW },
      yScale: { y: y0, h: MH },
      gutter: { x: L, w: LW },
    },
  };
}

function segmentLabel(mode: MekkoLabelMode, v: number, tot: number, locale: Locale): string {
  const pct = Math.round(v * 100) + '%';
  if (mode === 'pct') return pct;
  const abs = formatNumber(v * tot, locale);
  return mode === 'abs' ? abs : slideText(locale, 'valueShare', { value: abs, pct });
}
