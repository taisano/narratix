import { formatFixed, formatMetric } from '../../format';
import type { SceneItem } from '../../scene';
import { AXIS, FOCUS, INK, SEC } from '../../theme';
import { emphasis, envOf, type ChartLayout, unitNote } from './context';
import { textWidth } from '../../text';
import { isTimeAxis } from '../../transform/cagr';

/**
 * 小さな棒の並び（項目×複数指標の評価）：指標ごとに小さな横棒グラフを並べる。
 * 項目の並びはどの指標でも同じ（貼った順）なので、同じ項目を指標をまたいで見比べられる。棒の長さは指標ごとの 0〜最大（単位が違っても並べられる）。
 * 項目名は各段の左端の指標にだけ書く。値は貼った桁のまま。
 */
export const smallMultiples: ChartLayout = (ctx) => {
  const m = ctx.matrix;
  // 強調は項目（行）か指標（列）。項目なら、どの小さなグラフでも同じ項目の棒に色が付く。指標なら、その小さなグラフだけに色が付く
  const hl = ctx.control<string>('highlight');
  const colHl = hl && !m.rows.includes(hl) && m.cols.includes(hl) ? hl : null;
  const env = { ...envOf(ctx), highlight: hl && m.rows.includes(hl) ? hl : null };
  const pal = ctx.palette;
  const n = m.cols.length;
  if (!n || !m.rows.length) return { items: [], anchors: {} };
  const items: SceneItem[] = [];
  const note = unitNote(ctx);
  const top = note ? 0.3 : 0;
  if (note) items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.24, lines: [{ t: note, size: 9, color: SEC }], align: 'right', valign: 'middle' });
  // 2〜3つは横に並べ、4つは2×2、5つ以上は3列
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
  const asLine = ctx.control<string>('sm_form') === 'line' && isTimeAxis(m.rows);
  const decOf = (i: number, k: number) => ctx.cellDecimals?.[`${m.rows[i]}\t${m.cols[k]}`];
  if (asLine) {
    // 折れ線：指標ごとの小さな図。横軸は行（年・期間）。縦は指標ごとに 0〜最大。最初と最後（と強調した時点）に値を書く
    const valSize = size - 1;
    m.cols.forEach((name, k) => {
      const gr = Math.floor(k / perRow), gc = k % perRow;
      const x0 = ctx.rect.x + gc * (cellW + gap), y0 = ctx.rect.y + top + gr * (cellH + gap);
      const labelTop = 0.22, axisH = 0.26;
      const plotX = x0 + 0.3, plotW = Math.max(0.5, cellW - 0.6);
      const plotY = y0 + titleH + labelTop, plotH = Math.max(0.4, cellH - titleH - labelTop - axisH);
      const vs = m.rows.map((_, i) => val(i, k)).filter((v): v is number => v != null && Number.isFinite(v));
      const hi = Math.max(0, ...vs), lo = Math.min(0, ...vs);
      const span = hi - lo || 1;
      const xAt = (i: number) => plotX + (m.rows.length === 1 ? plotW / 2 : (plotW * i) / (m.rows.length - 1));
      const yAt = (v: number) => plotY + plotH * (1 - (v - lo) / span);
      const mute = !!colHl && name !== colHl;
      const color = mute ? FOCUS.otherBar : colHl ? (env.accent ?? pal.primary) : pal.primary;
      items.push({ kind: 'text', x: x0, y: y0, w: cellW, h: titleH, lines: [{ t: name, size, bold: true, color: mute ? SEC : INK }], align: 'left', valign: 'middle' });
      items.push({ kind: 'box', x: plotX - 0.1, y: yAt(0) - 0.004, w: plotW + 0.2, h: 0.008, fill: AXIS.base });
      for (let i = 1; i < m.rows.length; i++) {
        const a = val(i - 1, k), b = val(i, k);
        if (a == null || b == null) continue;
        items.push({ kind: 'line', x1: xAt(i - 1), y1: yAt(a), x2: xAt(i), y2: yAt(b), color, width: 2.25 });
      }
      const every = m.rows.length <= 6 ? 1 : 2;
      m.rows.forEach((r, i) => {
        const v = val(i, k);
        const isHl = env.highlight === r;
        const edge = i === 0 || i === m.rows.length - 1;
        if (v != null && Number.isFinite(v)) {
          const rad = isHl ? 0.07 : 0.045;
          items.push({ kind: 'ellipse', x: xAt(i) - rad, y: yAt(v) - rad, w: rad * 2, h: rad * 2, fill: isHl ? (env.accent ?? pal.primary) : color });
          if (edge || isHl) {
            const t = env.numberFormat === 'raw' ? formatFixed(v, decOf(i, k)) : formatMetric(v, env.numberFormat);
            items.push({ kind: 'text', x: xAt(i) - 0.4, y: yAt(v) - 0.27, w: 0.8, h: 0.2, lines: [{ t, size: valSize, bold: isHl, color: mute ? SEC : INK }], align: 'center', valign: 'middle' });
          }
        }
        if (i % every === 0 || edge) items.push({ kind: 'text', x: xAt(i) - 0.35, y: plotY + plotH + 0.04, w: 0.7, h: axisH - 0.04, lines: [{ t: r, size: valSize, color: isHl ? INK : SEC, bold: isHl }], align: 'center', valign: 'middle' });
      });
    });
    return { items, anchors: {} };
  }
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
    items.push({ kind: 'text', x: x0, y: y0, w: cellW, h: titleH, lines: [{ t: name, size: size, bold: true, color: colHl && name !== colHl ? SEC : INK }], align: 'left', valign: 'middle' });
    items.push({ kind: 'box', x: zero - 0.004, y: y0 + titleH, w: 0.008, h: rowH * m.rows.length, fill: AXIS.base });
    m.rows.forEach((r, i) => {
      const y = y0 + titleH + i * rowH;
      if (labelsHere) items.push({ kind: 'text', x: x0, y, w: nameW - 0.1, h: rowH, lines: [{ t: r, size, color: env.highlight === r ? INK : SEC, bold: env.highlight === r }], align: 'right', valign: 'middle' });
      const v = val(i, k);
      if (v == null || !Number.isFinite(v)) { items.push({ kind: 'text', x: zero + 0.05, y, w: labelW, h: rowH, lines: [{ t: '—', size: size - 1, color: SEC }], align: 'left', valign: 'middle' }); return; }
      const px = plotX + plotW * ((v - lo) / span);
      const bx = Math.min(px, zero), bw = Math.abs(px - zero);
      const fill = colHl ? (name === colHl ? (env.accent ?? pal.primary) : FOCUS.otherBar) : emphasis(env, r, pal.primary, FOCUS.otherBar, pal.primary);
      if (bw > 0.004) items.push({ kind: 'box', x: bx, y: y + (rowH - barH) / 2, w: bw, h: barH, fill });
      const t = env.numberFormat === 'raw' ? formatFixed(v, decOf(i, k)) : formatMetric(v, env.numberFormat);
      items.push(v >= 0
        ? { kind: 'text', x: px + 0.05, y, w: labelW, h: rowH, lines: [{ t, size: size - 1, color: INK }], align: 'left', valign: 'middle' }
        : { kind: 'text', x: px - 0.05 - labelW, y, w: labelW, h: rowH, lines: [{ t, size: size - 1, color: INK }], align: 'right', valign: 'middle' });
    });
  });
  return { items, anchors: {} };
};
