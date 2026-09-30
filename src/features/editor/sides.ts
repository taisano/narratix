import { recipesForChart, registry, type ChartTypeId, type RecipeId } from '@/registry';
import { dataConditions } from './dishConditions';
import { nonAdditiveUnit } from '@/engine/format';
import { growthSpan } from '@/engine/transform/cagr';
import { OTHER_CHARTS, pairSample, recipeOf, sideRatioOf, viewAxes, type BuilderState } from './state';
import { isSampleData } from './fromRecipe';

/**
 * 付け合わせ（主役のチャートの右 1/3 に並べる、同じデータから計算した補足。docs/dish-matrix.md 7章）。
 * 編集画面の「補完パーツ」で、付ける・外す・替えるを選べる。チャートを替えても、使えるものは引き継ぐ。
 * 中身（proof_needs）ごとに1つ：増加額（CONTRIBUTION）＝差分バー、伸び率（GROWTH_SPEED）＝CAGR の表
 */
export const SIDES = ['none', 'delta', 'cagr', 'metric2'] as const;
export type Side = (typeof SIDES)[number];

/** 主役のチャート × 付け合わせ → 左右構成のレシピ（2/3：1/3） */
const COMPOSE: Partial<Record<ChartTypeId, Partial<Record<Exclude<Side, 'none'>, RecipeId>>>> = {
  line: { delta: 'TREND_LINE_DELTA', cagr: 'TREND_CAGR_TABLE' },
  stacked_column: { delta: 'TREND_STACKED_DELTA', cagr: 'TREND_STACKED_CAGR' },
  stacked_100: { delta: 'TREND_SHARE_DELTA', cagr: 'TREND_SHARE_CAGR' },
  // 比較：順位の横棒＋前回からの増減（行をそろえる。B1）
  // B1・B2・B4：順位の横棒の右に、同じ行で（前回からの増減／伸び率／2つ目の指標）
  bar_rank: { delta: 'COMP_RANK_DELTA', cagr: 'COMP_RANK_CAGR', metric2: 'COMP_RANK_METRIC2' },
};

/** そのチャートで選べる付け合わせ（'none' を含む）。無ければ空 */
export function sidesFor(chart: ChartTypeId): Side[] {
  const c = COMPOSE[chart];
  return c ? ['none', ...(Object.keys(c) as Exclude<Side, 'none'>[])] : [];
}

/** 同じ付け合わせとして扱うレシピ（「最初と最後の2本＋CAGR」は T7 の期間の設定違い。docs/composition-review.md） */
const ALIAS: Partial<Record<RecipeId, Exclude<Side, 'none'>>> = { SIZE_MIX_CAGR: 'cagr' };

/** 今の付け合わせ */
export function sideOf(s: BuilderState): Side {
  const r = recipeOf(s);
  const c = COMPOSE[s.chart];
  if (!r || !c) return 'none';
  return (Object.entries(c).find(([, id]) => id === r.id)?.[0] as Side | undefined) ?? ALIAS[r.id] ?? 'none';
}

/** 右 1/3 で読める量（決定：差分バー・横棒は6項目、表は8行） */
export const SIDE_MAX: Record<Exclude<Side, 'none'>, number> = { delta: 6, cagr: 8, metric2: 6 };

/** 付け合わせの項目が多すぎる時：いくつ出ているか・上限。多すぎなければ null */
export function sideOverflow(s: BuilderState, side: Side): { count: number; max: number } | null {
  if (side === 'none') return null;
  const n = viewAxes(s).cols.length;
  const top = typeof s.controls.top_n === 'string' && /^\d+$/.test(s.controls.top_n) ? Number(s.controls.top_n) : Infinity;
  // 「その他」にまとめると1項目増える（加算できる指標の、合計に意味のあるチャートだけ）
  const other = OTHER_CHARTS.includes(s.chart) && !nonAdditiveUnit(s.dataset.unit);
  const count = top >= n ? n : top + (other ? 1 : 0);
  // 形で上限が変わる：表は8行、棒（差分バー・伸び率の横棒・ウォーターフォールの項目）は6項目
  // 形と幅で上限が変わる：1/3 幅なら表は8行・棒は6項目、1/2 幅なら表は10行・棒は8項目
  const form = formOf(s, side);
  const half = (sideRatioOf(s, registry.recipes[COMPOSE[s.chart]?.[side] ?? 'TREND_LINE']?.view.layout.ratios?.[0]) ?? 0.67) <= 0.5;
  const max = form === 'table' ? (half ? 10 : 8) : (half ? 8 : 6);
  return count > max ? { count, max } : null;
}

/** 付け合わせを付ける・外す・替える（データ・設定・補完パーツはそのまま。レイアウトだけ変わる） */
export function withSide(s: BuilderState, side: Side): BuilderState {
  // 外す時は、そのチャート1つだけのレシピに戻す（Coach の任意補完の案内が残るように）
  if (side === 'none') return sideOf(s) === 'none' ? s : { ...s, recipe: recipesForChart(s.chart).find((r) => r.composition === 'SINGLE_CHART')?.id ?? null, hiddenParts: [] };
  const id = COMPOSE[s.chart]?.[side];
  if (!id) return s;
  // 2つ目の指標：見本のままなら、2つの指標の見本（左＝売上、右＝営業利益）に替える。自分のデータなら、右の表に入れてもらう
  if (side === 'metric2' && isSampleData(s)) s = { ...s, ...pairSample(s.slideLocale) };
  // レシピの主役の既定の設定（例：CAGR の表は CAGR だけ）のうち、利用者がまだ選んでいないものだけ入れる
  const defaults = registry.recipes[id].view.panels.find((p) => p.id === 'main')?.controls ?? {};
  const controls = { ...Object.fromEntries(Object.entries(defaults).filter(([k]) => k !== 'period_display')), ...s.controls };
  return { ...s, recipe: id, hiddenParts: [], controls };
}

/** チャートを替えた時：前の付け合わせが新しいチャートでも使えれば引き継ぐ */
export function carrySide(prev: BuilderState, next: BuilderState): BuilderState {
  const side = sideOf(prev);
  if (side === 'none' || next.chart === prev.chart) return next;
  return COMPOSE[next.chart]?.[side] ? withSide({ ...next, recipe: null }, side) : next;
}

/** 付け合わせが今のデータで使えない理由（無ければ null）。例：比率だけのデータでは増加額を出せない */
export function sideBlock(s: BuilderState, side: Side): 'no_absolute' | 'no_cagr' | 'one_series' | 'one_period' | null {
  if (side === 'none') return null;
  // 2つ目の指標は時点が1つでもよい（右の表に入れてもらう）
  if (side === 'metric2') return viewAxes(s).cols.length >= 2 ? null : 'one_series';
  const { conditions: c } = dataConditions(s);
  if (c.PERIODS_2 === 'no' && c.PERIODS_3PLUS === 'no') return 'one_period';
  if (c.MULTI_SERIES === 'no') return 'one_series';
  if (s.chart === 'stacked_100' && c.ABSOLUTE_BASE_AVAILABLE === 'no') return 'no_absolute';
  // 順位の横棒の伸び率は、年でなくても期間の伸び率を出せる（時点が並んでいれば）。率の指標は伸び率に意味がない
  if (side === 'cagr' && s.chart === 'bar_rank') return growthSpan(viewAxes(s).rows) && !nonAdditiveUnit(s.dataset.unit) ? null : 'no_cagr';
  if (side === 'cagr' && c.CAGR_CALCULABLE === 'no') return 'no_cagr';
  return null;
}

/** 2つの指標を使う（2つの表が「左の指標」「右の指標」）：2指標スロープ、行をそろえた2指標比較 */
export const usesTwoMetrics = (s: BuilderState): boolean => s.chart === 'slope_pair' || recipeOf(s)?.id === 'COMP_RANK_METRIC2';

// ──────────── 付け合わせの形（docs/dish-matrix.md 6.6） ────────────

export type SideForm = 'bars' | 'table' | 'waterfall';

/** その付け合わせで選べる形（先頭が既定）。行をそろえる付け合わせ（順位の横棒の右）は形を選べない */
export function formsFor(s: BuilderState, side: Side): SideForm[] {
  if (s.chart === 'bar_rank' || side === 'none' || side === 'metric2') return [];
  return side === 'delta' ? ['bars', 'table', 'waterfall'] : ['table', 'bars'];
}

/** 今の形 */
export function formOf(s: BuilderState, side: Side): SideForm | null {
  const forms = formsFor(s, side);
  if (!forms.length) return null;
  const f = s.controls.side_form as SideForm | undefined;
  return f && forms.includes(f) ? f : forms[0]!;
}

/**
 * その形が今のデータで使えない理由。ウォーターフォールは「各増減が全体の変化に足し上がる」時だけ：
 * 項目が全体を構成する（PARTS_FORM_WHOLE）。合計の列がある時は、項目の和と一致する（RECONCILES_TO_TOTAL）
 */
export function formBlock(s: BuilderState, form: SideForm): 'not_parts' | 'not_reconciled' | null {
  if (form !== 'waterfall') return null;
  const { conditions: c, detail } = dataConditions(s);
  if (c.PARTS_FORM_WHOLE === 'no' || nonAdditiveUnit(s.dataset.unit)) return 'not_parts';
  if (detail.totalCol && c.RECONCILES_TO_TOTAL === 'no') return 'not_reconciled';
  return null;
}
