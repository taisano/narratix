import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate } from '../../format';
import { shareScale, valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { INK, textOn, WHITE } from '../../theme';
import { cagr, timeRange } from '../../transform/cagr';
import { rowSum } from '../../transform/matrix';
import { CATEGORY_H, categoryLabelsBelow, layoutHeader, tickFormatter, tickGutter, verticalValueAxis } from './common';
import { envOf, seriesOf, type ChartLayout } from './context';

const pct = (v: number) => Math.round(v * 100) + '%';

/**
 * 積み上げ縦棒（mode='value'）と 100% 積み上げ縦棒（mode='share'）。
 * 行＝棒（期間）、列＝積み上げる系列。色は構成系の配色（Mekko と同じ）。強調した系列以外はグレー。
 * マイナスの値は 0 より下に積む（value のみ）。
 */
export const stackedColumns = (mode: 'value' | 'share'): ChartLayout => (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const cats = m.rows;
  const series = seriesOf(m);
  const { series: PAL, greys: GREYS } = ctx.palette;
  const colorOf = (k: number, name: string) => (env.highlight && name !== env.highlight ? GREYS[k % GREYS.length]! : PAL[k % PAL.length]!);
  const totals = cats.map((_, i) => rowSum(m.current.values[i]));
  const items: SceneItem[] = [];

  // CAGR 注記は合計の CAGR（横軸が年のとき）
  const range = mode === 'value' && ctx.complement('cagr_note') ? timeRange(cats) : null;
  const note = [
    range ? slideText(ctx.locale, 'cagrRange', { from: range.from, to: range.to }) + ' ' + formatRate(cagr(totals[range.fromIndex], totals[range.toIndex], range.to - range.from)) : null,
    ctx.unit && mode === 'value' ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null,
  ].filter(Boolean).join('　') || null;
  const head = layoutHeader(ctx.rect, series.map((s, k) => ({ name: s.name, color: colorOf(k, s.name), shape: 'box' as const })), note);
  items.push(...head.items);

  const pos = cats.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const neg = cats.map((_, i) => series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0));
  const scale = mode === 'share' ? shareScale() : valueScale([...pos, ...neg]);
  const fmt = mode === 'share' ? pct : tickFormatter(env.numberFormat);
  const showTotals = ctx.complement('total_labels');
  const g = tickGutter(scale, fmt);
  const top = ctx.rect.y + head.height + (showTotals ? 0.25 : 0);
  const plot: Rect = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g - 0.1, h: ctx.rect.y + ctx.rect.h - CATEGORY_H - top };
  items.push(...verticalValueAxis(plot, scale, fmt, mode === 'share' ? 'off' : env.gridlines));
  items.push(...categoryLabelsBelow(plot, cats));

  const slot = plot.w / Math.max(1, cats.length);
  const barW = Math.min(slot * 0.6, 1.4);
  const yOf = (v: number) => plot.y + plot.h * (1 - scale.ratio(v));
  cats.forEach((_, i) => {
    const x = plot.x + slot * i + (slot - barW) / 2;
    const tot = totals[i]!;
    let up = 0, down = 0;
    series.forEach((s, k) => {
      const raw = s.values[i];
      if (raw == null || raw === 0) return;
      const v = mode === 'share' ? (tot > 0 ? Math.max(0, raw) / pos[i]! : 0) : raw;
      if (v === 0) return;
      const from = v > 0 ? up : down;
      const to = from + v;
      if (v > 0) up = to; else down = to;
      const y1 = yOf(Math.max(from, to)), y2 = yOf(Math.min(from, to));
      const h = y2 - y1;
      const fill = colorOf(k, s.name);
      const lines = env.dataLabels && h >= 0.22 && barW >= 0.35
        ? [{ t: mode === 'share' ? pct(v) : formatMetric(raw, env.numberFormat), size: 9, bold: true, color: textOn(fill) }]
        : [];
      items.push({ kind: 'box', x, y: y1, w: barW, h, fill, line: WHITE, lines, align: 'center', valign: 'middle' });
    });
    if (showTotals) {
      const y = yOf(mode === 'share' ? 1 : up) - 0.24;
      items.push({ kind: 'text', x: x - 0.3, y, w: barW + 0.6, h: 0.2, lines: [{ t: formatMetric(tot, env.numberFormat), size: 9, bold: true, color: INK }], align: 'center', valign: 'middle' });
    }
  });
  return { items, anchors: { yScale: { y: plot.y, h: plot.h } } };
};
