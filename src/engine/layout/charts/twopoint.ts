import { slideText } from '@/i18n/slide';
import { formatMetric } from '../../format';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { textWidth } from '../../text';
import { AXIS, FOCUS, INK, SEC, WHITE, seriesColor, textOn } from '../../theme';
import { endpoints, share } from '../../transform/ops';
import { rowSum } from '../../transform/matrix';
import { DIFF, signed, varianceData } from './clustered';
import { OTHER_GREY } from './bars';
import { TOTAL_CHANGE_H, totalChangeItem, totalChangeText } from './total-change';
import { categoryLabelsLeft, labelGutter, layoutHeader } from './common';
import { emphasis, envOf, type ChartCtx, type ChartLayout, unitNote } from './context';

const note = (ctx: ChartCtx, text: string): SceneItem => ({
  kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.4, lines: [{ t: text, size: 10, color: SEC }], align: 'left', valign: 'top',
});
const pct = (v: number) => Math.round(v * 100) + '%';

/**
 * 100%横棒：行＝棒（多くは最初と最後の年）、列＝内訳。内訳の順は最後の棒の大きい順（規模の大きい順に並べる、既定オン）。
 * 棒と棒の間は、内訳の境目を細い線で結ぶ（構成の移り変わりが追える）。合計ラベルは棒の右に。
 */
export const bar100: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  if (!m.rows.length || !m.cols.length) return { items: [note(ctx, slideText(ctx.locale, 'needTwoPoints'))], anchors: {} };
  const s = share(m);
  const last = s.current.values[s.rows.length - 1] ?? [];
  const order = m.cols.map((_, k) => k);
  if (ctx.control<boolean>('sort_by_size') ?? true) order.sort((a, b) => (last[b] ?? 0) - (last[a] ?? 0) || a - b);
  // 「その他」は最後に
  order.sort((a, b) => Number(m.cols[a] === slideText(ctx.locale, 'others')) - Number(m.cols[b] === slideText(ctx.locale, 'others')));
  const { series: PAL, greys: GREYS } = ctx.palette;
  const otherName = slideText(ctx.locale, 'others');
  const colorOf = (k: number) => (m.cols[k] === otherName ? OTHER_GREY : emphasis(env, m.cols[k]!, PAL[k % PAL.length]!, GREYS[k % GREYS.length]!));
  const showTotals = ctx.complement('total_labels');
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, order.map((k) => ({ name: m.cols[k]!, color: colorOf(k), shape: 'box' as const })), showTotals ? unitNote(ctx) : null);
  items.push(...head.items);
  const totals = m.rows.map((_, i) => rowSum(m.current.values[i]));
  const g = labelGutter(m.rows, ctx.rect.w);
  const right = showTotals ? Math.max(...totals.map((t) => textWidth(formatMetric(t, env.numberFormat), 10))) + 0.3 : 0.1;
  const plot: Rect = { x: ctx.rect.x + g, y: ctx.rect.y + head.height + 0.1, w: ctx.rect.w - g - right, h: ctx.rect.h - head.height - 0.2 };
  items.push(...categoryLabelsLeft(plot, m.rows, ctx.rect.x));
  const slot = plot.h / m.rows.length;
  const barH = Math.min(slot * 0.55, 0.85);
  const edges: number[][] = [];
  m.rows.forEach((_, i) => {
    const y = plot.y + slot * i + (slot - barH) / 2;
    let x = plot.x;
    const e: number[] = [];
    for (const k of order) {
      const v = s.current.values[i]?.[k] ?? 0;
      const w = plot.w * v;
      if (w > 0.001) {
        const fill = colorOf(k);
        const lines = w >= 0.42 && barH >= 0.22 ? [{ t: pct(v), size: 10, bold: true, color: textOn(fill) }] : [];
        items.push({ kind: 'box', x, y, w, h: barH, fill, line: WHITE, lines, align: 'center', valign: 'middle' });
      }
      x += w;
      e.push(x);
    }
    edges.push(e);
    if (showTotals) {
      items.push({ kind: 'text', x: plot.x + plot.w + 0.1, y: y + barH / 2 - 0.12, w: right - 0.1, h: 0.24, lines: [{ t: formatMetric(totals[i]!, env.numberFormat), size: 10, bold: true, color: INK }], align: 'left', valign: 'middle' });
    }
  });
  // 内訳の境目を結ぶ線（最後の境目＝100% は結ばない）
  for (let i = 0; i + 1 < edges.length; i++) {
    const yA = plot.y + slot * i + (slot + barH) / 2, yB = plot.y + slot * (i + 1) + (slot - barH) / 2;
    edges[i]!.slice(0, -1).forEach((xa, j) => items.push({ kind: 'line', x1: xa, y1: yA, x2: edges[i + 1]![j]!, y2: yB, color: AXIS.base, width: 0.75, dash: true }));
  }
  return { items, anchors: {} };
};

/**
 * 差分バー：基準と比較先の差だけを横棒で（NarratiX の buildVarianceData_ と色）。
 * プラスは緑で右へ、マイナスは赤で左へ。差の値は棒の先に。強調した項目以外は薄くする。
 */
export const varianceBar: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const data = varianceData(ctx);
  if (!data || !data.items.length) return { items: [note(ctx, slideText(ctx.locale, 'needTwoRows'))], anchors: {} };
  const hl = ctx.control<string>('highlight');
  const focus = hl && data.items.some((d) => d.name === hl) ? hl : null;
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, [], unitNote(ctx), ctx.periodInHeader ? null : slideText(ctx.locale, 'diffBetween', { from: data.baseLabel, to: data.compareLabel }));
  items.push(...head.items);
  const tc = totalChangeText(ctx, data.items, data.baseLabel, data.compareLabel);
  if (tc) items.push(totalChangeItem(ctx, tc, ctx.rect.y + head.height));
  const tcH = tc ? TOTAL_CHANGE_H : 0;
  const cats = data.items.map((d) => d.name);
  const label = (v: number) => signed(v);
  const lw = Math.max(...data.items.map((d) => textWidth(label(d.diff), 10))) + 0.15;
  const hasNeg = data.items.some((d) => d.diff < 0), hasPos = data.items.some((d) => d.diff > 0);
  const g = labelGutter(cats, ctx.rect.w);
  const plot: Rect = {
    x: ctx.rect.x + g + (hasNeg ? lw : 0), y: ctx.rect.y + head.height + tcH + 0.1,
    w: ctx.rect.w - g - (hasNeg ? lw : 0) - (hasPos ? lw : 0.1), h: ctx.rect.h - head.height - tcH - 0.2,
  };
  items.push(...categoryLabelsLeft(plot, cats, ctx.rect.x));
  const scale = valueScale([0, ...data.items.map((d) => d.diff)]);
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  const zero = xOf(Math.min(Math.max(0, scale.min), scale.max));
  const slot = plot.h / cats.length;
  const barH = Math.min(slot * 0.6, 0.5);
  data.items.forEach((d, i) => {
    const y = plot.y + slot * i + (slot - barH) / 2;
    const dim = !!focus && d.name !== focus;
    const color = d.diff > 0 ? DIFF.up : d.diff < 0 ? DIFF.down : DIFF.zero;
    const p = xOf(d.diff);
    const w = Math.abs(p - zero);
    if (w > 0.0005) items.push({ kind: 'box', x: Math.min(p, zero), y, w, h: barH, fill: dim ? FOCUS.otherBar : color });
    const t = label(d.diff);
    const pos = d.diff >= 0;
    items.push({ kind: 'text', x: pos ? p + 0.06 : p - 0.06 - lw, y: y + barH / 2 - 0.12, w: lw, h: 0.24, lines: [{ t, size: 10, bold: true, color: dim ? SEC : color }], align: pos ? 'left' : 'right', valign: 'middle' });
  });
  items.push({ kind: 'line', x1: zero, y1: plot.y, x2: zero, y2: plot.y + plot.h, color: '#6B7280', width: 1 });
  return { items, anchors: {} };
};

/** ラベルの縦位置を、重ならないように最小の間隔で押し広げる（並び順は保つ） */
export function spreadLabels(ys: number[], gap: number, lo: number, hi: number): number[] {
  const idx = ys.map((_, i) => i).sort((a, b) => ys[a]! - ys[b]!);
  const out = [...ys];
  for (let j = 1; j < idx.length; j++) {
    const a = idx[j - 1]!, b = idx[j]!;
    if (out[b]! - out[a]! < gap) out[b] = out[a]! + gap;
  }
  // 下にはみ出したら、下から押し戻す
  const lastI = idx[idx.length - 1];
  if (lastI != null && out[lastI]! > hi) {
    out[lastI] = hi;
    for (let j = idx.length - 2; j >= 0; j--) {
      const a = idx[j]!, b = idx[j + 1]!;
      if (out[b]! - out[a]! < gap) out[a] = out[b]! - gap;
    }
  }
  return out.map((y) => Math.max(lo, y));
}
