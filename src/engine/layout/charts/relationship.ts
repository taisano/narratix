import { slideText, type SlideTextKey } from '@/i18n/slide';
import { formatMetric } from '../../format';
import { rangeScale, type ValueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { textWidth } from '../../text';
import { AXIS, FOCUS, INK, SEC } from '../../theme';
import { layoutHeader, tickFormatter } from './common';
import { envOf, type ChartCtx, type ChartLayout } from './context';

/** 点（NarratiX の buildRelationshipContextFromHelper_）：行＝項目、1列目＝X、2列目＝Y、3列目＝大きさ。X・Y が数値でない行は除く */
export interface Point { label: string; x: number; y: number; size: number | null; group: string | null }

/** グループの色（NarratiX の buildRelationshipGroupStyleMap_ と同じ）。グループ無しの点はグレー */
export const GROUP_COLORS = ['#0B2D4D', '#E67E22', '#0F766E', '#8E44AD', '#D64545', '#1D4ED8', '#059669', '#B45309'];
export const GROUP_EMPTY = '#B8C0CA';

export function pointsOf(ctx: ChartCtx): { points: Point[]; xName: string; yName: string; sizeName: string | null } | null {
  const m = ctx.matrix;
  if (m.cols.length < 2) return null;
  const points: Point[] = [];
  m.rows.forEach((label, i) => {
    const r = m.current.values[i] ?? [];
    const sw = ctx.control<string>('xy_swap') === 'swapped';
    const x = sw ? r[1] : r[0], y = sw ? r[0] : r[1];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const s = r[2];
    const g = m.groups?.[i]?.trim() || null;
    points.push({ label, x, y, size: s != null && Number.isFinite(s) ? s : null, group: g });
  });
  if (!points.length) return null;
  // 軸の名前は横軸・縦軸ごと（空なら、その軸に来た列の名前）
  const sw = ctx.control<string>('xy_swap') === 'swapped';
  const xt = ctx.control<string>('x_title')?.trim(), yt = ctx.control<string>('y_title')?.trim();
  return { points, xName: xt || m.cols[sw ? 1 : 0]!, yName: yt || m.cols[sw ? 0 : 1]!, sizeName: m.cols[2] ?? null };
}

/** 相関係数（ピアソン）。2点未満か、ばらつきが無ければ null */
export function correlation(points: Point[]): number | null {
  if (points.length < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const my = points.reduce((a, p) => a + p.y, 0) / points.length;
  let cov = 0, sx = 0, sy = 0;
  for (const p of points) { cov += (p.x - mx) * (p.y - my); sx += (p.x - mx) ** 2; sy += (p.y - my) ** 2; }
  return sx > 0 && sy > 0 ? cov / Math.sqrt(sx * sy) : null;
}

/** 相関の強さの言葉（NarratiX の getRelationshipCorrelationDescriptor_ と同じ区切り） */
export function correlationWord(r: number): SlideTextKey {
  if (r >= 0.7) return 'corrStrongPos';
  if (r >= 0.4) return 'corrModPos';
  if (r >= 0.2) return 'corrWeakPos';
  if (r > -0.2) return 'corrNone';
  if (r > -0.4) return 'corrWeakNeg';
  if (r > -0.7) return 'corrModNeg';
  return 'corrStrongNeg';
}

export const median = (vs: number[]) => {
  const s = [...vs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

const R_DOT = 0.07;

function frame(ctx: ChartCtx, data: NonNullable<ReturnType<typeof pointsOf>>, bubble: boolean) {
  const env = envOf(ctx);
  const fmt = tickFormatter(env.numberFormat);
  const items: SceneItem[] = [];
  const r = correlation(data.points);
  // 相関係数は「相関係数を表示」がオンの時だけ。単位は軸の名前に書く（単位の注記は出さない）
  const notes = [
    r != null && ctx.control<boolean>('show_corr') === true ? slideText(ctx.locale, 'relCorr', { r: r.toFixed(2), desc: slideText(ctx.locale, correlationWord(r)) }) : null,
    bubble && data.sizeName ? slideText(ctx.locale, 'relSize', { name: data.sizeName }) : null,
  ].filter(Boolean).join('　');
  // グループがあれば凡例と色分け
  const groups = [...new Set(data.points.map((p) => p.group).filter((g): g is string => !!g))];
  const groupColor = (g: string | null) => (g ? GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length]! : GROUP_EMPTY);
  const head = layoutHeader(ctx.rect, groups.map((g) => ({ name: g, color: groupColor(g), shape: 'box' as const })), notes || null);
  items.push(...head.items);
  const xs = rangeScale(data.points.map((p) => p.x));
  const ys = rangeScale(data.points.map((p) => p.y));
  const g = Math.max(0.4, ...ys.ticks.map((t) => textWidth(fmt(t), 9))) + 0.45;
  const plot: Rect = { x: ctx.rect.x + g, y: ctx.rect.y + head.height + 0.4, w: ctx.rect.w - g - 0.2, h: ctx.rect.h - head.height - 1.05 };
  const X = (v: number) => plot.x + plot.w * xs.ratio(v);
  const Y = (v: number) => plot.y + plot.h * (1 - ys.ratio(v));
  const grid = env.gridlines;
  for (const t of xs.ticks) {
    items.push({ kind: 'text', x: X(t) - 0.5, y: plot.y + plot.h + 0.05, w: 1, h: 0.2, lines: [{ t: fmt(t), size: 9, color: AXIS.label }], align: 'center', valign: 'top' });
    if (grid !== 'off') items.push({ kind: 'line', x1: X(t), y1: plot.y, x2: X(t), y2: plot.y + plot.h, color: grid === 'on' ? AXIS.gridStrong : AXIS.grid, width: 0.75 });
  }
  for (const t of ys.ticks) {
    items.push({ kind: 'text', x: plot.x - 1.1, y: Y(t) - 0.1, w: 1.02, h: 0.2, lines: [{ t: fmt(t), size: 9, color: AXIS.label }], align: 'right', valign: 'middle' });
    if (grid !== 'off') items.push({ kind: 'line', x1: plot.x, y1: Y(t), x2: plot.x + plot.w, y2: Y(t), color: grid === 'on' ? AXIS.gridStrong : AXIS.grid, width: 0.75 });
  }
  // 枠（左と下）と軸の名前
  items.push({ kind: 'line', x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h, color: AXIS.base, width: 1 });
  items.push({ kind: 'line', x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.h, color: AXIS.base, width: 1 });
  // 軸の名前：横軸は下の中央、縦軸は軸の上（左寄せ）
  items.push({ kind: 'text', x: plot.x, y: plot.y + plot.h + 0.28, w: plot.w, h: 0.22, lines: [{ t: data.xName, size: 10, bold: true, color: INK }], align: 'center', valign: 'middle' });
  items.push({ kind: 'text', x: ctx.rect.x, y: plot.y - 0.3, w: Math.min(ctx.rect.w * 0.5, textWidth(data.yName, 10) + 0.3), h: 0.24, lines: [{ t: data.yName, size: 10, bold: true, color: INK }], align: 'left', valign: 'middle' });
  // 象限（中央値で4つに分ける）
  if (ctx.complement('quadrants')) {
    const mx = median(data.points.map((p) => p.x)), my = median(data.points.map((p) => p.y));
    items.push({ kind: 'line', x1: X(mx), y1: plot.y, x2: X(mx), y2: plot.y + plot.h, color: AXIS.reference, width: 1, dash: true });
    items.push({ kind: 'line', x1: plot.x, y1: Y(my), x2: plot.x + plot.w, y2: Y(my), color: AXIS.reference, width: 1, dash: true });
    items.push({ kind: 'text', x: X(mx) + 0.05, y: plot.y, w: 1.6, h: 0.2, lines: [{ t: slideText(ctx.locale, 'median', { value: formatMetric(mx, env.numberFormat) }), size: 8, color: AXIS.reference }], align: 'left', valign: 'middle' });
    items.push({ kind: 'text', x: plot.x + plot.w - 1.6, y: Y(my) - 0.21, w: 1.6, h: 0.2, lines: [{ t: slideText(ctx.locale, 'median', { value: formatMetric(my, env.numberFormat) }), size: 8, color: AXIS.reference }], align: 'right', valign: 'middle' });
  }
  return { items, plot, X, Y, xs, ys, groupColor, hasGroups: groups.length > 0 };
}

/** 点のラベル（右に。はみ出すなら左に） */
function label(items: SceneItem[], plot: Rect, x: number, y: number, r: number, t: string, dim: boolean) {
  const w = textWidth(t, 9) + 0.1;
  const right = x + r + 0.05 + w <= plot.x + plot.w + 0.15;
  items.push({ kind: 'text', x: right ? x + r + 0.04 : x - r - 0.04 - w, y: y - 0.1, w, h: 0.2, lines: [{ t, size: 9, bold: !dim, color: dim ? SEC : INK }], align: right ? 'left' : 'right', valign: 'middle' });
}

const needs = (ctx: ChartCtx) => ({
  items: [{ kind: 'text' as const, x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.5, lines: [{ t: slideText(ctx.locale, 'relNeeds'), size: 10, color: SEC }], align: 'left' as const, valign: 'top' as const }],
  anchors: {},
});

/** 強調：行（項目）の名前を選ぶ。散布図では点が項目なので、強調の欄は行から選ぶ */
const focusOf = (ctx: ChartCtx, pts: Point[]) => {
  const h = ctx.control<string>('highlight');
  return h && pts.some((p) => p.label === h) ? h : null;
};

/** 散布図：項目ごとに X と Y の位置。相関係数を右上に */
export const scatter: ChartLayout = (ctx) => {
  const data = pointsOf(ctx);
  if (!data) return needs(ctx);
  const f = frame(ctx, data, false);
  const focus = focusOf(ctx, data.points);
  for (const p of data.points) {
    const dim = !!focus && p.label !== focus;
    const x = f.X(p.x), y = f.Y(p.y);
    f.items.push({ kind: 'ellipse', x: x - R_DOT, y: y - R_DOT, w: R_DOT * 2, h: R_DOT * 2, fill: dim ? FOCUS.otherBar : f.hasGroups ? f.groupColor(p.group) : FOCUS.primary });
    label(f.items, f.plot, x, y, R_DOT, p.label, dim);
  }
  return { items: f.items, anchors: {} };
};

/** バブル：散布図に、3列目の値を円の面積で重ねる（半径は平方根で。NarratiX と同じ最小〜最大の幅） */
export const bubble: ChartLayout = (ctx) => {
  const data = pointsOf(ctx);
  if (!data) return needs(ctx);
  const f = frame(ctx, data, true);
  const focus = focusOf(ctx, data.points);
  const sizes = data.points.map((p) => Math.max(0, p.size ?? 0));
  const maxS = Math.max(1e-9, ...sizes);
  const rMin = 0.1, rMax = Math.min(0.42, Math.min(f.plot.w, f.plot.h) / 9);
  // 大きい円を先に描き、小さい円が隠れないようにする
  const order = data.points.map((_, i) => i).sort((a, b) => sizes[b]! - sizes[a]!);
  for (const i of order) {
    const p = data.points[i]!;
    const dim = !!focus && p.label !== focus;
    const r = p.size == null ? rMin : rMin + (rMax - rMin) * Math.sqrt(sizes[i]! / maxS);
    const x = f.X(p.x), y = f.Y(p.y);
    f.items.push({ kind: 'ellipse', x: x - r, y: y - r, w: r * 2, h: r * 2, fill: dim ? FOCUS.otherBar : f.hasGroups ? f.groupColor(p.group) : BUBBLE_FILL });
    label(f.items, f.plot, x, y, r, p.label, dim);
  }
  return { items: f.items, anchors: {} };
};

/** バブルの色（重なっても下が透けて見えるよう、少し明るい紺） */
const BUBBLE_FILL = '#5B7FA6';

export type { ValueScale };
