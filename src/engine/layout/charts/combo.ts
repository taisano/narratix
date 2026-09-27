import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate, formatSigned, type NumberFormat } from '../../format';
import { valueScale, type ValueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { AXIS, FOCUS, INK, SEC, textOn } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { growthSpan, spanRate } from '../../transform/cagr';
import { axisNumber, resolveComboSeries, type ComboSeries, type ComboSeriesConfig } from './combo-config';
import { categoryAxis, layoutHeader, TEXT_SAFETY, type XLabelMode } from './common';
import { emphasis, envOf, type ChartLayout } from './context';

type Axis = 'left' | 'right';

/** きりの良い刻み（1・2・2.5・5 × 10^n）で、区間が 4〜6 くらい */
function niceStep(span: number): number {
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
}

/**
 * 軸の目盛。自動なら 0 から（0 を含めないを選んだら値の範囲に余白）。最小・最大は手入力で上書きできる
 */
export function comboScale(values: readonly number[], opts: { min: number | null; max: number | null; zero: boolean }): ValueScale {
  const vs = values.filter((v) => Number.isFinite(v));
  if (opts.zero && opts.min == null && opts.max == null) return valueScale(vs);
  let lo = vs.length ? Math.min(...vs) : 0, hi = vs.length ? Math.max(...vs) : 1;
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) { hi = lo + 1; }
  const pad = (hi - lo) * 0.08;
  if (opts.min == null && !(opts.zero && lo === 0)) lo -= pad;
  if (opts.max == null) hi += pad;
  if (opts.min != null) lo = opts.min;
  if (opts.max != null) hi = opts.max;
  if (hi <= lo) hi = lo + 1;
  const step = niceStep(hi - lo);
  const min = opts.min ?? Math.floor(lo / step + 1e-9) * step;
  const max = opts.max ?? Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let t = first; t <= max + step * 1e-6; t += step) ticks.push(Math.round(t / step) * step);
  if (opts.min != null && ticks[0] !== min) ticks.unshift(min);
  if (opts.max != null && ticks[ticks.length - 1] !== max) ticks.push(max);
  return { min, max, ticks, ratio: (v) => (v - min) / (max - min || 1) };
}

const R = 0.05;

/**
 * 縦棒＋折れ線：系列ごとに縦棒／折れ線と左軸／右軸を選ぶ（軸は2本まで）。
 * 棒は「集合」か「積み上げ」（積み上げは軸ごと）。棒を背面、線を前面に描く。目盛線は左軸だけ。
 * 線の値ラベル「最新」は右端に系列名と値を並べ、重ならないように上下にずらす
 */
export const combo: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const cats = m.rows;
  const all = resolveComboSeries(m.cols, ctx.control<ComboSeriesConfig[]>('combo_series'), ctx.palette);
  const series = all.filter((s) => !s.hidden && s.col >= 0);
  const valuesOf = (s: ComboSeries) => cats.map((_, i) => { const v = m.current.values[i]?.[s.col]; return v == null || !Number.isFinite(v) ? null : v; });
  const vals = new Map(series.map((s) => [s, valuesOf(s)]));
  const bars = series.filter((s) => s.as === 'column');
  const lines = series.filter((s) => s.as === 'line');
  const stacked = ctx.control<string>('combo_bar_mode') === 'stacked';
  const connect = ctx.control<string>('combo_gaps') === 'connect';
  if (!series.length || !cats.length) {
    return { items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.4, lines: [{ t: slideText(ctx.locale, 'comboNeeds'), size: 10, color: SEC }], align: 'left', valign: 'top' }], anchors: {} };
  }
  const colorOf = (s: ComboSeries) => emphasis(env, s.name, s.color, s.as === 'column' ? FOCUS.otherBar : FOCUS.otherLine);
  const nf = env.numberFormat;
  // 率の系列は % を付ける（値は % 単位で入っている前提）
  const fmtOf = (s: ComboSeries) => (v: number) => formatMetric(v, s.rate ? '%' : nf);
  const items: SceneItem[] = [];

  // 上：凡例（系列の順。棒は四角、線は線）
  const head = layoutHeader(ctx.rect, series.map((s) => ({ name: s.name, color: colorOf(s), shape: s.as === 'column' ? 'box' as const : 'line' as const })), null);
  items.push(...head.items);
  let top = ctx.rect.y + head.height;

  // 開始から終了までの変化（補完パーツ）：系列ごとに1つずつ、凡例の下に並べる
  if (ctx.complement('series_change')) {
    const text = changeText(ctx.locale, cats, series.map((s) => ({ s, v: vals.get(s)! })), ctx.control<string>('combo_change') ?? 'auto', nf);
    if (text.body.length) {
      const joined = text.body.join(ctx.locale === 'ja' ? '　' : '   ');
      const wrapped = wrapText(`${text.head}  ${joined}`, 9, ctx.rect.w, 3);
      items.push({ kind: 'text', x: ctx.rect.x, y: top, w: ctx.rect.w, h: wrapped.length * 0.19, lines: wrapped.map((t) => ({ t, size: 9, color: INK })), align: 'left', valign: 'top' });
      top += wrapped.length * 0.19 + 0.08;
    }
  }

  // 軸ごとの値（積み上げは行ごとの正・負の合計）
  const axisValues = (a: Axis): number[] => {
    const out: number[] = [];
    for (const s of lines.filter((x) => x.axis === a)) for (const v of vals.get(s)!) if (v != null) out.push(v);
    const bs = bars.filter((x) => x.axis === a);
    if (stacked) {
      cats.forEach((_, i) => {
        let pos = 0, neg = 0;
        for (const s of bs) { const v = vals.get(s)![i]; if (v != null) { if (v >= 0) pos += v; else neg += v; } }
        out.push(pos, neg);
      });
    } else for (const s of bs) for (const v of vals.get(s)!) if (v != null) out.push(v);
    return out;
  };
  const used: Record<Axis, boolean> = { left: series.some((s) => s.axis === 'left'), right: series.some((s) => s.axis === 'right') };
  const scaleOf = (a: Axis) => comboScale(axisValues(a), {
    min: axisNumber(ctx.control(a === 'left' ? 'combo_left_min' : 'combo_right_min')),
    max: axisNumber(ctx.control(a === 'left' ? 'combo_left_max' : 'combo_right_max')),
    zero: ctx.control<boolean>(a === 'left' ? 'combo_left_zero' : 'combo_right_zero') !== false,
  });
  const scales: Record<Axis, ValueScale> = { left: scaleOf('left'), right: scaleOf('right') };
  // 軸の目盛の表記：その軸の系列がすべて率なら %
  const axisRate = (a: Axis) => series.filter((s) => s.axis === a).every((s) => s.rate);
  const tickFmt = (a: Axis) => (v: number) => formatMetric(v, axisRate(a) ? '%' : nf);
  const gutterOf = (a: Axis) => (used[a] ? Math.max(0.3, ...scales[a].ticks.map((t) => textWidth(tickFmt(a)(t), 9))) + 0.16 : 0.12);

  // 線の「最新」ラベルの幅（右端の外に系列名と値）
  const direct = lines.filter((s) => s.label === 'last');
  const lastOf = (s: ComboSeries) => { const v = vals.get(s)!; for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return { i, v: v[i]! }; return null; };
  const directText = (s: ComboSeries) => { const l = lastOf(s); return l ? `${s.name} ${fmtOf(s)(l.v)}` : ''; };
  const directW = direct.length ? Math.min(2.6, Math.max(...direct.map((s) => textWidth(directText(s), 9) * TEXT_SAFETY)) + 0.16) : 0;

  // 軸の名前（軸の上）。未入力なら単位（左＝データの単位、右＝率なら %）
  const titleOf = (a: Axis) => {
    const t = ctx.control<string>(a === 'left' ? 'combo_left_title' : 'combo_right_title')?.trim();
    const unit = axisRate(a) ? '%' : ctx.unit;
    return t ? (unit && !t.includes(unit) ? `${t}（${unit}）` : t) : unit;
  };
  const titles: Record<Axis, string> = { left: used.left ? titleOf('left') : '', right: used.right ? titleOf('right') : '' };
  const titleH = titles.left || titles.right ? 0.24 : 0.04;

  const leftG = gutterOf('left'), rightG = gutterOf('right');
  const plotW0 = ctx.rect.w - leftG - rightG - directW;
  const ax = categoryAxis(ctx.control<XLabelMode>('x_labels'), cats, plotW0);
  const plot: Rect = { x: ctx.rect.x + leftG, y: top + titleH, w: plotW0, h: ctx.rect.y + ctx.rect.h - top - titleH - ax.h };
  const yOf = (a: Axis, v: number) => plot.y + plot.h * (1 - scales[a].ratio(Math.min(Math.max(v, scales[a].min), scales[a].max)));

  // 目盛線と目盛（目盛線は左軸だけ。左軸が無ければ右軸で）
  const gridAxis: Axis = used.left ? 'left' : 'right';
  for (const a of ['left', 'right'] as Axis[]) {
    if (!used[a]) continue;
    for (const t of scales[a].ticks) {
      const y = yOf(a, t);
      items.push(a === 'left'
        ? { kind: 'text', x: plot.x - leftG, y: y - 0.1, w: leftG - 0.08, h: 0.2, lines: [{ t: tickFmt(a)(t), size: 9, color: AXIS.label }], align: 'right', valign: 'middle' }
        : { kind: 'text', x: plot.x + plot.w + 0.08, y: y - 0.1, w: rightG - 0.08, h: 0.2, lines: [{ t: tickFmt(a)(t), size: 9, color: AXIS.label }], align: 'left', valign: 'middle' });
      if (a === gridAxis && env.gridlines !== 'off' && t !== 0 && Math.abs(t - scales[a].min) > 1e-9) {
        items.push({ kind: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, color: env.gridlines === 'on' ? AXIS.gridStrong : AXIS.grid, width: 0.75 });
      }
    }
    if (titles[a]) {
      items.push(a === 'left'
        ? { kind: 'text', x: ctx.rect.x, y: plot.y - titleH - 0.02, w: Math.min(ctx.rect.w / 2, textWidth(titles[a], 9) * TEXT_SAFETY + 0.2), h: 0.2, lines: [{ t: titles[a], size: 9, bold: true, color: INK }], align: 'left', valign: 'middle' }
        : { kind: 'text', x: plot.x + plot.w + rightG - Math.min(ctx.rect.w / 2, textWidth(titles[a], 9) * TEXT_SAFETY + 0.2), y: plot.y - titleH - 0.02, w: Math.min(ctx.rect.w / 2, textWidth(titles[a], 9) * TEXT_SAFETY + 0.2), h: 0.2, lines: [{ t: titles[a], size: 9, bold: true, color: INK }], align: 'right', valign: 'middle' });
    }
  }
  // 0 の基準線（目盛線の軸で）
  const zs = scales[gridAxis];
  items.push({ kind: 'line', x1: plot.x, y1: yOf(gridAxis, Math.min(Math.max(0, zs.min), zs.max)), x2: plot.x + plot.w, y2: yOf(gridAxis, Math.min(Math.max(0, zs.min), zs.max)), color: AXIS.base, width: 1 });
  items.push(...ax.draw(plot));

  // 棒（背面）
  const slot = plot.w / Math.max(1, cats.length);
  const group = Math.min(slot * 0.72, 1.8);
  const stackAxes = stacked ? (['left', 'right'] as Axis[]).filter((a) => bars.some((s) => s.axis === a)) : [];
  const lanes = stacked ? stackAxes.length : bars.length;
  const barW = lanes ? Math.min(group / lanes, 0.9) : 0;
  const x0 = (i: number) => plot.x + slot * i + (slot - barW * lanes) / 2;
  const showAt = (s: ComboSeries, i: number, v: (number | null)[]) => {
    if (s.label === 'all') return true;
    const idx = v.map((x, k) => (x == null ? -1 : k)).filter((k) => k >= 0);
    if (s.label === 'last') return i === idx[idx.length - 1];
    if (s.label === 'ends') return i === idx[0] || i === idx[idx.length - 1];
    return false;
  };
  const barLabels: SceneItem[] = [];
  cats.forEach((_, i) => {
    if (stacked) {
      stackAxes.forEach((a, lane) => {
        let pos = 0, neg = 0;
        const x = x0(i) + lane * barW;
        for (const s of bars.filter((b) => b.axis === a)) {
          const v = vals.get(s)![i];
          if (v == null || v === 0) continue;
          const from = v >= 0 ? pos : neg, to = from + v;
          if (v >= 0) pos = to; else neg = to;
          const y1 = yOf(a, from), y2 = yOf(a, to);
          const fill = colorOf(s);
          const h = Math.abs(y2 - y1);
          const inside = showAt(s, i, vals.get(s)!) && h >= 0.2 && barW >= textWidth(fmtOf(s)(v), 8) + 0.04;
          items.push({ kind: 'box', x, y: Math.min(y1, y2), w: barW, h: Math.max(h, 0.003), fill, line: '#FFFFFF', lines: inside ? [{ t: fmtOf(s)(v), size: 8, color: textOn(fill) }] : [], align: 'center', valign: 'middle' });
        }
        if (ctx.complement('total_labels') && (pos || neg)) {
          const total = pos + neg;
          barLabels.push({ kind: 'text', x: x + barW / 2 - 0.5, y: yOf(a, pos) - 0.21, w: 1, h: 0.19, lines: [{ t: formatMetric(total, nf), size: 9, bold: true, color: INK }], align: 'center', valign: 'middle' });
        }
      });
    } else {
      bars.forEach((s, lane) => {
        const v = vals.get(s)![i];
        if (v == null) return;
        const a = s.axis;
        const base = Math.min(Math.max(0, scales[a].min), scales[a].max);
        const y1 = yOf(a, base), y2 = yOf(a, v);
        const x = x0(i) + lane * barW;
        items.push({ kind: 'box', x, y: Math.min(y1, y2), w: barW * 0.94, h: Math.max(Math.abs(y2 - y1), 0.003), fill: colorOf(s) });
        if (showAt(s, i, vals.get(s)!)) {
          barLabels.push({ kind: 'text', x: x + barW * 0.47 - 0.5, y: v >= base ? y2 - 0.2 : y2 + 0.01, w: 1, h: 0.19, lines: [{ t: fmtOf(s)(v), size: 8, color: AXIS.label }], align: 'center', valign: 'middle' });
        }
      });
    }
  });

  // 参照線（目標・予算・平均・任意の値）
  if (ctx.complement('reference_line')) {
    const a: Axis = ctx.control<string>('ref_axis') === 'right' && used.right ? 'right' : used.left ? 'left' : 'right';
    const onAxis = series.filter((s) => s.axis === a).flatMap((s) => vals.get(s)!.filter((v): v is number => v != null));
    const given = axisNumber(ctx.control('ref_value'));
    const value = given ?? (onAxis.length ? onAxis.reduce((x, y) => x + y, 0) / onAxis.length : null);
    if (value != null) {
      const y = yOf(a, value);
      const name = ctx.control<string>('ref_label')?.trim();
      const shown = formatMetric(value, axisRate(a) ? '%' : nf);
      const t = name ? `${name} ${shown}` : given != null ? shown : slideText(ctx.locale, 'average', { value: shown });
      items.push({ kind: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, color: AXIS.reference, width: 1, dash: true });
      items.push({ kind: 'text', x: plot.x + plot.w - 2.4, y: y - 0.22, w: 2.4, h: 0.2, lines: [{ t, size: 9, bold: true, color: AXIS.reference }], align: 'right', valign: 'middle' });
    }
  }

  // 折れ線（前面）
  const pending: { x: number; y: number; t: string; color: string }[] = [];
  const directs: { y: number; t: string; color: string }[] = [];
  for (const s of lines) {
    const v = vals.get(s)!;
    const color = colorOf(s);
    const hl = s.name === env.highlight;
    const width = hl ? 3 : 2;
    const pt = (i: number) => ({ x: plot.x + slot * (i + 0.5), y: yOf(s.axis, v[i]!) });
    let last: { x: number; y: number } | null = null;
    v.forEach((x, i) => {
      if (x == null) { if (!connect) last = null; return; }
      const p = pt(i);
      if (last) items.push({ kind: 'line', x1: last.x, y1: last.y, x2: p.x, y2: p.y, color, width, ...(s.line !== 'solid' ? { dash: s.line } : {}) });
      last = p;
    });
    v.forEach((x, i) => {
      if (x == null) return;
      const p = pt(i);
      if (s.marker !== 'none') items.push({ kind: 'ellipse', x: p.x - R, y: p.y - R, w: R * 2, h: R * 2, fill: color, ...(s.marker !== 'circle' ? { shape: s.marker } : {}) });
      if (s.label !== 'last' && showAt(s, i, v)) pending.push({ x: p.x, y: p.y - 0.28, t: fmtOf(s)(x), color });
    });
    const l = lastOf(s);
    if (s.label === 'last' && l) directs.push({ y: yOf(s.axis, l.v), t: directText(s), color });
  }
  items.push(...barLabels);
  // 線の値ラベル：同じ横位置で重なれば上にずらす
  const byX = new Map<number, typeof pending>();
  for (const p of pending) byX.set(Math.round(p.x * 100), [...(byX.get(Math.round(p.x * 100)) ?? []), p]);
  for (const col of byX.values()) {
    col.sort((a, b) => b.y - a.y);
    for (let k = 1; k < col.length; k++) col[k]!.y = Math.min(col[k]!.y, col[k - 1]!.y - 0.17);
    for (const p of col) items.push({ kind: 'text', x: p.x - 0.5, y: Math.max(plot.y - 0.2, p.y), w: 1, h: 0.19, lines: [{ t: p.t, size: 8, bold: true, color: p.color }], align: 'center', valign: 'middle' });
  }
  // 最新ラベル（右端の外）：上から詰めて重ならないように
  if (directs.length) {
    directs.sort((a, b) => a.y - b.y);
    const H = 0.19;
    const ys = directs.map((d) => d.y - H / 2);
    for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k]!, ys[k - 1]! + H);
    const over = ys[ys.length - 1]! + H - (plot.y + plot.h);
    if (over > 0) for (let k = ys.length - 1; k >= 0; k--) ys[k] = Math.min(ys[k]!, (k === ys.length - 1 ? plot.y + plot.h - H : ys[k + 1]! - H));
    const x = plot.x + plot.w + rightG + 0.04;
    directs.forEach((d, k) => items.push({ kind: 'text', x, y: ys[k]!, w: directW - 0.04, h: H, lines: [{ t: d.t, size: 9, bold: true, color: d.color }], align: 'left', valign: 'middle' }));
  }
  return { items, anchors: {} };
};

/** 開始から終了までの変化（系列ごと）。率の系列はポイント差、量の系列は増減と増減率（年なら CAGR も選べる） */
export function changeText(locale: 'ja' | 'en', cats: readonly string[], rows: { s: ComboSeries; v: (number | null)[] }[], kind: string, nf: NumberFormat): { head: string; body: string[] } {
  const span = growthSpan(cats);
  const body: string[] = [];
  let from = '', to = '';
  for (const { s, v } of rows) {
    const idx = v.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length < 2) continue;
    const a = span && v[span.fromIndex] != null ? span.fromIndex : idx[0]!;
    const b = span && v[span.toIndex] != null ? span.toIndex : idx[idx.length - 1]!;
    if (a === b) continue;
    from ||= cats[a]!; to ||= cats[b]!;
    const va = v[a]!, vb = v[b]!;
    const f = (x: number) => formatMetric(x, s.rate ? '%' : nf);
    let delta: string;
    if (s.rate) {
      const d = Math.round((vb - va) * 10) / 10;
      delta = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}pt`;
    } else {
      const diff = formatSigned(vb - va, nf);
      const rate = va > 0 ? formatSigned(((vb / va) - 1) * 100, 'raw') + '%' : 'N/A';
      const cagr = span && span.years != null && a === span.fromIndex && b === span.toIndex ? spanRate(span, va, vb) : null;
      delta = kind === 'diff' ? diff : kind === 'rate' ? rate : kind === 'cagr' && span?.years != null ? `CAGR ${formatRate(cagr)}` : `${diff}${locale === 'ja' ? '、' : ', '}${rate}`;
    }
    body.push(locale === 'ja' ? `${s.name} ${f(va)} → ${f(vb)}（${delta}）` : `${s.name} ${f(va)} → ${f(vb)} (${delta})`);
  }
  return { head: slideText(locale, 'comboChangeHead', { from, to }), body };
}
