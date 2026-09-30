import type { PanelAnchors } from '../anchors';
import { slideText } from '@/i18n/slide';
import { formatMetric, formatRate, nonAdditiveUnit } from '../../format';
import { growthSpan, spanRate } from '../../transform/cagr';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { textWidth, wrapText } from '../../text';
import { AXIS, FOCUS, INK, SEC, WHITE, seriesColor, textOn } from '../../theme';
import { endpoints, share } from '../../transform/ops';
import { rowSum } from '../../transform/matrix';
import { DIFF, signed, varianceData } from './clustered';
import { OTHER_GREY } from './bars';
import { TOTAL_CHANGE_H, totalChangeItem, totalChangeText } from './total-change';
import { categoryLabelsLeft, labelGutter, layoutHeader } from './common';
import { emphasis, envOf, type ChartCtx, type ChartLayout, unitNote } from './context';

const note = (ctx: ChartCtx, text: string): SceneItem => {
  // 右 1/3 のような狭い欄でも切れないよう、折り返す
  const lines = wrapText(text, 10, ctx.rect.w, 5);
  return { kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.22 * lines.length + 0.1, lines: lines.map((t) => ({ t, size: 10, color: SEC })), align: 'left', valign: 'top' };
};
const pct = (v: number) => Math.round(v * 100) + '%';

/**
 * 100%横棒：行＝棒（多くは最初と最後の年）、列＝内訳。内訳の順は最後の棒の大きい順（規模の大きい順に並べる、既定オン）。
 * 棒と棒の間は、内訳の境目を細い線で結ぶ（構成の移り変わりが追える）。合計ラベルは棒の右に。
 */
export const bar100: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  if (!m.rows.length || !m.cols.length) return { items: [note(ctx, slideText(ctx.locale, 'needTwoPoints'))], anchors: {} };
  const s = share(m);
  const last = s.current.values[s.rows.length - 1] ?? [];
  const order = m.cols.map((_, k) => k);
  // 系列の順を選んでいれば、表の段階で並べ済み。選んでいなければ古い「規模の大きい順」（既定オン）
  if (!ctx.control<string>('segment_order') && (ctx.control<boolean>('sort_by_size') ?? true)) order.sort((a, b) => (last[b] ?? 0) - (last[a] ?? 0) || a - b);
  // 「その他」は最後に
  order.sort((a, b) => Number(m.cols[a] === slideText(ctx.locale, 'others')) - Number(m.cols[b] === slideText(ctx.locale, 'others')));
  const { series: PAL, greys: GREYS } = ctx.palette;
  const otherName = slideText(ctx.locale, 'others');
  const colorOf = (k: number) => (m.cols[k] === otherName ? OTHER_GREY : emphasis(env, m.cols[k]!, PAL[k % PAL.length]!, GREYS[k % GREYS.length]!));
  const showTotals = ctx.complement('total_labels');
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, order.map((k) => ({ name: m.cols[k]!, color: colorOf(k), shape: 'box' as const })), showTotals ? unitNote(ctx) : null);
  items.push(...head.items);
  const totals = m.rows.map((_, i) => rowSum(m.current.values[i]));
  const g = labelGutter(m.rows, ctx.rect.w);
  const right = showTotals ? Math.max(...totals.map((t) => textWidth(formatMetric(t, env.numberFormat), 10))) + 0.3 : 0.1;
  const plot: Rect = { x: ctx.rect.x + g, y: ctx.rect.y + head.height + 0.1, w: ctx.rect.w - g - right, h: ctx.rect.h - head.height - 0.2 };
  items.push(...categoryLabelsLeft(plot, m.rows, ctx.rect.x));
  const slot = plot.h / m.rows.length;
  const barH = Math.min(slot * 0.55, 0.85);
  const edges: number[][] = [];
  m.rows.forEach((_, i) => {
    const y = plot.y + slot * i + (slot - barH) / 2;
    let x = plot.x;
    const e: number[] = [];
    for (const k of order) {
      const v = s.current.values[i]?.[k] ?? 0;
      const w = plot.w * v;
      if (w > 0.001) {
        const fill = colorOf(k);
        const lines = w >= 0.42 && barH >= 0.22 ? [{ t: pct(v), size: 10, bold: true, color: textOn(fill) }] : [];
        items.push({ kind: 'box', x, y, w, h: barH, fill, line: WHITE, lines, align: 'center', valign: 'middle' });
      }
      x += w;
      e.push(x);
    }
    edges.push(e);
    if (showTotals) {
      items.push({ kind: 'text', x: plot.x + plot.w + 0.1, y: y + barH / 2 - 0.12, w: right - 0.1, h: 0.24, lines: [{ t: formatMetric(totals[i]!, env.numberFormat), size: 10, bold: true, color: INK }], align: 'left', valign: 'middle' });
    }
  });
  // 内訳の境目を結ぶ線（最後の境目＝100% は結ばない）
  for (let i = 0; i + 1 < edges.length; i++) {
    const yA = plot.y + slot * i + (slot + barH) / 2, yB = plot.y + slot * (i + 1) + (slot - barH) / 2;
    edges[i]!.slice(0, -1).forEach((xa, j) => items.push({ kind: 'line', x1: xa, y1: yA, x2: edges[i + 1]![j]!, y2: yB, color: AXIS.base, width: 0.75, dash: true }));
  }
  return { items, anchors: {} };
};

/**
 * 差分バー：基準と比較先の差だけを横棒で（NarratiX の buildVarianceData_ と色）。
 * プラスは緑で右へ、マイナスは赤で左へ。差の値は棒の先に。強調した項目以外は薄くする。
 */
export const varianceBar: ChartLayout = (ctx) => {
  const rows = ctx.alignTarget('rows')?.rows;
  if (rows) {
    const out = alignedVariance(ctx, rows);
    return ctx.control<string>('side_form') === 'numbers' ? asNumbers(ctx, out) : out;
  }
  // 付け合わせの形：伸び率の横棒（CAGR の表の棒の形）／ウォーターフォール（増加額の、合計の始点→終点の形）
  const measure = ctx.control<string>('side_measure');
  // 上下構成の下段：項目を横に並べた縦の棒（項目が多くても幅で読める）
  if (ctx.control<string>('orientation') === 'vertical') return verticalSide(ctx, measure ?? 'diff');
  if (measure === 'cagr') return rateBars(ctx);
  if (measure === 'bridge') return bridgeBars(ctx);
  const env = envOf(ctx);
  const data = varianceData(ctx);
  if (!data || !data.items.length) return { items: [note(ctx, slideText(ctx.locale, 'needTwoRows'))], anchors: {} };
  const hl = ctx.control<string>('highlight');
  const focus = hl && data.items.some((d) => d.name === hl) ? hl : null;
  // 主役のチャートの横に置いた時（付け合わせ）は、色＝項目にそろえる（左と同じ色、少し淡く）。緑・赤の「良し悪し」の色は使わない。
  // 強調した時は、その項目だけ左と同じ色、ほかは薄いグレー（マイナスだけ赤）。値のラベルは濃い色
  const linked = ctx.mainSeriesColors?.();
  const barColor = (name: string, diff: number): { fill: string; text: string } => {
    if (!linked) {
      const c = diff > 0 ? DIFF.up : diff < 0 ? DIFF.down : DIFF.zero;
      return focus && name !== focus ? { fill: FOCUS.otherBar, text: SEC } : { fill: c, text: c };
    }
    const own = linked.colors[name] ?? FOCUS.otherBar;
    const text = diff < 0 ? DIFF.down : INK;
    if (focus) return name === focus ? { fill: linked.focus ?? env.accent ?? own, text } : { fill: diff < 0 ? DIFF.down : FOCUS.otherBar, text: diff < 0 ? DIFF.down : SEC };
    return { fill: soften(own), text };
  };
  const items: SceneItem[] = [];
  // 付け合わせの時は、何の数字か（増加額・増減額・増減）と単位・期間を必ず見出しに（左は %、右は実額でも迷わない）
  const sideTitle = () => {
    const key = nonAdditiveUnit(ctx.unit) ? 'sideChange' : data.items.every((d) => d.diff >= 0) ? 'sideIncrease' : 'sideChangeAmount';
    return slideText(ctx.locale, key, { unit: ctx.unit ? (ctx.locale === 'ja' ? `${ctx.unit}、` : `${ctx.unit}, `) : '', from: data.baseLabel, to: data.compareLabel });
  };
  const head = linked
    ? layoutHeader(ctx.rect, [], null, sideTitle())
    : layoutHeader(ctx.rect, [], unitNote(ctx), ctx.periodInHeader ? null : slideText(ctx.locale, 'diffBetween', { from: data.baseLabel, to: data.compareLabel }));
  items.push(...head.items);
  const tc = totalChangeText(ctx, data.items, data.baseLabel, data.compareLabel);
  if (tc) items.push(totalChangeItem(ctx, tc, ctx.rect.y + head.height));
  const tcH = tc ? TOTAL_CHANGE_H : 0;
  const cats = data.items.map((d) => d.name);
  const label = (v: number) => signed(v);
  const lw = Math.max(...data.items.map((d) => textWidth(label(d.diff), 10))) + 0.15;
  const hasNeg = data.items.some((d) => d.diff < 0), hasPos = data.items.some((d) => d.diff > 0);
  const g = labelGutter(cats, ctx.rect.w);
  const plot: Rect = {
    x: ctx.rect.x + g + (hasNeg ? lw : 0), y: ctx.rect.y + head.height + tcH + 0.1,
    w: ctx.rect.w - g - (hasNeg ? lw : 0) - (hasPos ? lw : 0.1), h: ctx.rect.h - head.height - tcH - 0.2,
  };
  items.push(...categoryLabelsLeft(plot, cats, ctx.rect.x));
  const scale = valueScale([0, ...data.items.map((d) => d.diff)]);
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  const zero = xOf(Math.min(Math.max(0, scale.min), scale.max));
  const slot = plot.h / cats.length;
  const barH = Math.min(slot * 0.6, 0.5);
  data.items.forEach((d, i) => {
    const y = plot.y + slot * i + (slot - barH) / 2;
    const c = barColor(d.name, d.diff);
    const p = xOf(d.diff);
    const w = Math.abs(p - zero);
    if (w > 0.0005) items.push({ kind: 'box', x: Math.min(p, zero), y, w, h: barH, fill: c.fill });
    const t = label(d.diff);
    const pos = d.diff >= 0;
    items.push({ kind: 'text', x: pos ? p + 0.06 : p - 0.06 - lw, y: y + barH / 2 - 0.12, w: lw, h: 0.24, lines: [{ t, size: 10, bold: true, color: c.text }], align: pos ? 'left' : 'right', valign: 'middle' });
  });
  items.push({ kind: 'line', x1: zero, y1: plot.y, x2: zero, y2: plot.y + plot.h, color: '#6B7280', width: 1 });
  return { items, anchors: {} };
};

/**
 * 行をそろえた増減（B1：順位の横棒｜前回からの増減。docs/composition-review.md）。
 * 右だけを独自に並べ替えず、左の順位の行と同じ高さに置く。項目名は左にあるので出さない。
 * 比べる2時点：左で順位を取った時点と、その1つ前（「前回からの増減」）。色は左と同じ（色＝項目）、マイナスは赤
 */
function alignedVariance(ctx: ChartCtx, rows: NonNullable<PanelAnchors['rows']>): { items: SceneItem[]; anchors: PanelAnchors } {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const ci = rows.target ? m.rows.indexOf(rows.target) : -1;
  const at = ci < 0 ? m.rows.length - 1 : ci;
  if (ctx.control<string>('side_measure') === 'cagr') return alignedRate(ctx, rows, at);
  if (ctx.control<string>('side_measure') === 'metric2') return alignedSecond(ctx, rows, at);
  const bi = at - 1;
  if (bi < 0) return { items: [note(ctx, slideText(ctx.locale, 'needTwoRows'))], anchors: {} };
  const diffOf = (name: string): number | null => {
    const k = m.cols.indexOf(name);
    const a = m.current.values[bi]?.[k], b = m.current.values[at]?.[k];
    return k < 0 || a == null || b == null ? null : b - a;
  };
  const diffs = rows.keys.map(diffOf);
  const vals = diffs.filter((v): v is number => v != null);
  const items: SceneItem[] = [];
  const key = nonAdditiveUnit(ctx.unit) ? 'sideChange' : vals.every((d) => d >= 0) ? 'sideIncrease' : 'sideChangeAmount';
  const title = slideText(ctx.locale, key, { unit: ctx.unit ? (ctx.locale === 'ja' ? `${ctx.unit}、` : `${ctx.unit}, `) : '', from: m.rows[bi]!, to: m.rows[at]! });
  items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.26, lines: [{ t: title, size: 10, bold: true, color: INK }], align: 'left', valign: 'top' });
  const lw = Math.max(0.4, ...vals.map((v) => textWidth(signed(v), 10))) + 0.15;
  const hasNeg = vals.some((v) => v < 0);
  const plot = { x: ctx.rect.x + (hasNeg ? lw : 0.05), w: ctx.rect.w - (hasNeg ? lw : 0.05) - lw };
  const scale = valueScale([0, ...vals]);
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  const zero = xOf(Math.min(Math.max(0, scale.min), scale.max));
  const linked = ctx.mainSeriesColors?.();
  const hl = ctx.control<string>('highlight');
  const focus = hl && rows.keys.includes(hl) ? hl : null;
  const barH = Math.min(rows.h * 0.6, 0.5);
  rows.keys.forEach((name, i) => {
    const d = diffs[i];
    if (d == null) return;
    const y = rows.y[i]! - barH / 2;
    const own = linked?.colors[name] ?? FOCUS.primary;
    const fill = focus ? (name === focus ? linked?.focus ?? env.accent ?? own : d < 0 ? DIFF.down : FOCUS.otherBar) : d < 0 ? DIFF.down : soften(own);
    const p = xOf(d);
    const w = Math.abs(p - zero);
    if (w > 0.0005) items.push({ kind: 'box', x: Math.min(p, zero), y, w, h: barH, fill });
    const pos = d >= 0;
    items.push({ kind: 'text', x: pos ? p + 0.06 : p - 0.06 - lw, y: rows.y[i]! - 0.12, w: lw, h: 0.24, lines: [{ t: signed(d), size: 10, bold: true, color: d < 0 ? DIFF.down : INK }], align: pos ? 'left' : 'right', valign: 'middle' });
  });
  items.push({ kind: 'line', x1: zero, y1: rows.top, x2: zero, y2: rows.bottom, color: '#6B7280', width: 1 });
  return { items, anchors: {} };
}

/**
 * 行をそろえた伸び率（B2：順位の横棒｜伸び率）。最初の時点から、左で順位を取った時点までの CAGR（年でなければ期間の伸び率）。
 * 右だけを並べ替えない。計算できない項目（始点が 0 以下・空欄）は N/A。色は左と同じ、マイナスは赤
 */
function alignedRate(ctx: ChartCtx, rows: NonNullable<PanelAnchors['rows']>, at: number): { items: SceneItem[]; anchors: PanelAnchors } {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const labels = m.rows.slice(0, at + 1);
  const span = growthSpan(labels);
  if (!span) return { items: [note(ctx, slideText(ctx.locale, 'needTwoRows'))], anchors: {} };
  const rateOf = (name: string): number | null => {
    const k = m.cols.indexOf(name);
    return k < 0 ? null : spanRate(span, m.current.values[span.fromIndex]?.[k], m.current.values[span.toIndex]?.[k]);
  };
  const rates = rows.keys.map(rateOf);
  const vals = rates.filter((v): v is number => v != null);
  const items: SceneItem[] = [];
  const title = slideText(ctx.locale, span.years != null ? 'sideCagr' : 'sideGrowth', { from: span.fromLabel, to: span.toLabel });
  items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.26, lines: [{ t: title, size: 10, bold: true, color: INK }], align: 'left', valign: 'top' });
  const lw = Math.max(0.5, ...rates.map((v) => textWidth(formatRate(v), 10))) + 0.15;
  const hasNeg = vals.some((v) => v < 0);
  const plot = { x: ctx.rect.x + (hasNeg ? lw : 0.05), w: ctx.rect.w - (hasNeg ? lw : 0.05) - lw };
  const scale = valueScale([0, ...vals]);
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  const zero = xOf(Math.min(Math.max(0, scale.min), scale.max));
  const linked = ctx.mainSeriesColors?.();
  const hl = ctx.control<string>('highlight');
  const focus = hl && rows.keys.includes(hl) ? hl : null;
  const barH = Math.min(rows.h * 0.6, 0.5);
  rows.keys.forEach((name, i) => {
    const r = rates[i];
    const ty = rows.y[i]! - 0.12;
    if (r == null) {
      items.push({ kind: 'text', x: zero + 0.06, y: ty, w: lw, h: 0.24, lines: [{ t: 'N/A', size: 10, color: SEC }], align: 'left', valign: 'middle' });
      return;
    }
    const own = linked?.colors[name] ?? FOCUS.primary;
    const fill = focus ? (name === focus ? linked?.focus ?? env.accent ?? own : r < 0 ? DIFF.down : FOCUS.otherBar) : r < 0 ? DIFF.down : soften(own);
    const p = xOf(r);
    const w = Math.abs(p - zero);
    if (w > 0.0005) items.push({ kind: 'box', x: Math.min(p, zero), y: rows.y[i]! - barH / 2, w, h: barH, fill });
    const pos = r >= 0;
    items.push({ kind: 'text', x: pos ? p + 0.06 : p - 0.06 - lw, y: ty, w: lw, h: 0.24, lines: [{ t: formatRate(r), size: 10, bold: true, color: r < 0 ? DIFF.down : INK }], align: pos ? 'left' : 'right', valign: 'middle' });
  });
  items.push({ kind: 'line', x1: zero, y1: rows.top, x2: zero, y2: rows.bottom, color: '#6B7280', width: 1 });
  return { items, anchors: {} };
}

/**
 * 行をそろえた2つ目の指標（B4：順位の横棒｜2つ目の指標）。左の指標（今の表）の順位の行に、右の指標（2つ目の表）の値を並べる。
 * 単位が違う（人数と金額など）ので、右は自分の軸と単位で描く（見出しに指標名＝単位を出す）。右だけを並べ替えない
 */
function alignedSecond(ctx: ChartCtx, rows: NonNullable<PanelAnchors['rows']>, at: number): { items: SceneItem[]; anchors: PanelAnchors } {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const base = m.base;
  const has = base?.values.some((r) => r.some((v) => v != null));
  if (!base || !has) return { items: [note(ctx, slideText(ctx.locale, 'slopePairNeeds'))], anchors: {} };
  const valOf = (name: string): number | null => {
    const k = m.cols.indexOf(name);
    const v = k < 0 ? null : base.values[at]?.[k];
    return v == null || !Number.isFinite(v) ? null : v;
  };
  const vals = rows.keys.map(valOf);
  const nums = vals.filter((v): v is number => v != null);
  const items: SceneItem[] = [];
  const name2 = base.label || slideText(ctx.locale, 'colsFallback');
  const when = m.rows[at];
  const title = when ? (ctx.locale === 'ja' ? `${name2}（${when}）` : `${name2} (${when})`) : name2;
  items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.26, lines: [{ t: title, size: 10, bold: true, color: INK }], align: 'left', valign: 'top' });
  const fmt = (v: number) => formatMetric(v, env.numberFormat);
  const lw = Math.max(0.4, ...nums.map((v) => textWidth(fmt(v), 10))) + 0.15;
  const hasNeg = nums.some((v) => v < 0);
  const plot = { x: ctx.rect.x + (hasNeg ? lw : 0.05), w: ctx.rect.w - (hasNeg ? lw : 0.05) - lw };
  const scale = valueScale([0, ...nums]);
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  const zero = xOf(Math.min(Math.max(0, scale.min), scale.max));
  const linked = ctx.mainSeriesColors?.();
  const hl = ctx.control<string>('highlight');
  const focus = hl && rows.keys.includes(hl) ? hl : null;
  const barH = Math.min(rows.h * 0.6, 0.5);
  rows.keys.forEach((name, i) => {
    const v = vals[i];
    const ty = rows.y[i]! - 0.12;
    if (v == null) { items.push({ kind: 'text', x: zero + 0.06, y: ty, w: lw, h: 0.24, lines: [{ t: '—', size: 10, color: SEC }], align: 'left', valign: 'middle' }); return; }
    const own = linked?.colors[name] ?? FOCUS.primary;
    const fill = focus ? (name === focus ? linked?.focus ?? env.accent ?? own : FOCUS.otherBar) : soften(own);
    const p = xOf(v);
    const w = Math.abs(p - zero);
    if (w > 0.0005) items.push({ kind: 'box', x: Math.min(p, zero), y: rows.y[i]! - barH / 2, w, h: barH, fill });
    const pos = v >= 0;
    items.push({ kind: 'text', x: pos ? p + 0.06 : p - 0.06 - lw, y: ty, w: lw, h: 0.24, lines: [{ t: fmt(v), size: 10, bold: true, color: INK }], align: pos ? 'left' : 'right', valign: 'middle' });
  });
  items.push({ kind: 'line', x1: zero, y1: rows.top, x2: zero, y2: rows.bottom, color: '#6B7280', width: 1 });
  return { items, anchors: {} };
}

/**
 * 行をそろえた付け合わせの「数値だけ」の形：棒と軸線を描かず、数字だけを左の行にそろえて右寄せで並べる。
 * 狭い幅でも正確な値を読める（見出しはそのまま）
 */
function asNumbers(ctx: ChartCtx, out: { items: SceneItem[]; anchors: PanelAnchors }): { items: SceneItem[]; anchors: PanelAnchors } {
  const colW = Math.min(ctx.rect.w, 1.3);
  const items = out.items.filter((i) => i.kind === 'text').map((i, k) => (k === 0 || i.kind !== 'text' ? i : { ...i, x: ctx.rect.x, w: colW, align: 'right' as const }));
  return { items, anchors: out.anchors };
}

interface Col { name: string; a: number; b: number; label: string; fill: string; labelColor: string }

/** 縦の棒を横に並べる（上下構成の下段）。a→b の棒（普通は 0→値、ウォーターフォールは途中から）。項目名は下に */
function columns(ctx: ChartCtx, title: string, cols: Col[], connect = false): { items: SceneItem[]; anchors: PanelAnchors } {
  const items: SceneItem[] = [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.26, lines: [{ t: title, size: 10, bold: true, color: INK }], align: 'left', valign: 'top' }];
  if (!cols.length) return { items, anchors: {} };
  const labelH = 0.42;
  const top = ctx.rect.y + 0.5, bottom = ctx.rect.y + ctx.rect.h - labelH;
  const scale = valueScale([0, ...cols.flatMap((c) => [c.a, c.b])]);
  const yOf = (v: number) => bottom - (bottom - top) * scale.ratio(v);
  const zero = yOf(Math.min(Math.max(0, scale.min), scale.max));
  const slot = ctx.rect.w / cols.length;
  const barW = Math.min(slot * 0.6, 0.8);
  cols.forEach((c, i) => {
    const x = ctx.rect.x + slot * i + (slot - barW) / 2;
    const y1 = yOf(Math.max(c.a, c.b)), y2 = yOf(Math.min(c.a, c.b));
    if (y2 - y1 > 0.0005) items.push({ kind: 'box', x, y: y1, w: barW, h: y2 - y1, fill: c.fill });
    const up = c.b >= c.a;
    items.push({ kind: 'text', x: x - 0.3, y: up ? y1 - 0.24 : y2 + 0.02, w: barW + 0.6, h: 0.22, lines: [{ t: c.label, size: 9, bold: true, color: c.labelColor }], align: 'center', valign: 'middle' });
    items.push({ kind: 'text', x: ctx.rect.x + slot * i, y: bottom + 0.04, w: slot, h: labelH - 0.04, lines: wrapText(c.name, 9, slot - 0.05, 2).map((t) => ({ t, size: 9, bold: true, color: INK })), align: 'center', valign: 'top' });
    if (connect && i + 1 < cols.length) {
      const yc = yOf(c.b);
      items.push({ kind: 'line', x1: x + barW, y1: yc, x2: ctx.rect.x + slot * (i + 1) + (slot - barW) / 2, y2: yc, color: AXIS.base, width: 0.75, dash: true });
    }
  });
  items.push({ kind: 'line', x1: ctx.rect.x, y1: zero, x2: ctx.rect.x + ctx.rect.w, y2: zero, color: '#6B7280', width: 1 });
  return { items, anchors: {} };
}

/** 上下構成の下段の付け合わせ：増加額（差分）・伸び率・ウォーターフォールを、縦の棒で横に並べる */
function verticalSide(ctx: ChartCtx, measure: string): { items: SceneItem[]; anchors: PanelAnchors } {
  const env = envOf(ctx);
  const m = ctx.matrix;
  if (m.rows.length < 2) return { items: [note(ctx, slideText(ctx.locale, 'needTwoRows'))], anchors: {} };
  const linked = ctx.mainSeriesColors?.();
  const hl = ctx.control<string>('highlight');
  const others = slideText(ctx.locale, 'others');
  const colorOf = (name: string, v: number) => {
    const own = linked?.colors[name] ?? FOCUS.primary;
    if (hl && m.cols.includes(hl)) return name === hl ? linked?.focus ?? env.accent ?? own : v < 0 ? DIFF.down : FOCUS.otherBar;
    return v < 0 ? DIFF.down : soften(own);
  };
  const unitPart = ctx.unit ? (ctx.locale === 'ja' ? `${ctx.unit}、` : `${ctx.unit}, `) : '';
  const from = m.rows[0]!, to = m.rows[m.rows.length - 1]!;
  if (measure === 'cagr') {
    const span = growthSpan(m.rows);
    if (!span) return { items: [note(ctx, slideText(ctx.locale, 'cagrNeedsYears'))], anchors: {} };
    const list = m.cols.map((n, k) => ({ n, r: spanRate(span, m.current.values[span.fromIndex]?.[k], m.current.values[span.toIndex]?.[k]) }))
      .sort((a, b) => Number(a.n === others) - Number(b.n === others) || (b.r ?? -Infinity) - (a.r ?? -Infinity));
    return columns(ctx, slideText(ctx.locale, span.years != null ? 'sideCagr' : 'sideGrowth', { from: span.fromLabel, to: span.toLabel }),
      list.map((x) => ({ name: x.n, a: 0, b: x.r ?? 0, label: formatRate(x.r), fill: colorOf(x.n, x.r ?? 0), labelColor: (x.r ?? 0) < 0 ? DIFF.down : x.r == null ? SEC : INK })));
  }
  const at = (i: number, k: number) => m.current.values[i]?.[k] ?? 0;
  const last = m.rows.length - 1;
  if (measure === 'bridge') {
    const TOTAL = /^(合計|総計|計|全体|トータル|total|grand total|all)$|合計|総計|total/i;
    const parts = m.cols.map((n, k) => ({ n, k })).filter((x) => !TOTAL.test(x.n.trim()));
    const start = parts.reduce((a, x) => a + at(0, x.k), 0), end = parts.reduce((a, x) => a + at(last, x.k), 0);
    const ds = parts.map((x) => ({ n: x.n, d: at(last, x.k) - at(0, x.k) })).sort((a, b) => Number(a.n === others) - Number(b.n === others) || b.d - a.d);
    let cum = start;
    const cols: Col[] = [{ name: from, a: 0, b: start, label: formatMetric(start, env.numberFormat), fill: '#8A94A0', labelColor: INK }];
    for (const x of ds) { cols.push({ name: x.n, a: cum, b: cum + x.d, label: signed(x.d), fill: colorOf(x.n, x.d), labelColor: x.d < 0 ? DIFF.down : INK }); cum += x.d; }
    cols.push({ name: to, a: 0, b: end, label: formatMetric(end, env.numberFormat), fill: '#8A94A0', labelColor: INK });
    return columns(ctx, slideText(ctx.locale, nonAdditiveUnit(ctx.unit) ? 'sideChange' : 'sideBridge', { unit: unitPart, from, to }), cols, true);
  }
  const list = m.cols.map((n, k) => ({ n, d: at(last, k) - at(0, k) })).sort((a, b) => Number(a.n === others) - Number(b.n === others) || b.d - a.d);
  const key = nonAdditiveUnit(ctx.unit) ? 'sideChange' : list.every((x) => x.d >= 0) ? 'sideIncrease' : 'sideChangeAmount';
  return columns(ctx, slideText(ctx.locale, key, { unit: unitPart, from, to }), list.map((x) => ({ name: x.n, a: 0, b: x.d, label: signed(x.d), fill: colorOf(x.n, x.d), labelColor: x.d < 0 ? DIFF.down : INK })));
}

/** 自分で並べる横棒の行（項目名は左の余白に）。付け合わせの形で、左にそろえる行が無い時 */
function ownRows(ctx: ChartCtx, names: string[], topPad = 0.36): { rows: NonNullable<PanelAnchors['rows']>; labels: SceneItem[]; inner: ChartCtx } {
  const g = labelGutter(names, ctx.rect.w);
  const top = ctx.rect.y + topPad, bottom = ctx.rect.y + ctx.rect.h - 0.1;
  const h = (bottom - top) / Math.max(1, names.length);
  const plot: Rect = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g, h: bottom - top };
  return {
    rows: { keys: names, y: names.map((_, i) => top + h * (i + 0.5)), h, top, bottom },
    labels: categoryLabelsLeft(plot, names, ctx.rect.x),
    inner: { ...ctx, rect: { ...ctx.rect, x: plot.x, w: plot.w } },
  };
}

/** 伸び率の横棒（CAGR の表の、棒の形）。伸び率の高い順。計算できない項目は最後に N/A */
function rateBars(ctx: ChartCtx): { items: SceneItem[]; anchors: PanelAnchors } {
  const m = ctx.matrix;
  const span = growthSpan(m.rows);
  if (!span) return { items: [note(ctx, slideText(ctx.locale, 'cagrNeedsYears'))], anchors: {} };
  const others = slideText(ctx.locale, 'others');
  const rate = (k: number) => spanRate(span, m.current.values[span.fromIndex]?.[k], m.current.values[span.toIndex]?.[k]);
  const names = m.cols.map((n, k) => ({ n, r: rate(k) }))
    .sort((a, b) => Number(a.n === others) - Number(b.n === others) || (b.r ?? -Infinity) - (a.r ?? -Infinity)).map((x) => x.n);
  const own = ownRows(ctx, names);
  const out = alignedRate(own.inner, own.rows, m.rows.length - 1);
  return { items: [...own.labels, ...out.items], anchors: {} };
}

/**
 * ウォーターフォール（付け合わせの形）：合計の始点 → 項目ごとの増減 → 合計の終点。各増減が全体の変化に足し上がることを見せる。
 * 項目が全体を構成する時だけ選べる（画面で判定）。合計・小計の列は足さない
 */
function bridgeBars(ctx: ChartCtx): { items: SceneItem[]; anchors: PanelAnchors } {
  const env = envOf(ctx);
  const m = ctx.matrix;
  if (m.rows.length < 2) return { items: [note(ctx, slideText(ctx.locale, 'needTwoRows'))], anchors: {} };
  const from = 0, to = m.rows.length - 1;
  const TOTAL = /^(合計|総計|計|全体|トータル|total|grand total|all)$|合計|総計|total/i;
  const parts = m.cols.map((n, k) => ({ n, k })).filter((x) => !TOTAL.test(x.n.trim()));
  const at = (i: number, k: number) => m.current.values[i]?.[k] ?? 0;
  const start = parts.reduce((a, x) => a + at(from, x.k), 0);
  const end = parts.reduce((a, x) => a + at(to, x.k), 0);
  const others = slideText(ctx.locale, 'others');
  const deltas = parts.map((x) => ({ n: x.n, d: at(to, x.k) - at(from, x.k) }))
    .sort((a, b) => Number(a.n === others) - Number(b.n === others) || b.d - a.d);
  const names = [m.rows[from]!, ...deltas.map((x) => x.n), m.rows[to]!];
  const own = ownRows(ctx, names);
  const inner = own.inner, rows = own.rows;
  let cum = start;
  const segs = [{ a: 0, b: start, total: true, n: names[0]! }, ...deltas.map((x) => { const s0 = { a: cum, b: cum + x.d, total: false, n: x.n }; cum += x.d; return s0; }), { a: 0, b: end, total: true, n: names[names.length - 1]! }];
  const scale = valueScale([0, ...segs.flatMap((s0) => [s0.a, s0.b])]);
  const lw = Math.max(0.4, ...segs.map((s0) => textWidth(s0.total ? formatMetric(s0.b, env.numberFormat) : signed(s0.b - s0.a), 10))) + 0.15;
  const plotW = inner.rect.w - lw;
  const xOf = (v: number) => inner.rect.x + plotW * scale.ratio(v);
  const linked = ctx.mainSeriesColors?.();
  const hl = ctx.control<string>('highlight');
  const focus = hl && deltas.some((x) => x.n === hl) ? hl : null;
  const barH = Math.min(rows.h * 0.6, 0.45);
  const items: SceneItem[] = [...own.labels];
  const key = nonAdditiveUnit(ctx.unit) ? 'sideChange' : 'sideBridge';
  items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.26, lines: [{ t: slideText(ctx.locale, key, { unit: ctx.unit ? (ctx.locale === 'ja' ? `${ctx.unit}、` : `${ctx.unit}, `) : '', from: m.rows[from]!, to: m.rows[to]! }), size: 10, bold: true, color: INK }], align: 'left', valign: 'top' });
  segs.forEach((s0, i) => {
    const y = rows.y[i]! - barH / 2;
    const x1 = xOf(Math.min(s0.a, s0.b)), x2 = xOf(Math.max(s0.a, s0.b));
    const d = s0.b - s0.a;
    const own0 = linked?.colors[s0.n] ?? FOCUS.primary;
    const fill = s0.total ? '#8A94A0' : focus ? (s0.n === focus ? linked?.focus ?? env.accent ?? own0 : d < 0 ? DIFF.down : FOCUS.otherBar) : d < 0 ? DIFF.down : soften(own0);
    if (x2 - x1 > 0.0005) items.push({ kind: 'box', x: x1, y, w: x2 - x1, h: barH, fill });
    const t = s0.total ? formatMetric(s0.b, env.numberFormat) : signed(d);
    items.push({ kind: 'text', x: x2 + 0.06, y: rows.y[i]! - 0.12, w: lw, h: 0.24, lines: [{ t, size: 10, bold: true, color: !s0.total && d < 0 ? DIFF.down : INK }], align: 'left', valign: 'middle' });
    // 次の棒へのつなぎ線
    if (i + 1 < segs.length) {
      const xe = xOf(s0.total && i > 0 ? s0.b : s0.b);
      items.push({ kind: 'line', x1: xe, y1: y + barH, x2: xe, y2: rows.y[i + 1]! - barH / 2, color: AXIS.base, width: 0.75, dash: true });
    }
  });
  return { items, anchors: {} };
}

/** 付け合わせの棒の色：主役と同じ色相で、少し淡く（白を 25% 混ぜる） */
function soften(hex: string, k = 0.25): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`.toUpperCase();
}

/** ラベルの縦位置を、重ならないように最小の間隔で押し広げる（並び順は保つ） */
export function spreadLabels(ys: number[], gap: number, lo: number, hi: number): number[] {
  const idx = ys.map((_, i) => i).sort((a, b) => ys[a]! - ys[b]!);
  const out = [...ys];
  for (let j = 1; j < idx.length; j++) {
    const a = idx[j - 1]!, b = idx[j]!;
    if (out[b]! - out[a]! < gap) out[b] = out[a]! + gap;
  }
  // 下にはみ出したら、下から押し戻す
  const lastI = idx[idx.length - 1];
  if (lastI != null && out[lastI]! > hi) {
    out[lastI] = hi;
    for (let j = idx.length - 2; j >= 0; j--) {
      const a = idx[j]!, b = idx[j + 1]!;
      if (out[b]! - out[a]! < gap) out[a] = out[b]! - gap;
    }
  }
  return out.map((y) => Math.max(lo, y));
}
