import { slideText } from '@/i18n/slide';
import type { Locale } from '@/registry';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { textWidth } from '../../text';
import { AXIS, FOCUS, INK, SEC } from '../../theme';
import { growthSpan } from '../../transform/cagr';
import { envOf, type ChartCtx, type ChartLayout } from './context';
import { slopeFormatter, unitInName } from './slope';
import { spreadLabels } from './twopoint';

/**
 * 指標間の順位スロープ（B4′。docs/composition-review.md）：同じ時点で、左の指標 → 右の指標へ項目を線で結ぶ。
 * 単位の違う実数を直接つながないように、両方の指標を「順位」か「共通の指数（項目の平均＝100）」に換算して描く。
 * 左の表＝1つ目の指標、右の表（「比較」の欄）＝2つ目の指標。行をそろえた2指標比較（B4）と同じデータ
 */
export type RankSlopeScale = 'rank' | 'index';

export interface RankSlopeItem {
  name: string;
  k: number;
  a: number | null;
  b: number | null;
  /** 順位（大きい順、同じ値は同じ順位。1 から） */
  rankA: number | null;
  rankB: number | null;
  /** 指数（その指標の項目の平均＝100） */
  indexA: number | null;
  indexB: number | null;
}

const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);

/** 大きい順の順位（同じ値は同じ順位：1, 2, 2, 4）。値の無い項目は null */
export function ranksOf(values: readonly (number | null)[]): (number | null)[] {
  return values.map((v) => (v == null ? null : 1 + values.filter((w) => w != null && w > v).length));
}

/** 項目の平均＝100 の指数。平均が 0 以下なら出さない */
export function indexOf(values: readonly (number | null)[]): (number | null)[] {
  const n = values.filter((v): v is number => v != null);
  const avg = n.length ? n.reduce((a, v) => a + v, 0) / n.length : 0;
  return values.map((v) => (v == null || !(avg > 0) ? null : (v / avg) * 100));
}

/** 比べる時点：選んだ行（比較の対象）、無ければ時間の順で最後、年でなければ最後の行 */
export function rankSlopeAt(rows: readonly string[], target?: string | null): number {
  if (target && rows.includes(target)) return rows.indexOf(target);
  const s = growthSpan(rows);
  return s ? s.toIndex : rows.length - 1;
}

/** 左右の指標の、その時点の値・順位・指数（どちらかが空の項目も含む） */
export function rankSlopeItems(cols: readonly string[], left: readonly (readonly (number | null)[])[], right: readonly (readonly (number | null)[])[] | undefined, at: number): RankSlopeItem[] {
  const a = cols.map((_, k) => num(left[at]?.[k]));
  const b = cols.map((_, k) => num(right?.[at]?.[k]));
  // 両方の指標がある項目だけで順位・指数を出す（片方だけの項目は線を引けない）
  const both = cols.map((_, k) => a[k] != null && b[k] != null);
  const pick = (xs: (number | null)[]) => xs.map((v, k) => (both[k] ? v : null));
  const ra = ranksOf(pick(a)), rb = ranksOf(pick(b));
  const ia = indexOf(pick(a)), ib = indexOf(pick(b));
  return cols.map((name, k) => ({ name, k, a: a[k]!, b: b[k]!, rankA: ra[k]!, rankB: rb[k]!, indexA: ia[k]!, indexB: ib[k]! }));
}

/**
 * 順位が最も動いた項目（強調の初期値。計算で決め、結論は書かない）。
 * 同じ動きなら、左の指標の順位が上の項目。動いた項目が無ければ null
 */
export function maxRankShift(items: readonly RankSlopeItem[]): string | null {
  let best: RankSlopeItem | null = null, move = 0;
  for (const it of items) {
    if (it.rankA == null || it.rankB == null) continue;
    const d = Math.abs(it.rankA - it.rankB);
    if (d > move || (d === move && d > 0 && best && it.rankA < best.rankA!)) { move = d; best = it; }
  }
  return best?.name ?? null;
}

export const rankText = (locale: Locale, r: number): string => (locale === 'ja' ? `${r}位` : `#${r}`);

const needs = (ctx: ChartCtx, key: 'needTwoMetricsAt' | 'slopePairNeeds'): ReturnType<ChartLayout> => ({
  items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.5, lines: [{ t: slideText(ctx.locale, key), size: 10, color: SEC }], align: 'left', valign: 'top' }],
  anchors: {},
});

export const rankSlope: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  if (!m.rows.length) return needs(ctx, 'needTwoMetricsAt');
  if (!m.base || !m.base.values.some((r) => r.some((v) => v != null))) return needs(ctx, 'slopePairNeeds');
  const at = rankSlopeAt(m.rows, ctx.control<string>('compare_target'));
  const all = rankSlopeItems(m.cols, m.current.values, m.base.values, at);
  const drawn = all.filter((it) => it.rankA != null && it.rankB != null);
  const missing = all.filter((it) => !drawn.includes(it));
  if (!drawn.length) return needs(ctx, 'needTwoMetricsAt');
  const scale: RankSlopeScale = ctx.control<string>('rank_slope_scale') === 'index' && drawn.every((it) => it.indexA != null && it.indexB != null) ? 'index' : 'rank';
  const when = m.rows[at] ?? '';
  const fmt = slopeFormatter(env.numberFormat, ctx.control<string>('decimals'));
  const fmtIdx = (v: number) => Math.round(v).toString();

  // 強調：1項目（主役の強調色）、ほかは薄いグレー。無ければ項目ごとの色（色＝項目）
  const focus = env.highlight && drawn.some((it) => it.name === env.highlight) ? env.highlight : null;
  const colorOf = (it: RankSlopeItem) => (focus ? (it.name === focus ? env.accent ?? FOCUS.primary : FOCUS.otherLine) : ctx.palette.line(it.k));

  const rect: Rect = ctx.rect;
  const items: SceneItem[] = [];
  const size = drawn.length > 8 ? 9 : 10;
  const w = (ts: string[], sz = size) => (ts.length ? Math.max(...ts.map((t) => textWidth(t, sz))) : 0);
  const mainOf = (it: RankSlopeItem, side: 'a' | 'b') => (scale === 'rank' ? rankText(ctx.locale, side === 'a' ? it.rankA! : it.rankB!) : fmtIdx(side === 'a' ? it.indexA! : it.indexB!));
  const rawOf = (it: RankSlopeItem, side: 'a' | 'b') => fmt(side === 'a' ? it.a! : it.b!);

  // 見出し：指標の名前（単位があれば括弧で）と時点
  const nameA = m.current.label || slideText(ctx.locale, 'metricLeft');
  const nameB = m.base.label || slideText(ctx.locale, 'metricRight');
  const headOf = (n: string) => {
    const withUnit = ctx.unit && !unitInName(n) && n === nameA ? `${n}（${ctx.unit}）` : n;
    return when ? (ctx.locale === 'ja' ? `${withUnit}　${when}` : `${withUnit} ${when}`) : withUnit;
  };

  const footerLines = [
    missing.length ? slideText(ctx.locale, 'slopeNoData', { names: missing.map((it) => it.name).join(ctx.locale === 'ja' ? '、' : ', ') }) : null,
    slideText(ctx.locale, scale === 'rank' ? 'rankSlopeRankNote' : 'rankSlopeIndexNote'),
  ].filter((t): t is string => !!t);
  const footer = footerLines.length * 0.22;

  const nameW = Math.min(rect.w * 0.28, w(drawn.map((it) => it.name)) + 0.16);
  const rawLW = w(drawn.map((it) => rawOf(it, 'a')), size - 1) + 0.12;
  const mainLW = w(drawn.map((it) => mainOf(it, 'a'))) + 0.12;
  const rawRW = w(drawn.map((it) => rawOf(it, 'b')), size - 1) + 0.16;
  const mainRW = w(drawn.map((it) => mainOf(it, 'b'))) + 0.12;
  const xL = rect.x + nameW + rawLW + mainLW + 0.08;
  const xR = rect.x + rect.w - rawRW - mainRW - 0.08;
  const head = rect.y;
  const top = head + 0.6;
  const plot: Rect = { x: xL, y: top, w: Math.max(0.5, xR - xL), h: rect.y + rect.h - footer - top - 0.28 };

  // 左右の見出し（指標の名前と時点）。軸の上、それぞれ内側に寄せる
  // 左の見出しは左端から、右の見出しは右端までにそろえる（項目名・値の欄の上）
  const headW = rect.w / 2 - 0.1;
  items.push({ kind: 'text', x: rect.x, y: head, w: headW, h: 0.4, lines: [{ t: headOf(nameA), size: 11, bold: true, color: INK }], align: 'left', valign: 'middle' });
  items.push({ kind: 'text', x: rect.x + rect.w - headW, y: head, w: headW, h: 0.4, lines: [{ t: headOf(nameB), size: 11, bold: true, color: INK }], align: 'right', valign: 'middle' });
  for (const x of [xL, xR]) items.push({ kind: 'line', x1: x, y1: plot.y - 0.04, x2: x, y2: plot.y + plot.h, color: AXIS.grid, width: 1 });

  // 縦の位置：順位なら 1 位を上に等間隔、指数なら左右共通の目盛
  const n = Math.max(...drawn.flatMap((it) => [it.rankA!, it.rankB!]));
  const idx = valueScale(drawn.flatMap((it) => [it.indexA ?? 100, it.indexB ?? 100]));
  const yOf = (it: RankSlopeItem, side: 'a' | 'b'): number => {
    if (scale === 'rank') {
      const r = side === 'a' ? it.rankA! : it.rankB!;
      return n <= 1 ? plot.y + plot.h / 2 : plot.y + (plot.h * (r - 1)) / (n - 1);
    }
    return plot.y + plot.h * (1 - idx.ratio(side === 'a' ? it.indexA! : it.indexB!));
  };
  // 指数の時は 100（平均）の線を薄く
  if (scale === 'index') {
    const y100 = plot.y + plot.h * (1 - idx.ratio(100));
    if (y100 >= plot.y && y100 <= plot.y + plot.h) items.push({ kind: 'line', x1: xL, y1: y100, x2: xR, y2: y100, color: AXIS.grid, width: 0.75, dash: 'dash' });
  }

  // 強調した線は最後に描いて上に出す
  for (const it of [...drawn].sort((p, q) => Number(p.name === focus) - Number(q.name === focus))) {
    const em = it.name === focus, c = colorOf(it);
    const ya = yOf(it, 'a'), yb = yOf(it, 'b');
    items.push({ kind: 'line', x1: xL, y1: ya, x2: xR, y2: yb, color: c, width: em ? 3 : 2 });
    const r = em ? 0.06 : 0.05;
    items.push({ kind: 'ellipse', x: xL - r, y: ya - r, w: r * 2, h: r * 2, fill: c }, { kind: 'ellipse', x: xR - r, y: yb - r, w: r * 2, h: r * 2, fill: c });
  }

  const gap = (size / 72) * 1.35;
  const lo = plot.y - 0.02, hi = plot.y + plot.h;
  const ysL = spreadLabels(drawn.map((it) => yOf(it, 'a')), gap, lo, hi);
  const ysR = spreadLabels(drawn.map((it) => yOf(it, 'b')), gap, lo, hi);
  drawn.forEach((it, i) => {
    const dim = !!focus && it.name !== focus;
    const color = dim ? SEC : INK;
    const t = (x: number, yy: number, ww: number, s: string, align: 'left' | 'right', c = color, sz = size, bold = !dim): SceneItem =>
      ({ kind: 'text', x, y: yy - 0.11, w: ww, h: 0.22, lines: [{ t: s, size: sz, bold, color: c }], align, valign: 'middle' });
    items.push(t(rect.x, ysL[i]!, nameW - 0.06, it.name, 'left'));
    items.push(t(rect.x + nameW, ysL[i]!, rawLW, rawOf(it, 'a'), 'right', SEC, size - 1, false));
    items.push(t(rect.x + nameW + rawLW, ysL[i]!, mainLW, mainOf(it, 'a'), 'right'));
    items.push(t(xR + 0.08, ysR[i]!, mainRW, mainOf(it, 'b'), 'left'));
    items.push(t(xR + 0.08 + mainRW, ysR[i]!, rawRW, rawOf(it, 'b'), 'left', SEC, size - 1, false));
  });

  let fy = rect.y + rect.h - footer;
  for (const line of footerLines) {
    items.push({ kind: 'text', x: rect.x, y: fy, w: rect.w, h: 0.2, lines: [{ t: line, size: 8, color: SEC }], align: 'left', valign: 'middle' });
    fy += 0.22;
  }
  return { items, anchors: {} };
};
