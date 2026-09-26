import { growthLabel } from './rate-label';
import { TOTAL_CHANGE_H, totalChangeItem, totalChangeText } from './total-change';
import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate } from '../../format';
import type { SceneItem } from '../../scene';
import { AXIS, FOCUS, SEC } from '../../theme';
import { cagr } from '../../transform/cagr';
import { valueScale } from '../../scale';
import type { Rect } from '../../scene';
import { categoryAxis, type XLabelMode, layoutHeader, tickFormatter, tickGutter, verticalValueAxis } from './common';
import { envOf, showLabel, type ChartCtx, type ChartLayout } from './context';

const BASE_COLOR = '#9AA8B5';
export const DIFF = { up: '#2E7D32', down: '#C62828', zero: '#9AA0A6' };

const yearOf = (label: string) => {
  const n = parseInt(String(label).trim(), 10);
  return Number.isNaN(n) || n < 1900 || n > 2100 ? null : n;
};

/** 差のラベル（NarratiX の formatVarianceSignedValue_：小数1桁まで、末尾の .0 は消す） */
export const signed = (v: number) => {
  if (Math.abs(v) < 1e-9) return '0';
  const r = Math.round(Math.abs(v) * 10) / 10;
  const s = Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(1);
  return (v > 0 ? '+' : '-') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * 基準と比較先の行（NarratiX の buildVarianceData_ と同じ）。既定は基準＝最初の行、比較先＝最後の行。
 * 同じ行が選ばれたら既定に戻す。どちらかが空欄・数値でない列は除く。差の降順（既定）・昇順、同じ差なら入力順。
 */
export function varianceData(ctx: ChartCtx) {
  const m = ctx.matrix;
  if (m.rows.length < 2) return null;
  let bi = m.rows.indexOf(ctx.control<string>('base_target') ?? '');
  let ci = m.rows.indexOf(ctx.control<string>('compare_target2') ?? '');
  if (bi < 0) bi = 0;
  if (ci < 0) ci = m.rows.length - 1;
  if (bi === ci) { bi = 0; ci = m.rows.length - 1; }
  const base = m.current.values[bi] ?? [];
  const comp = m.current.values[ci] ?? [];
  const items = m.cols
    .map((name, k) => ({ name, base: base[k], compare: comp[k], order: k }))
    .filter((x): x is { name: string; base: number; compare: number; order: number } =>
      x.base != null && x.compare != null && Number.isFinite(x.base) && Number.isFinite(x.compare))
    .map((x) => ({ ...x, diff: x.compare - x.base }));
  const sort = ctx.control<string>('variance_sort') ?? 'desc';
  items.sort((a, b) => (sort === 'asc' ? a.diff - b.diff : b.diff - a.diff) || a.order - b.order);
  return { baseLabel: m.rows[bi]!, compareLabel: m.rows[ci]!, items };
}

/**
 * 集合縦棒（開始と終了の比較）：項目ごとに基準（グレー）と比較先（紺）を並べる。
 * 増減ラベル（↑ +12）と、行が年なら CAGR を添えられる。強調した項目以外は薄くする。
 */
export const clusteredColumn: ChartLayout = (ctx) => {
  const env0 = envOf(ctx);
  const data = varianceData(ctx);
  if (!data || !data.items.length) {
    return { items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.4, lines: [{ t: slideText(ctx.locale, 'needTwoRows'), size: 10, color: SEC }], align: 'left', valign: 'top' }], anchors: {} };
  }
  const hl = ctx.control<string>('highlight');
  const focus = hl && data.items.some((d) => d.name === hl) ? hl : null;
  const legend = [{ name: data.baseLabel, color: BASE_COLOR }, { name: data.compareLabel, color: FOCUS.primary }];
  const values = data.items.flatMap((d) => [d.base, d.compare]);
  const cats = data.items.map((d) => d.name);
  const diffOn = ctx.complement('delta_labels');
  const y0 = yearOf(data.baseLabel), y1 = yearOf(data.compareLabel);
  const cagrOn = ctx.complement('cagr_note') && y0 != null && y1 != null && y1 > y0;
  const fmt = tickFormatter(env0.numberFormat);
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, legend.map((l) => ({ ...l, shape: 'box' as const })), ctx.unit ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null);
  items.push(...head.items);
  const scale = valueScale(values);
  const g = tickGutter(scale, fmt);
  const tc = totalChangeText(ctx, data.items, data.baseLabel, data.compareLabel);
  if (tc) items.push(totalChangeItem(ctx, tc, ctx.rect.y + head.height));
  const top = ctx.rect.y + head.height + (tc ? TOTAL_CHANGE_H : 0) + (diffOn ? 0.25 : 0);
  const ax = categoryAxis(ctx.control<XLabelMode>('x_labels'), cats, ctx.rect.w - g - 0.1);
  const plot: Rect = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g - 0.1, h: ctx.rect.y + ctx.rect.h - top - ax.h - (cagrOn ? 0.42 : 0) };
  items.push(...verticalValueAxis(plot, scale, fmt, env0.gridlines));
  items.push(...ax.draw(plot));
  const f = { plot, scale };
  const slot = f.plot.w / cats.length;
  const group = Math.min(slot * 0.72, 1.6);
  const gap = Math.min(0.04, group * 0.05);
  const bar = (group - gap) / 2;
  const yOf = (v: number) => f.plot.y + f.plot.h * (1 - f.scale.ratio(v));
  const zero = yOf(Math.min(Math.max(0, f.scale.min), f.scale.max));
  data.items.forEach((d, i) => {
    const x0 = f.plot.x + slot * i + (slot - group) / 2;
    const dim = focus && d.name !== focus;
    [[d.base, dim ? FOCUS.otherLine : BASE_COLOR], [d.compare, dim ? FOCUS.otherBar : FOCUS.primary]].forEach(([v, fill], j) => {
      const p = yOf(v as number);
      const h = Math.abs(p - zero);
      if (h > 0.0005) items.push({ kind: 'box', x: x0 + j * (bar + gap), y: Math.min(p, zero), w: bar, h, fill: fill as string });
      if (showLabel(env0, i, data.items.map((x) => x.compare), d.name === focus)) {
        items.push({ kind: 'text', x: x0 + j * (bar + gap) + bar / 2 - 0.5, y: (v as number) >= 0 ? p - 0.21 : p + 0.02, w: 1, h: 0.19, lines: [{ t: formatMetric(v as number, env0.numberFormat), size: 8, color: AXIS.label }], align: 'center', valign: 'middle' });
      }
    });
    const top = Math.min(yOf(d.base), yOf(d.compare), zero);
    if (diffOn) {
      const color = d.diff > 0 ? DIFF.up : d.diff < 0 ? DIFF.down : DIFF.zero;
      const t = d.diff > 0 ? slideText(ctx.locale, 'diffUp', { value: signed(d.diff) }) : d.diff < 0 ? slideText(ctx.locale, 'diffDown', { value: signed(d.diff) }) : '0';
      items.push({ kind: 'text', x: x0 + group / 2 - 0.7, y: top - (env0.dataLabels ? 0.44 : 0.25), w: 1.4, h: 0.22, lines: [{ t, size: 10, bold: true, color: dim ? SEC : color }], align: 'center', valign: 'middle' });
    }
    if (cagrOn) {
      const g = cagr(d.base, d.compare, y1! - y0!);
      items.push({ kind: 'text', x: f.plot.x + slot * i, y: f.plot.y + f.plot.h + ax.h - 0.02, w: slot, h: 0.2, lines: [{ t: growthLabel(ctx.locale, y0!, y1!).short(g != null && g > 0 ? '+' + formatRate(g) : formatRate(g)), size: 9, color: SEC }], align: 'center', valign: 'middle' });
    }
  });
  if (cagrOn) {
    // CAGR の期間は凡例の右に（単位の注記と重ならないよう、左寄せの注記として）
    items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y + ctx.rect.h - 0.22, w: ctx.rect.w, h: 0.2, lines: [{ t: growthLabel(ctx.locale, y0!, y1!).range, size: 8, color: SEC }], align: 'right', valign: 'middle' });
  }
  return { items, anchors: {} };
};
