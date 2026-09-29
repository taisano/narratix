import { spanLabel } from './rate-label';
import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate } from '../../format';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { AXIS, FOCUS, INK, SEC } from '../../theme';
import { textWidth } from '../../text';
import { growthSpan, spanRate } from '../../transform/cagr';
import { categoryAxis, type XLabelMode, layoutHeader, tickFormatter, tickGutter, verticalValueAxis } from './common';
import { emphasis, envOf, seriesOf, showLabel, type ChartLayout, unitNote } from './context';

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
  const colorOf = (i: number, name: string) => emphasis(env, name, ctx.palette.line(i), FOCUS.otherLine, ctx.palette.primary);
  const fmt = tickFormatter(env.numberFormat);
  const items: SceneItem[] = [];

  const head = layoutHeader(ctx.rect, series.length > 1 ? series.map((s, i) => ({ name: s.name, color: colorOf(i, s.name), shape: 'line' as const })) : [],
    unitNote(ctx));
  items.push(...head.items);

  const range = ctx.complement('cagr_note') ? growthSpan(cats) : null;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const scale = valueScale(all);
  const gutter = tickGutter(scale, fmt);
  const cagrHead = range ? spanLabel(ctx.locale, range).range : '';
  // 右の欄：系列名＋率と見出しが PowerPoint のフォントでも1行に収まる幅
  const right = range
    ? Math.min(2.4, Math.max(textWidth(cagrHead, 8) * 1.25 + 0.3, ...series.map((s) => textWidth(s.name + ' 00.0%', 9) * 1.15 + 0.25)))
    : 0.15;
  const ax = categoryAxis(ctx.control<XLabelMode>('x_labels'), cats, ctx.rect.w - gutter - right);
  const plot: Rect = { x: ctx.rect.x + gutter, y: ctx.rect.y + head.height, w: ctx.rect.w - gutter - right, h: ctx.rect.h - head.height - ax.h };
  items.push(...verticalValueAxis(plot, scale, fmt, env.gridlines));
  items.push(...ax.draw(plot));

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
  // 値ラベルは後でまとめて置く（同じ年のラベルどうしが重ならないように上下にずらす）
  const pending: { ci: number; x: number; y: number; t: string; isHl: boolean }[] = [];
  const cagrLabels: { y: number; name: string; text: string; color: string }[] = [];
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
      if (showLabel(env, ci, s.values, isHl)) {
        pending.push({ ci, x: p.x, y: p.y - 0.3, t: formatMetric(v, env.numberFormat), isHl });
      }
    });
    if (range) {
      const endV = s.values[range.toIndex];
      const g = spanRate(range, s.values[range.fromIndex], endV);
      const anchorV = endV ?? [...s.values].reverse().find((x) => x != null);
      if (anchorV != null) cagrLabels.push({ y: pt(0, anchorV).y, name: s.name, text: formatRate(g), color: isHl || !env.highlight ? color : SEC });
    }
  }

  // 値ラベル：同じ年（横位置）のラベルを下から並べ、近すぎれば上の方を上にずらす（点や線に重ならない向き）。
  // 上にはみ出す時は全体を下に戻す
  const LABEL_GAP = 0.17;
  for (const ci of [...new Set(pending.map((l) => l.ci))]) {
    const col = pending.filter((l) => l.ci === ci).sort((a, b) => b.y - a.y);
    for (let k = 1; k < col.length; k++) col[k]!.y = Math.min(col[k]!.y, col[k - 1]!.y - LABEL_GAP);
    const over = col.length ? plot.y - 0.28 - col[col.length - 1]!.y : 0;
    if (over > 0) col.forEach((l) => { l.y += over; });
    for (const l of col) items.push({ kind: 'text', x: l.x - 0.5, y: l.y, w: 1, h: 0.2, lines: [{ t: l.t, size: 9, bold: l.isHl, color: l.isHl ? INK : AXIS.label }], align: 'center', valign: 'middle' });
  }

  // CAGR：右端に系列ごと。重ならないように上から詰める
  if (range) {
    items.push({ kind: 'text', x: plot.x + plot.w + 0.12, y: plot.y - 0.04, w: right - 0.12, h: 0.2, lines: [{ t: cagrHead, size: 8, bold: true, color: SEC }], align: 'left', valign: 'middle' });
    cagrLabels.sort((a, b) => a.y - b.y);
    let minY = plot.y + 0.2;
    for (const c of cagrLabels) {
      const y = Math.max(c.y - 0.1, minY);
      items.push({ kind: 'text', x: plot.x + plot.w + 0.12, y, w: right - 0.12, h: 0.2, lines: [{ t: c.name + ' ' + c.text, size: 9, bold: true, color: c.color }], align: 'left', valign: 'middle' });
      minY = y + 0.2;
    }
  }
  return { items, anchors: { seriesColors: Object.fromEntries(series.map((s, i) => [s.name, ctx.palette.line(i)])), focusColor: ctx.palette.primary } };
};
