import { CHART_TYPES } from './charts';
import { PURPOSES } from './purposes';
import { COMPLEMENTS } from './complements';
import { GOAL_TO_PURPOSE, type ConsultationClassification, type ReasonCode } from './consultation';
import { COMPLEMENT_IDS, RECIPE_IDS, type AspectId, type ChartTypeId, type ComplementId, type PurposeId, type RecipeId } from './ids';
import type { Locale } from './locale';
import { RECIPES, RECIPE_DB_VERSION } from './recipes';
import { TABLES } from './transforms';
import type { RecipeDef } from './types';
import type { ViewSpec } from './viewspec';

const byPriority = (a: RecipeDef, b: RecipeDef) => b.priority - a.priority || RECIPE_IDS.indexOf(a.id) - RECIPE_IDS.indexOf(b.id);

/** 使えるレシピ（status が ACTIVE のもの）。入力順は RECIPE_IDS */
export function activeRecipes(): RecipeDef[] {
  return RECIPE_IDS.map((id) => RECIPES[id]).filter((r) => r.status === 'ACTIVE');
}

/** メインのチャート（id が main のパネル） */
export function primaryChart(r: RecipeDef): ChartTypeId {
  const main = r.view.panels.find((p) => p.id === 'main');
  if (!main?.chart) throw new Error(`${r.id} has no main chart panel`);
  return main.chart;
}

/** 目的から入った時：その目的に合うレシピ。主な目的が一致するものを先に、次に優先度順 */
export function recipesForPurpose(purpose: PurposeId): RecipeDef[] {
  return activeRecipes()
    .filter((r) => r.goals.includes(purpose))
    .sort((a, b) => Number(b.goals[0] === purpose) - Number(a.goals[0] === purpose) || byPriority(a, b));
}

/** チャートから入った時：そのチャートがメインのレシピ。チャート1つだけのものを先に */
export function recipesForChart(chart: ChartTypeId): RecipeDef[] {
  return activeRecipes()
    .filter((r) => primaryChart(r) === chart)
    .sort((a, b) => Number(b.composition === 'SINGLE_CHART') - Number(a.composition === 'SINGLE_CHART') || byPriority(a, b));
}

/**
 * そのレシピで見せられること・見えにくいこと。チャート・補完パーツ・表の定義から組み立てる
 * （説明がレジストリとずれないように、手で書かない）。
 */
export function recipeAspects(r: RecipeDef): { shows: AspectId[]; cannotShow: AspectId[] } {
  const shows = new Set<AspectId>();
  const cannot = new Set<AspectId>(r.extraCannotShow ?? []);
  for (const p of r.view.panels) {
    if (p.chart) {
      CHART_TYPES[p.chart].shows.forEach((a) => shows.add(a));
      if (p.id === 'main') CHART_TYPES[p.chart].cannotShow.forEach((a) => cannot.add(a));
    }
    p.inChartComplements?.forEach((c) => COMPLEMENTS[c.id].covers.forEach((a) => shows.add(a)));
    if (p.table) TABLES[p.table].covers.forEach((a) => shows.add(a));
  }
  return { shows: [...shows], cannotShow: [...cannot].filter((a) => !shows.has(a)) };
}

/** レシピに入っている補完パーツ（チャート内のもの） */
function complementsIn(r: RecipeDef): Set<ComplementId> {
  return new Set(r.view.panels.flatMap((p) => p.inChartComplements?.map((c) => c.id) ?? []));
}

export interface Remedy {
  aspect: AspectId;
  /** このレシピのメインのチャートに足せば見せられる補完パーツ */
  complement?: ComplementId;
  /** 補完パーツで補えない時、見せられる別のレシピ */
  recipe?: RecipeId;
}

/**
 * 見えにくいことへの案内。先に「補完パーツを足す」、無ければ「別のレシピ」を探す。
 * isAvailable で、描けるもの（実装済み）だけに絞れる。
 */
export function recipeRemedies(
  r: RecipeDef,
  isAvailable: { complement?: (id: ComplementId, chart: ChartTypeId) => boolean; recipe?: (id: RecipeId) => boolean } = {},
): Remedy[] {
  const chart = primaryChart(r);
  const have = complementsIn(r);
  const okComp = isAvailable.complement ?? (() => true);
  const okRecipe = isAvailable.recipe ?? (() => true);
  return recipeAspects(r).cannotShow.map((aspect): Remedy => {
    const comp = COMPLEMENT_IDS.find((id) => {
      const c = COMPLEMENTS[id];
      return c.placement === 'in_chart' && c.covers.includes(aspect) && c.appliesTo.includes(chart) && !have.has(id) && okComp(id, chart);
    });
    if (comp) return { aspect, complement: comp };
    const alt = activeRecipes()
      .filter((x) => x.id !== r.id && okRecipe(x.id) && recipeAspects(x).shows.includes(aspect))
      .sort((a, b) => {
        const shared = (x: RecipeDef) => Number(x.goals.some((g) => r.goals.includes(g)));
        return shared(b) - shared(a) || byPriority(a, b);
      })[0];
    return alt ? { aspect, recipe: alt.id } : { aspect };
  });
}

/** レシピ → ViewSpec（スライド1枚）。検証は validateViewSpec で行う */
export function recipeToViewSpec(
  r: RecipeDef,
  opts: { datasetId: string; slideLocale: Locale; title: string; subtitle?: string; source?: string },
): ViewSpec {
  return {
    datasetId: opts.datasetId,
    recipe: { id: r.id, version: RECIPE_DB_VERSION },
    layout: structuredClone(r.view.layout),
    panels: structuredClone(r.view.panels),
    slide: { title: opts.title, ...(opts.subtitle ? { subtitle: opts.subtitle } : {}), ...(opts.source ? { source: opts.source } : {}) },
    slideLocale: opts.slideLocale,
  };
}

// ──────────── 相談から入った時の並べ方（10章）。AI の自由判断にせず、この規則で再現できるようにする ────────────

/** 点数の規則（変えたら RECIPE_DB_VERSION を上げる） */
export const RECIPE_SCORING = {
  mainGoal: 40,
  subGoal: 25,
  otherGoal: -40,
  schemaFit: 20,
  schemaMissing: -20,
  audience: 10,
  rate: 15,
  /** 成長率が必要なのに見えない切り口 */
  rateMissing: -10,
  size: 10,
  exact: 10,
  heavyLoad: -10,
  /** すでに選んだ案と主な目的が同じなら減点（違う切り口を並べる） */
  repeatGoal: -15,
  /** 分類の比較・構成の意味と合う（合わない）切り口 */
  intentMatch: 30,
  intentMismatch: -15,
  /** これ未満は出さない（無理に3案目を作らない） */
  minScore: 40,
  max: 3,
} as const;

export interface RankedRecipe {
  recipe: RecipeDef;
  score: number;
  reasons: ReasonCode[];
}

/**
 * 表示のしかた（向き）だけが違う切り口。答える問いは同じなので、並べる時は1つまで。
 * 縦か横かはアプリの規則で決める（段階2）。採点でも同じ案とみなす。
 */
export const RECIPE_VARIANTS: RecipeId[][] = [
  ['TREND_COLUMN', 'TREND_BAR'],
  ['COMP_RANK', 'COMP_COLUMN'],
];
export const canonRecipe = (id: RecipeId): RecipeId => RECIPE_VARIANTS.find((g) => g.includes(id))?.[0] ?? id;

const KNOWN_COMPARISON = ['LEVEL', 'DELTA', 'RANK_CHANGE', 'AVERAGE_GAP'] as const;
const KNOWN_COMPOSITION = ['SHARE', 'SIZE_AND_SHARE', 'BREAKDOWN'] as const;

/**
 * 分類と合わない切り口は出さない（ハード除外）。分類が「不明」の項目では除外しない。
 * 時間の扱いが合わない／足せない指標で積み上げ・構成／系列が1つで複数系列の図／規模と構成比と言われていないのに Mekko／差と言われていないのに差の図
 */
export function excludedBy(r: RecipeDef, c: ConsultationClassification): boolean {
  const f = r.fit;
  if (c.time_mode !== 'UNKNOWN' && !f.time.includes(c.time_mode)) return true;
  if (c.measure_additivity === 'NON_ADDITIVE' && f.additiveOnly) return true;
  if (c.series_count === 'SINGLE' && f.multiSeries) return true;
  if (f.requireComposition && !(f.requireComposition as string[]).includes(c.composition_intent)) return true;
  if (f.requireComparison && !(f.requireComparison as string[]).includes(c.comparison_intent)) return true;
  return false;
}

function scoreOne(r: RecipeDef, c: ConsultationClassification): RankedRecipe {
  const S = RECIPE_SCORING;
  const goal = GOAL_TO_PURPOSE[c.primary_goal];
  const reasons: ReasonCode[] = [];
  let score = 0;
  if (r.goals[0] === goal) { score += S.mainGoal; reasons.push('GOAL_MATCH'); }
  else if (r.goals.includes(goal)) { score += S.subGoal; reasons.push('SUB_GOAL_MATCH'); }
  else score += S.otherGoal;

  // 必要なデータが相談上ありそうか（時系列が要るレシピは、期間が書かれていること）
  const hasTime = c.time_scope != null && c.time_scope !== '';
  if (r.requirements.timeAxis) {
    // 期間が書かれているか、「推移」など複数時点と分かれば加点
    if (hasTime || c.time_mode === 'MULTI_PERIOD') { score += S.schemaFit; reasons.push('TIME_SERIES'); } else score += S.schemaMissing;
  } else if (r.schema === 'MATRIX_TIME_SERIES' || r.schema === PURPOSES[goal].schema) {
    // 目的に合う形のデータ（要因＝始点・要因・終点、関係＝X・Y）
    score += S.schemaFit;
  }

  if (c.audience !== 'UNKNOWN' && r.audience.includes(c.audience)) {
    score += S.audience;
    reasons.push(c.audience === 'EXECUTIVE_MEETING' ? 'EXECUTIVE_USE' : 'AUDIENCE_MATCH');
  }
  const { shows } = recipeAspects(r);
  if (c.needs_rate_context === true) {
    // 関係・要因では「成長率」は指標の名前であることが多いので、見えない切り口を減点しない
    if (shows.includes('growth')) { score += S.rate; reasons.push('RATE_REQUIRED'); } else if (goal !== 'relationship' && goal !== 'contribution') score += S.rateMissing;
  }
  if (c.needs_size_context === true && (shows.includes('size') || shows.includes('level'))) { score += S.size; reasons.push('SIZE_REQUIRED'); }
  if (c.needs_exact_values === true && r.exactValues) { score += S.exact; reasons.push('EXACT_VALUES'); }
  if (r.readingLoad === 'high') score += S.heavyLoad;
  // 比較・構成の意味（差・入れ替わり・平均との差、構成比・規模と構成比・内訳）
  const ci = c.comparison_intent;
  if ((KNOWN_COMPARISON as readonly string[]).includes(ci)) {
    if ((r.fit.comparison as string[] | undefined)?.includes(ci)) score += S.intentMatch;
    else if (r.fit.comparison) score += S.intentMismatch;
  }
  const co = c.composition_intent;
  if ((KNOWN_COMPOSITION as readonly string[]).includes(co)) {
    if ((r.fit.composition as string[] | undefined)?.includes(co)) score += S.intentMatch;
    else if (r.fit.composition) score += S.intentMismatch;
  }
  if (shows.includes('mix_change') || (shows.includes('mix') && r.derived.includes('share'))) reasons.push('MIX_CHANGE');
  if (primaryChart(r) === 'clustered_column' || primaryChart(r) === 'slope') reasons.push('START_END_COMPARISON');
  return { recipe: r, score, reasons };
}

/**
 * 分類結果から最大3案を選ぶ。点数の高い順に、違う切り口になるよう
 * （同じメインのチャートは1つまで、主な目的が重なると減点）貪欲に選ぶ。
 * candidates で候補を絞れる（描けるものだけ、AI が挙げたものだけ など）。
 */
export function rankRecipes(c: ConsultationClassification, candidates: RecipeDef[] = activeRecipes()): RankedRecipe[] {
  const S = RECIPE_SCORING;
  if (c.expected_action !== 'RECOMMEND') return [];
  const pool = candidates.filter((r) => !excludedBy(r, c)).map((r) => scoreOne(r, c));
  const picked: RankedRecipe[] = [];
  while (picked.length < S.max) {
    // 同じメインのチャート、向きだけ違う切り口は1つまで
    const usedCharts = new Set(picked.flatMap((p) => (RECIPE_VARIANTS.find((g) => g.includes(p.recipe.id)) ?? [p.recipe.id]).map((id) => primaryChart(RECIPES[id]))));
    const usedGoals = new Set(picked.map((p) => p.recipe.goals[0]));
    const next = pool
      .filter((p) => !picked.includes(p) && !usedCharts.has(primaryChart(p.recipe)))
      .map((p) => ({ p, adj: p.score + (usedGoals.has(p.recipe.goals[0]) ? S.repeatGoal : 0) }))
      .sort((a, b) => b.adj - a.adj || byPriority(a.p.recipe, b.p.recipe))[0];
    if (!next || next.adj < S.minScore) break;
    picked.push({ ...next.p, score: next.adj });
  }
  return picked;
}

// ──────────── 標準構成と任意補完（docs/consultation-flow.md 20・23・24章） ────────────

/**
 * レシピの標準構成のうち、エディターでオン・オフできる部品（チャートの中の補完パーツと、Mekko の揃えた表・全体の構成）。
 * 標準構成はレシピを選んだ時点でオン。外すと、そのレシピの問いには答えにくくなる。
 */
export function standardComplements(r: RecipeDef): ComplementId[] {
  const ids = new Set<ComplementId>(complementsIn(r));
  if (r.view.panels.some((p) => p.table === 'growth_table')) ids.add('aligned_table');
  return [...ids];
}

/** 標準構成の部品を外した時に見えにくくなること（その部品が補っていたこと） */
export function lostWhenRemoved(r: RecipeDef, complement: ComplementId): AspectId[] {
  const others = new Set(standardComplements(r).filter((c) => c !== complement));
  const keep = new Set<AspectId>();
  for (const p of r.view.panels) {
    if (p.chart) CHART_TYPES[p.chart].shows.forEach((a) => keep.add(a));
    if (p.table && p.table !== 'growth_table') TABLES[p.table].covers.forEach((a) => keep.add(a));
  }
  others.forEach((c) => COMPLEMENTS[c].covers.forEach((a) => keep.add(a)));
  return COMPLEMENTS[complement].covers.filter((a) => !keep.has(a));
}

/** 標準構成の表（パネル）を外した時に見えにくくなること */
export function lostWhenTableRemoved(r: RecipeDef, panelId: string): AspectId[] {
  const gone = r.view.panels.find((p) => p.id === panelId);
  if (!gone?.table) return [];
  const keep = new Set<AspectId>();
  for (const p of r.view.panels) {
    if (p.id === panelId) continue;
    if (p.chart) CHART_TYPES[p.chart].shows.forEach((a) => keep.add(a));
    if (p.table && p.table !== 'growth_table') TABLES[p.table].covers.forEach((a) => keep.add(a));
  }
  standardComplements(r).forEach((c) => COMPLEMENTS[c].covers.forEach((a) => keep.add(a)));
  return TABLES[gone.table].covers.filter((a) => !keep.has(a));
}

/** レシピの構成を短く（例：「折れ線＋CAGR表」「折れ線＋参照線」）。label は言語に合わせた名前を返す関数 */
export function recipeParts(r: RecipeDef, label: (x: { en: string; ja?: string }) => string): string {
  const parts: string[] = [];
  for (const p of r.view.panels) {
    if (p.chart) parts.push(label(CHART_TYPES[p.chart].label));
    if (p.table) parts.push(label(TABLES[p.table].label));
    p.inChartComplements?.forEach((c) => parts.push(label(COMPLEMENTS[c.id].label)));
  }
  return [...new Set(parts)].join('＋');
}
