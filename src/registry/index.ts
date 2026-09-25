import { ASPECTS } from './aspects';
import { CHART_TYPES } from './charts';
import { COMPLEMENTS } from './complements';
import { CONTROLS } from './controls';
import { CONTROL_IDS, COMPLEMENT_IDS, CHART_TYPE_IDS, type ChartTypeId, type ComplementId, type PurposeId } from './ids';
import { LAYOUTS, SLIDE_FRAME } from './layouts';
import { PURPOSES } from './purposes';
import { RECIPES, RECIPE_DB_VERSION } from './recipes';
import { DATA_SCHEMAS } from './schemas';
import { EXPORTS, TABLES, TRANSFORMS } from './transforms';
import type { ComplementPanelPlacement, ControlDef, ComplementDef, ChartTypeDef } from './types';

export * from './ids';
export * from './locale';
export type * from './types';
export { DatasetSchema, LongPivotSchema, LongSourceSchema, type Dataset, type LongPivot, type LongSource } from './dataset';
export { ViewSpecSchema, PanelSchema, TransformSchema, viewSpecJsonSchema, type ViewSpec, type Panel, type Transform } from './viewspec';
export { validateViewSpec, type ValidationIssue, type ValidationResult } from './validate';

/** 唯一の設計図。画面・描画・検証・保存・AI・出力はすべてここを参照する。 */
export const registry = {
  aspects: ASPECTS,
  dataSchemas: DATA_SCHEMAS,
  purposes: PURPOSES,
  charts: CHART_TYPES,
  controls: CONTROLS,
  complements: COMPLEMENTS,
  layouts: LAYOUTS,
  slideFrame: SLIDE_FRAME,
  transforms: TRANSFORMS,
  tables: TABLES,
  exports: EXPORTS,
  recipes: RECIPES,
} as const;

export function chartsForPurpose(purpose: PurposeId): ChartTypeDef[] {
  return CHART_TYPE_IDS.map((id) => CHART_TYPES[id]).filter((c) => c.purpose === purpose);
}

/** 選んだチャートに効く設定だけを返す（画面にはこれだけを表示する） */
export function controlsFor(chart: ChartTypeId): ControlDef[] {
  return CONTROL_IDS.map((id) => CONTROLS[id]).filter((c) => c.appliesTo.includes(chart));
}

/** そのチャートに足せる補完パーツ（推奨を先頭に） */
export function complementsFor(chart: ChartTypeId): { def: ComplementDef; recommended: boolean }[] {
  const rec = new Set<ComplementId>(CHART_TYPES[chart].complements);
  return COMPLEMENT_IDS.map((id) => COMPLEMENTS[id])
    .filter((c) => c.appliesTo.includes(chart))
    .map((def) => ({ def, recommended: rec.has(def.id) }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/** その補完パーツが、このチャートで比較期間のデータを必要とするか */
export function complementNeedsBase(complement: ComplementId, chart: ChartTypeId): boolean {
  const d = COMPLEMENTS[complement];
  return d.requiresBase === 'always' && !(d.baseFreeOn ?? []).includes(chart);
}

/** パネル型の補完パーツを足したときのレイアウトと置き場所 */
export function complementPlacement(complement: ComplementId, chart: ChartTypeId): ComplementPanelPlacement | null {
  const p = COMPLEMENTS[complement].panel;
  if (!p) return null;
  return p.byChart?.[chart] ?? p.default;
}

export { SCHEMA_COMPAT, chartAcceptsSchema } from './compat';
export { RECIPES, RECIPE_DB_VERSION };
export {
  activeRecipes, primaryChart, recipesForPurpose, recipesForChart, recipeAspects, recipeRemedies,
  recipeToViewSpec, rankRecipes, excludedBy, RECIPE_VARIANTS, canonRecipe, RECIPE_SCORING, standardComplements, lostWhenRemoved, lostWhenTableRemoved, recipeParts, type Remedy, type RankedRecipe,
} from './recipe-rules';
export {
  GOAL_CODES, GOAL_TO_PURPOSE, REASON_CODES, ConsultationClassificationSchema, ConsultationResultSchema,
  RecommendationStateSchema, consultationJsonSchema,
  ADVISOR_ACTIONS, MISSING_INFO, TIME_MODES, COMPARISON_INTENTS, COMPOSITION_INTENTS, ADDITIVITY, SERIES_COUNTS,
  type AdvisorAction, type MissingInfo, type TimeMode, type ComparisonIntent, type CompositionIntent, type Additivity, type SeriesCount,
  type GoalCode, type ReasonCode, type ConsultationClassification, type ConsultationResult, type RecommendationState,
} from './consultation';
