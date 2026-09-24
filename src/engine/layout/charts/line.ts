import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate } from '../../format';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { AXIS, FOCUS, INK, SEC, seriesColor } from '../../theme';
import { cagr, timeRange } from '../../transform/cagr';
import { CATEGORY_H, categoryLabelsBelow, layoutHeader, tickFormatter, tickGutter, verticalValueAxis } from './common';
import { envOf, seriesOf, type ChartLayout } from './context';

const R = 0.045, R_HL = 0.058;

/**
 * 折れ線（NarratiX の drawTrendLineOnSlide_ に準拠）。
 * 空欄で線を途切れさせる。強調系列は濃紺・太線で最前面、他はグレー。強調系列は常にマーカーを付ける。
 */
export const layoutLine: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const cats = m.rows;
  const series = seriesOf(m);
  const markers = (ctx.control<boolean>('line_markers') ?? true) !== false;
  const colorOf = (i: number, name: string) => (env.highlight ? (name === env.highlight ? FOCUS.primary : FOCUS.otherLine) : seriesColor(i));
  const fmt = tickFormatter(env.numberFormat);
  const items: SceneItem[] = [];

  const head = layoutHeader(ctx.rect, series.length > 1 ? series.map((s, i) => ({ name: s.name, color: colorOf(i, s.name), shape: 'line' as const })) : [],
    ctx.unit ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null);
  items.push(...head.items);

  const range = ctx.complement('cagr_note') ? timeRange(cats) : null;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const scale = valueScale(all);
  const gutter = tickGutter(scale, fmt);
  const right = range ? 1.0 : 0.15;
  const plot: Rect = { x: ctx.rect.x + gutter, y: ctx.rect.y + head.height, w: ctx.rect.w - gutter - right, h: ctx.rect.h - head.height - CATEGORY_H };
  items.push(...verticalValueAxis(plot, scale, fmt, env.gridlines));
  items.push(...categoryLabelsBelow(plot, cats));

  const slot = plot.w / Math.max(1, cats.length);
  const pt = (i: number, v: number) => ({ x: plot.x + slot * (i + 0.5), y: plot.y + plot.h * (1 - scale.ratio(v)) });

  // 平均の参照線
  if (ctx.complement('reference_line') && all.length) {
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    const y = pt(0, avg).y;
    items.push({ kind: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, color: AXIS.reference, width: 1, dash: true });
    items.push({ kind: 'text', x: plot.x + plot.w - 2, y: y - 0.24, w: 2, h: 0.2, lines: [{ t: slideText(ctx.locale, 'average', { value: formatMetric(avg, env.numberFormat) }), size: 9, color: AXIS.reference }], align: 'right', valign: 'middle' });
  }

  // 強調系列を最後に描く（最前面）
  const order = series.map((s, i) => ({ s, i })).sort((a, b) => Number(a.s.name === env.highlight) - Number(b.s.name === env.highlight));
  const labelStack = new Map<string, number>();
  const cagrLabels: { y: number; text: string; color: string }[] = [];
  for (const { s, i } of order) {
    const isHl = s.name === env.highlight;
    const color = colorOf(i, s.name);
    let last: { x: number; y: number } | null = null;
    s.values.forEach((v, ci) => {
      if (v == null) { last = null; return; }
      const p = pt(ci, v);
      if (last) items.push({ kind: 'line', x1: last.x, y1: last.y, x2: p.x, y2: p.y, color, width: isHl ? 3 : 1.75 });
      last = p;
    });
    s.values.forEach((v, ci) => {
      if (v == null) return;
      const p = pt(ci, v);
      if (markers || isHl) { const r = isHl ? R_HL : R; items.push({ kind: 'ellipse', x: p.x - r, y: p.y - r, w: r * 2, h: r * 2, fill: color }); }
      if (env.dataLabels) {
        const t = formatMetric(v, env.numberFormat);
        const key = ci + '|' + t;
        const n = labelStack.get(key) ?? 0;
        labelStack.set(key, n + 1);
        items.push({ kind: 'text', x: p.x - 0.5, y: p.y - 0.3 - n * 0.16, w: 1, h: 0.2, lines: [{ t, size: 9, bold: isHl, color: isHl ? INK : AXIS.label }], align: 'center', valign: 'middle' });
      }
    });
    if (range) {
      const endV = s.values[range.toIndex];
      const g = cagr(s.values[range.fromIndex], endV, range.to - range.from);
      const anchorV = endV ?? [...s.values].reverse().find((x) => x != null);
      if (anchorV != null) cagrLabels.push({ y: pt(0, anchorV).y, text: formatRate(g), color: isHl || !env.highlight ? color : SEC });
    }
  }

  // CAGR：右端に系列ごと。重ならないように上から詰める
  if (range) {
    items.push({ kind: 'text', x: plot.x + plot.w + 0.1, y: plot.y - 0.3, w: right - 0.05, h: 0.22, lines: [{ t: slideText(ctx.locale, 'cagrRange', { from: range.from, to: range.to }), size: 8, color: SEC }], align: 'left', valign: 'middle' });
    cagrLabels.sort((a, b) => a.y - b.y);
    let minY = plot.y - 0.05;
    for (const c of cagrLabels) {
      const y = Math.max(c.y - 0.1, minY);
      items.push({ kind: 'text', x: plot.x + plot.w + 0.1, y, w: right - 0.05, h: 0.2, lines: [{ t: c.text, size: 9, bold: true, color: c.color }], align: 'left', valign: 'middle' });
      minY = y + 0.19;
    }
  }
  return { items, anchors: {} };
};
