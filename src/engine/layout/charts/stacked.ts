import { growthLabel } from './rate-label';
import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate } from '../../format';
import { shareScale, valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { INK, textOn, WHITE } from '../../theme';
import { textWidth } from '../../text';
import { spreadLabels } from './twopoint';
import { OTHER_GREY } from './bars';
import { cagr, timeRange } from '../../transform/cagr';
import { rowSum } from '../../transform/matrix';
import { categoryAxis, type XLabelMode, layoutHeader, tickFormatter, tickGutter, verticalValueAxis } from './common';
import { envOf, seriesOf, showLabel, type ChartLayout } from './context';

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
  const otherName = slideText(ctx.locale, 'others');
  const colorOf = (k: number, name: string) => (name === otherName ? OTHER_GREY : env.highlight && name !== env.highlight ? GREYS[k % GREYS.length]! : PAL[k % PAL.length]!);
  const totals = cats.map((_, i) => rowSum(m.current.values[i]));
  const items: SceneItem[] = [];

  // CAGR 注記は合計の CAGR（横軸が年のとき）
  const range = mode === 'value' && ctx.complement('cagr_note') ? timeRange(cats) : null;
  const note = [
    range ? growthLabel(ctx.locale, range.from, range.to).range + ' ' + slideText(ctx.locale, 'total') + ' ' + formatRate(cagr(totals[range.fromIndex], totals[range.toIndex], range.to - range.from)) : null,
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
  // 系列ごとの CAGR（最後の棒の右に、各色の高さで）。その分だけ右を空ける
  const seriesRates = range ? series.map((s) => cagr(s.values[range.fromIndex] ?? null, s.values[range.toIndex] ?? null, range.to - range.from)) : null;
  const rateW = seriesRates ? Math.max(...seriesRates.map((r) => textWidth(formatRate(r), 9))) + 0.2 : 0;
  const ax = categoryAxis(ctx.control<XLabelMode>('x_labels'), cats, ctx.rect.w - g - 0.1 - rateW);
  const plot: Rect = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g - 0.1 - rateW, h: ctx.rect.y + ctx.rect.h - ax.h - top };
  items.push(...verticalValueAxis(plot, scale, fmt, mode === 'share' ? 'off' : env.gridlines));
  items.push(...ax.draw(plot));

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
      const lines = showLabel(env, i, s.values, s.name === env.highlight) && h >= 0.22 && barW >= 0.35
        ? [{ t: mode === 'share' ? pct(v) : formatMetric(raw, env.numberFormat), size: 9, bold: true, color: textOn(fill) }]
        : [];
      items.push({ kind: 'box', x, y: y1, w: barW, h, fill, line: WHITE, lines, align: 'center', valign: 'middle' });
    });
    if (showTotals) {
      const y = yOf(mode === 'share' ? 1 : up) - 0.24;
      items.push({ kind: 'text', x: x - 0.3, y, w: barW + 0.6, h: 0.2, lines: [{ t: formatMetric(tot, env.numberFormat), size: 9, bold: true, color: INK }], align: 'center', valign: 'middle' });
    }
  });
  if (seriesRates && range) {
    // 最後の年（終了年）の棒の各色の真ん中に合わせ、重なればずらす
    const i = range.toIndex;
    const x = plot.x + slot * i + (slot - barW) / 2 + barW + 0.08;
    let up = 0;
    const marks: { y: number; k: number }[] = [];
    series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null || v <= 0) return;
      marks.push({ y: (yOf(up) + yOf(up + v)) / 2, k });
      up += v;
    });
    const ys = spreadLabels(marks.map((m) => m.y), 0.17, plot.y, plot.y + plot.h);
    marks.forEach((m, j) => {
      items.push({ kind: 'text', x, y: ys[j]! - 0.09, w: rateW + 0.3, h: 0.18, lines: [{ t: formatRate(seriesRates[m.k]!), size: 9, bold: true, color: colorOf(m.k, series[m.k]!.name) }], align: 'left', valign: 'middle' });
    });
  }
  return { items, anchors: { yScale: { y: plot.y, h: plot.h } } };
};
