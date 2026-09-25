import { periodText, slideText } from '@/i18n/slide';
import { formatMetric, nonAdditiveUnit } from '../../format';
import type { SceneItem } from '../../scene';
import { textWidth } from '../../text';
import { INK, SEC, WHITE, textOn } from '../../theme';
import { rowSum, type Matrix } from '../../transform/matrix';
import { OTHER_GREY } from './bars';
import { signedMetric } from './contribution';
import { envOf, type ChartCtx, type ChartLayout } from './context';

const UP = '#2E7D32', DOWN = '#C62828', FLAT = '#6B7280';

/** 補完パーツ「全体（合計）のペア」：すべての行を足した行を最後に足す（足せない単位・同じ名前の行がある時は足さない） */
function withTotalPair(ctx: ChartCtx): Matrix & { totalAdded?: boolean } {
  const m = ctx.matrix;
  const label = ctx.control<string>('pair_total_label')?.trim() || slideText(ctx.locale, 'total');
  if (!ctx.complement('total_category') || m.rows.length < 2 || nonAdditiveUnit(ctx.unit) || m.rows.includes(label)) return m;
  const colSum = (vals: (number | null)[][]) => m.cols.map((_, k) => {
    const xs = vals.map((r) => r[k]).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  });
  return {
    ...m,
    rows: [...m.rows, label],
    current: { ...m.current, values: [...m.current.values, colSum(m.current.values)] },
    ...(m.base ? { base: { ...m.base, values: [...m.base.values, colSum(m.base.values)] } } : {}),
    totalAdded: true,
  };
}

/**
 * 2期間の100%積み上げ（カテゴリ別）：行（カテゴリ・市場）ごとに、比較期間と現在の100%積み上げを並べる。
 * 列（ブランドなど）は凡例の順に上から積み、色は全カテゴリで同じ。棒の上に合計、下に期間。
 * 下の行：市場の伸び率（現在の合計 ÷ 比較期間の合計 − 1、増は緑・減は赤）と、強調した項目の増減（現在 − 比較期間の値）。
 */
export const sharePair: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = withTotalPair(ctx);
  const base = m.base;
  if (!base || !base.values.some((r) => r.some((v) => v != null))) {
    return { items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.5, lines: [{ t: slideText(ctx.locale, 'pairNeedsBase'), size: 10, color: SEC }], align: 'left', valign: 'top' }], anchors: {} };
  }
  const nf = env.numberFormat;
  const { series: PAL } = ctx.palette;
  const other = slideText(ctx.locale, 'others');
  const colorOf = (k: number) => (m.cols[k] === other ? OTHER_GREY : PAL[k % PAL.length]!);
  const items: SceneItem[] = [];
  const hl = env.highlight;
  const showGrowth = ctx.control<boolean>('pair_growth') !== false;
  const showDelta = ctx.control<boolean>('pair_delta') !== false && !!hl;
  const hk = hl ? m.cols.indexOf(hl) : -1;

  // 右：凡例（上から列の順。積む順と同じ）
  const legendW = Math.min(2.2, Math.max(1.2, ...m.cols.map((c) => textWidth(c, 9) + 0.35)));
  const lx = ctx.rect.x + ctx.rect.w - legendW;
  const rowH = Math.min(0.26, (ctx.rect.h - 0.2) / Math.max(1, m.cols.length));
  m.cols.forEach((c, k) => {
    const y = ctx.rect.y + 0.35 + k * rowH;
    items.push({ kind: 'box', x: lx, y: y + rowH / 2 - 0.07, w: 0.22, h: 0.14, fill: colorOf(k), line: WHITE });
    items.push({ kind: 'text', x: lx + 0.28, y, w: legendW - 0.28, h: rowH, lines: [{ t: c, size: 9, bold: k === hk, color: k === hk ? INK : SEC }], align: 'left', valign: 'middle' });
  });

  // 左：行の見出し（合計・伸び率・増減）
  const unitTotal = ctx.unit ? slideText(ctx.locale, 'pairTotalUnit', { unit: ctx.unit }) : slideText(ctx.locale, 'pairTotal');
  const rowLabels = [unitTotal, showGrowth ? slideText(ctx.locale, 'pairGrowth') : null, showDelta ? (ctx.unit ? slideText(ctx.locale, 'pairDeltaUnit', { name: hl!, unit: ctx.unit }) : slideText(ctx.locale, 'pairDelta', { name: hl! })) : null];
  const gutter = Math.min(1.5, Math.max(0.7, ...rowLabels.filter(Boolean).map((t) => textWidth(t!, 9) * 0.9 + 0.15)));
  const x0 = ctx.rect.x + gutter;
  const w = lx - 0.3 - x0;
  const nameH = 0.26, totalH = 0.22, periodH = 0.22, metricH = 0.24;
  const bottomRows = (showGrowth ? 1 : 0) + (showDelta ? 1 : 0);
  const top = ctx.rect.y + nameH + totalH;
  const plotH = ctx.rect.y + ctx.rect.h - top - periodH - bottomRows * metricH - 0.08;
  const n = m.rows.length;
  const slot = w / Math.max(1, n);
  const barW = Math.min(0.62, slot * 0.36);
  const gap = Math.min(0.06, barW * 0.12);
  items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y + nameH, w: gutter - 0.1, h: totalH, lines: [{ t: unitTotal, size: 9, bold: true, color: INK }], align: 'left', valign: 'middle' });
  let ry = top + plotH + periodH + 0.04;
  const metricRows: { y: number; label: string }[] = [];
  if (showGrowth) { metricRows.push({ y: ry, label: rowLabels[1]! }); ry += metricH; }
  if (showDelta) { metricRows.push({ y: ry, label: rowLabels[2]! }); ry += metricH; }
  for (const r of metricRows) items.push({ kind: 'text', x: ctx.rect.x, y: r.y, w: gutter - 0.1, h: metricH, lines: [{ t: r.label, size: 9, bold: true, color: INK }], align: 'left', valign: 'middle' });

  // 積む順：1列目を一番上に（凡例と同じ並び）→ 下から最後の列から積む
  const rev = <T,>(a: T[]) => [...a].reverse();
  m.rows.forEach((row, i) => {
    const cx = x0 + slot * i + slot / 2;
    const xa = cx - barW - gap / 2, xb = cx + gap / 2;
    const b = base.values[i] ?? [], c = m.current.values[i] ?? [];
    items.push({ kind: 'text', x: x0 + slot * i, y: ctx.rect.y, w: slot, h: nameH, lines: [{ t: row, size: 10, bold: true, color: INK }], align: 'center', valign: 'middle' });
    const tb = rowSum(b), tc = rowSum(c);
    items.push({ kind: 'text', x: xa - 0.2, y: ctx.rect.y + nameH, w: barW + 0.4, h: totalH, lines: [{ t: formatMetric(tb, nf), size: 9, color: INK }], align: 'center', valign: 'middle' });
    items.push({ kind: 'text', x: xb - 0.2, y: ctx.rect.y + nameH, w: barW + 0.4, h: totalH, lines: [{ t: formatMetric(tc, nf), size: 9, color: INK }], align: 'center', valign: 'middle' });
    // 1列目を上にするため、逆順の値・色で積む
    const order = rev(m.cols.map((_, k) => k));
    const stack = (vals: (number | null)[], x: number) => {
      const tot = rowSum(vals);
      let y = top + plotH;
      if (tot <= 0) return;
      for (const k of order) {
        const v = vals[k];
        if (v == null || v <= 0) continue;
        const h = plotH * (v / tot);
        y -= h;
        const fill = colorOf(k);
        const lines = h >= 0.2 && barW >= 0.32 ? [{ t: Math.round((v / tot) * 100) + '%', size: 8, bold: k === hk, color: textOn(fill) }] : [];
        items.push({ kind: 'box', x, y, w: barW, h, fill, line: WHITE, lines, align: 'center', valign: 'middle' });
      }
    };
    stack(b, xa);
    stack(c, xb);
    items.push({ kind: 'text', x: xa - 0.2, y: top + plotH + 0.02, w: barW + 0.4, h: periodH, lines: [{ t: periodText(ctx.locale, base.label), size: 8, color: SEC }], align: 'center', valign: 'middle' });
    items.push({ kind: 'text', x: xb - 0.2, y: top + plotH + 0.02, w: barW + 0.4, h: periodH, lines: [{ t: periodText(ctx.locale, m.current.label), size: 8, color: SEC }], align: 'center', valign: 'middle' });
    let k = 0;
    if (showGrowth) {
      const g = tb > 0 ? tc / tb - 1 : null;
      const t = g == null ? '—' : (g > 0 ? '+' : '') + Math.round(g * 100) + '%';
      items.push({ kind: 'text', x: x0 + slot * i, y: metricRows[k]!.y, w: slot, h: metricH, lines: [{ t, size: 9, bold: true, color: g == null || Math.abs(g) < 0.005 ? FLAT : g > 0 ? UP : DOWN }], align: 'center', valign: 'middle' });
      k++;
    }
    if (showDelta) {
      const vb = b[hk], vc = c[hk];
      const d = vb != null && vc != null ? vc - vb : null;
      items.push({ kind: 'text', x: x0 + slot * i, y: metricRows[k]!.y, w: slot, h: metricH, lines: [{ t: d == null ? '—' : signedMetric(d, nf), size: 9, bold: true, color: d == null || Math.abs(d) < 1e-9 ? FLAT : d > 0 ? UP : DOWN }], align: 'center', valign: 'middle' });
    }
  });
  // 全体のペアは点線で区切る
  if ('totalAdded' in m && m.totalAdded) {
    const xd = x0 + slot * (n - 1);
    items.push({ kind: 'line', x1: xd, y1: ctx.rect.y + 0.05, x2: xd, y2: top + plotH + periodH, color: '#C3CACE', width: 0.75, dash: true });
  }
  return { items, anchors: {} };
};
