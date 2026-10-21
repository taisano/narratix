import { formatFixed, formatMetric } from '../../format';
import type { SceneItem } from '../../scene';
import { AXIS, FOCUS, INK, SEC } from '../../theme';
import { emphasis, envOf, type ChartLayout, unitNote } from './context';
import { textWidth } from '../../text';

/**
 * 小さな棒の並び（項目×複数指標の評価）：指標ごとに小さな横棒グラフを並べる。
 * 項目の並びはどの指標でも同じ（貼った順）なので、同じ項目を指標をまたいで見比べられる。棒の長さは指標ごとの 0〜最大（単位が違っても並べられる）。
 * 項目名は各段の左端の指標にだけ書く。値は貼った桁のまま。
 */
export const smallMultiples: ChartLayout = (ctx) => {
  const m = ctx.matrix, env = envOf(ctx);
  const pal = ctx.palette;
  const n = m.cols.length;
  if (!n || !m.rows.length) return { items: [], anchors: {} };
  const items: SceneItem[] = [];
  const note = unitNote(ctx);
  const top = note ? 0.3 : 0;
  if (note) items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.24, lines: [{ t: note, size: 9, color: SEC }], align: 'right', valign: 'middle' });
  const perRow = n <= 3 ? n : n === 4 ? 2 : 3;
  const gridRows = Math.ceil(n / perRow);
  const gap = 0.25;
  const size = m.rows.length <= 6 ? 11 : m.rows.length <= 9 ? 10 : 9;
  const nameW = Math.min(2.2, Math.max(0.8, ...m.rows.map((r) => textWidth(r, size) + 0.15)));
  const cellW = (ctx.rect.w - gap * (perRow - 1)) / perRow;
  const cellH = (ctx.rect.h - top - gap * (gridRows - 1)) / gridRows;
  const titleH = 0.3;
  const rowH = Math.max(0.16, (cellH - titleH) / m.rows.length);
  const barH = Math.min(0.32, rowH * 0.62);
  const val = (i: number, k: number) => m.current.values[i]?.[k] ?? null;
  const decOf = (i: number, k: number) => ctx.cellDecimals?.[`${m.rows[i]}\t${m.cols[k]}`];
  m.cols.forEach((name, k) => {
    const gr = Math.floor(k / perRow), gc = k % perRow;
    const x0 = ctx.rect.x + gc * (cellW + gap), y0 = ctx.rect.y + top + gr * (cellH + gap);
    const labelsHere = gc === 0;
    const left = labelsHere ? nameW : 0;
    const vs = m.rows.map((_, i) => val(i, k)).filter((v): v is number => v != null && Number.isFinite(v));
    const hi = Math.max(0, ...vs), lo = Math.min(0, ...vs);
    const span = hi - lo || 1;
    const labelW = 0.7;
    const plotX = x0 + left, plotW = Math.max(0.3, cellW - left - labelW);
    const zero = plotX + plotW * ((0 - lo) / span);
    items.push({ kind: 'text', x: x0, y: y0, w: cellW, h: titleH, lines: [{ t: name, size: size, bold: true, color: INK }], align: 'left', valign: 'middle' });
    items.push({ kind: 'box', x: zero - 0.004, y: y0 + titleH, w: 0.008, h: rowH * m.rows.length, fill: AXIS.base });
    m.rows.forEach((r, i) => {
      const y = y0 + titleH + i * rowH;
      if (labelsHere) items.push({ kind: 'text', x: x0, y, w: nameW - 0.1, h: rowH, lines: [{ t: r, size, color: env.highlight === r ? INK : SEC, bold: env.highlight === r }], align: 'right', valign: 'middle' });
      const v = val(i, k);
      if (v == null || !Number.isFinite(v)) { items.push({ kind: 'text', x: zero + 0.05, y, w: labelW, h: rowH, lines: [{ t: '—', size: size - 1, color: SEC }], align: 'left', valign: 'middle' }); return; }
      const px = plotX + plotW * ((v - lo) / span);
      const bx = Math.min(px, zero), bw = Math.abs(px - zero);
      const fill = emphasis(env, r, pal.primary, FOCUS.otherBar, pal.primary);
      if (bw > 0.004) items.push({ kind: 'box', x: bx, y: y + (rowH - barH) / 2, w: bw, h: barH, fill });
      const t = env.numberFormat === 'raw' ? formatFixed(v, decOf(i, k)) : formatMetric(v, env.numberFormat);
      items.push(v >= 0
        ? { kind: 'text', x: px + 0.05, y, w: labelW, h: rowH, lines: [{ t, size: size - 1, color: INK }], align: 'left', valign: 'middle' }
        : { kind: 'text', x: px - 0.05 - labelW, y, w: labelW, h: rowH, lines: [{ t, size: size - 1, color: INK }], align: 'right', valign: 'middle' });
    });
  });
  return { items, anchors: {} };
};
