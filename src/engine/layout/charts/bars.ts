import { slideText } from '@/i18n/slide';
import { formatMetric } from '../../format';
import { valueScale, type ValueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { AXIS, FOCUS, INK, seriesColor } from '../../theme';
import {
  categoryAxis, categoryLabelsLeft, type XLabelMode, horizontalValueAxis, labelGutter, layoutHeader, tickFormatter, tickGutter, verticalValueAxis,
} from './common';
import { envOf, seriesOf, showLabel, type ChartCtx, type ChartEnv, type ChartLayout, type Series } from './context';

type Orientation = 'vertical' | 'horizontal';

/** 「その他」の色 */
export const OTHER_GREY = '#B8BEC4';

/** 集合棒の図形。0 の線を基準に、プラスは上（右）、マイナスは下（左）へ伸ばす */
function barItems(o: {
  orientation: Orientation; plot: Rect; scale: ValueScale; cats: string[]; series: Series[];
  color: (si: number, ci: number, name: string) => string; env: ChartEnv; emphasize: (si: number, ci: number) => boolean;
}): SceneItem[] {
  const { plot, scale, cats, series, env } = o;
  const items: SceneItem[] = [];
  const vertical = o.orientation === 'vertical';
  const slot = (vertical ? plot.w : plot.h) / Math.max(1, cats.length);
  const group = Math.min(slot * 0.72, vertical ? 1.8 : 1.1);
  const gap = series.length > 1 ? Math.min(0.04, group * 0.05) : 0;
  const bar = (group - gap * (series.length - 1)) / Math.max(1, series.length);
  const pos = (v: number) => (vertical ? plot.y + plot.h * (1 - scale.ratio(v)) : plot.x + plot.w * scale.ratio(v));
  const zero = pos(Math.min(Math.max(0, scale.min), scale.max));
  cats.forEach((_, ci) => {
    const start = (vertical ? plot.x : plot.y) + slot * ci + (slot - group) / 2;
    series.forEach((s, si) => {
      const v = s.values[ci];
      if (v == null) return;
      const a = start + si * (bar + gap);
      const p = pos(v);
      const lo = Math.min(p, zero), len = Math.abs(p - zero);
      const fill = o.color(si, ci, s.name);
      if (len > 0.0005) items.push(vertical ? { kind: 'box', x: a, y: lo, w: bar, h: len, fill } : { kind: 'box', x: lo, y: a, w: len, h: bar, fill });
      const em = o.emphasize(si, ci);
      if (showLabel(env, ci, s.values, em)) {
        const t = formatMetric(v, env.numberFormat);
        const line = { t, size: 9, bold: em, color: em ? INK : AXIS.label };
        if (vertical) {
          const y = v >= 0 ? p - 0.22 : p + 0.02;
          items.push({ kind: 'text', x: a + bar / 2 - 0.5, y, w: 1, h: 0.2, lines: [line], align: 'center', valign: 'middle' });
        } else {
          const w = 1;
          items.push({ kind: 'text', x: v >= 0 ? p + 0.05 : p - 0.05 - w, y: a + bar / 2 - 0.1, w, h: 0.2, lines: [line], align: v >= 0 ? 'left' : 'right', valign: 'middle' });
        }
      }
    });
  });
  return items;
}

/** 縦（横）の棒グラフの枠：凡例・値軸・項目名・描画領域 */
export function frame(ctx: ChartCtx, orientation: Orientation, values: number[], legend: { name: string; color: string }[], leftNote: string | null, cats: string[]) {
  const env = envOf(ctx);
  const fmt = tickFormatter(env.numberFormat);
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, legend.map((l) => ({ ...l, shape: 'box' as const })), ctx.unit ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null, leftNote);
  items.push(...head.items);
  const scale = valueScale(values);
  const top = ctx.rect.y + head.height;
  let plot: Rect;
  let ax: ReturnType<typeof categoryAxis> | null = null;
  if (orientation === 'vertical') {
    const g = tickGutter(scale, fmt);
    ax = categoryAxis(ctx.control<XLabelMode>('x_labels'), cats, ctx.rect.w - g - 0.1);
    plot = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g - 0.1, h: ctx.rect.h - head.height - ax.h };
    items.push(...verticalValueAxis(plot, scale, fmt, env.gridlines));
  } else {
    const g = labelGutter(cats, ctx.rect.w);
    const right = env.dataLabels ? 0.6 : 0.2;
    plot = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g - right, h: ctx.rect.h - head.height - 0.3 };
    items.push(...horizontalValueAxis(plot, scale, fmt, env.gridlines));
  }
  return { env, items, plot, scale, labelsBelow: () => (ax ? ax.draw(plot) : []) };
}

/** 縦棒・横棒（推移）：行＝項目（期間）、列＝系列の集合棒（NarratiX の drawTrendBarColumnOnSlide_ に準拠） */
export const groupedBars = (orientation: Orientation): ChartLayout => (ctx) => {
  const env0 = envOf(ctx);
  const series = seriesOf(ctx.matrix);
  const colorOf = (si: number, name: string) => (env0.highlight ? (name === env0.highlight ? FOCUS.primary : FOCUS.otherBar) : seriesColor(si));
  const values = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const legend = series.length > 1 ? series.map((s, i) => ({ name: s.name, color: colorOf(i, s.name) })) : [];
  const cats = ctx.matrix.rows;
  const f = frame(ctx, orientation, values, legend, null, cats);
  f.items.push(...(orientation === 'vertical' ? f.labelsBelow() : categoryLabelsLeft(f.plot, cats, ctx.rect.x)));
  f.items.push(...barItems({
    orientation, plot: f.plot, scale: f.scale, cats, series, env: f.env,
    color: (si, _ci, name) => colorOf(si, name),
    emphasize: (si) => !!f.env.highlight && series[si]!.name === f.env.highlight,
  }));
  return { items: f.items, anchors: {} };
};

/**
 * 比較の対象の行を選び、その行の値で列（系列）を並べる（NarratiX の buildComparisonData_ と同じ）。
 * 対象の既定は最後の行。数値でない列は除く。並び順は降順（既定）・昇順・入力順。
 */
export function comparisonData(ctx: ChartCtx): { target: string; items: { name: string; value: number }[] } {
  const m = ctx.matrix;
  const want = ctx.control<string>('compare_target');
  let ri = want ? m.rows.indexOf(want) : -1;
  if (ri < 0) ri = m.rows.length - 1;
  const row = m.current.values[ri] ?? [];
  const items = m.cols
    .map((name, k) => ({ name, value: row[k], order: k }))
    .filter((x): x is { name: string; value: number; order: number } => x.value != null && Number.isFinite(x.value));
  const sort = ctx.control<string>('rank_sort') ?? 'desc';
  if (sort === 'desc') items.sort((a, b) => b.value - a.value || a.order - b.order);
  else if (sort === 'asc') items.sort((a, b) => a.value - b.value || a.order - b.order);
  // 「その他」（上位だけ表示でまとめた残り）は順位の外なので最後に
  const other = slideText(ctx.locale, 'others');
  items.sort((a, b) => Number(a.name === other) - Number(b.name === other));
  return { target: m.rows[ri] ?? '', items: items.map(({ name, value }) => ({ name, value })) };
}

/** 横棒ランキング・縦棒比較：1系列。強調した項目だけ濃紺、他はグレー。強調なしなら全部濃紺 */
export const ranking = (orientation: Orientation): ChartLayout => (ctx) => {
  const { target, items: data } = comparisonData(ctx);
  const hl = ctx.control<string>('highlight');
  const focus = hl && data.some((d) => d.name === hl) ? hl : null;
  const leftNote = target ? slideText(ctx.locale, 'asOf', { target }) : null;
  const cats = data.map((d) => d.name);
  const f = frame(ctx, orientation, data.map((d) => d.value), [], leftNote, cats);
  if (orientation === 'horizontal') f.items.push(...categoryLabelsLeft(f.plot, cats, ctx.rect.x));
  else f.items.push(...f.labelsBelow());
  const series: Series[] = [{ name: 'value', values: data.map((d) => d.value) }];
  f.items.push(...barItems({
    orientation, plot: f.plot, scale: f.scale, cats, series, env: f.env,
    color: (_si, ci) => (cats[ci] === slideText(ctx.locale, 'others') ? OTHER_GREY : focus ? (cats[ci] === focus ? FOCUS.primary : FOCUS.otherBar) : FOCUS.primary),
    emphasize: (_si, ci) => !!focus && cats[ci] === focus,
  }));
  if (ctx.complement('reference_line') && data.length) {
    const avg = data.reduce((a, b) => a + b.value, 0) / data.length;
    const r = f.scale.ratio(avg);
    const label = slideText(ctx.locale, 'average', { value: formatMetric(avg, f.env.numberFormat) });
    if (orientation === 'vertical') {
      const y = f.plot.y + f.plot.h * (1 - r);
      f.items.push({ kind: 'line', x1: f.plot.x, y1: y, x2: f.plot.x + f.plot.w, y2: y, color: AXIS.reference, width: 1, dash: true });
      f.items.push({ kind: 'text', x: f.plot.x + f.plot.w - 2, y: y - 0.24, w: 2, h: 0.2, lines: [{ t: label, size: 9, color: AXIS.reference }], align: 'right', valign: 'middle' });
    } else {
      const x = f.plot.x + f.plot.w * r;
      f.items.push({ kind: 'line', x1: x, y1: f.plot.y, x2: x, y2: f.plot.y + f.plot.h, color: AXIS.reference, width: 1, dash: true });
      f.items.push({ kind: 'text', x: x + 0.05, y: f.plot.y - 0.22, w: 2, h: 0.2, lines: [{ t: label, size: 9, color: AXIS.reference }], align: 'left', valign: 'middle' });
    }
  }
  return { items: f.items, anchors: {} };
};
