import { z } from 'zod';
import type { GoalCode } from './consultation';

/**
 * AI相談の第2世代の語彙。
 *
 * 既存の primary_goal を保存互換のため残し、その下に混在していた
 * 「意思決定」「問い」「分析上の関係」「データの形」「表現」を分離する。
 * AIはこの形への分類だけを行い、表現の選択は presentation-rules.ts が決める。
 */

export const DECISION_JOB_IDS = [
  'MONITOR', 'IDENTIFY_PROBLEM', 'DIAGNOSE', 'EVALUATE_OPTIONS',
  'FORECAST_SCENARIO', 'RECOMMEND_DECIDE', 'PLAN_EXECUTE', 'ALIGN_EXPLAIN',
] as const;
export type DecisionJob = (typeof DECISION_JOB_IDS)[number];

export const BUSINESS_QUESTION_IDS = [
  'WHAT_HAPPENED', 'WHERE_HAPPENED', 'HOW_IMPORTANT', 'WHY_HAPPENED',
  'WHAT_NEXT', 'WHAT_TO_CHOOSE', 'WHAT_RISKS', 'WHAT_TO_EXECUTE',
] as const;
export type BusinessQuestionType = (typeof BUSINESS_QUESTION_IDS)[number];

export const ANALYTICAL_RELATIONSHIP_IDS = [
  'MAGNITUDE', 'RANKING', 'DEVIATION', 'TWO_POINT_CHANGE', 'CHANGE_OVER_TIME',
  'PART_TO_WHOLE', 'MIX_CHANGE', 'DISTRIBUTION', 'RELATIONSHIP', 'CONTRIBUTION',
  'FLOW', 'SPATIAL', 'SCENARIO', 'UNCERTAINTY', 'CROSS_TAB',
] as const;
export type AnalyticalRelationship = (typeof ANALYTICAL_RELATIONSHIP_IDS)[number];

export const DIMENSION_ROLE_IDS = ['TIME', 'CATEGORY', 'GEOGRAPHY', 'SCENARIO', 'OPTION', 'OTHER', 'UNKNOWN'] as const;
export type DimensionRole = (typeof DIMENSION_ROLE_IDS)[number];

export const MEASURE_SEMANTIC_IDS = ['VALUE', 'COUNT', 'SHARE', 'RATE', 'MARGIN', 'SCORE', 'DURATION', 'UNKNOWN'] as const;
export type MeasureSemantic = (typeof MEASURE_SEMANTIC_IDS)[number];

export const MEASURE_ADDITIVITY_IDS = ['ADDITIVE', 'SEMI_ADDITIVE', 'NON_ADDITIVE', 'UNKNOWN'] as const;
export type MeasureAdditivity = (typeof MEASURE_ADDITIVITY_IDS)[number];

export const DATA_STAGE_IDS = ['ACTUAL', 'FORECAST', 'SCENARIO', 'MIXED', 'UNKNOWN'] as const;
export type DataStage = (typeof DATA_STAGE_IDS)[number];

export const VALUE_SEMANTIC_IDS = ['LEVEL', 'DELTA', 'RATE', 'RANK', 'UNCERTAINTY'] as const;
export type ValueSemantic = (typeof VALUE_SEMANTIC_IDS)[number];

export const MISSINGNESS_IDS = ['NONE', 'PARTIAL', 'HIGH', 'UNKNOWN'] as const;
export type Missingness = (typeof MISSINGNESS_IDS)[number];

const Need = z.union([z.boolean(), z.literal('unknown')]).default('unknown');

export const DimensionProfileSchema = z.object({
  name: z.string(),
  role: z.enum(DIMENSION_ROLE_IDS).default('UNKNOWN'),
  /** 相談文から分からない時は null。入力後は実データから再計算する。 */
  cardinality: z.number().int().nonnegative().nullable().default(null),
  /** 上位→下位。階層が無ければ空配列。 */
  hierarchy: z.array(z.string()).default([]),
});
export type DimensionProfile = z.infer<typeof DimensionProfileSchema>;

export const MeasureProfileSchema = z.object({
  name: z.string(),
  semantic: z.enum(MEASURE_SEMANTIC_IDS).default('UNKNOWN'),
  unit: z.string().nullable().default(null),
  additivity: z.enum(MEASURE_ADDITIVITY_IDS).default('UNKNOWN'),
});
export type MeasureProfile = z.infer<typeof MeasureProfileSchema>;

export const CriticalThinkingSchema = z.object({
  /** 観測事実・推論・提案を混ぜないための分類。 */
  conclusion_kind: z.enum(['OBSERVED', 'INFERRED', 'PROPOSED', 'UNKNOWN']).default('UNKNOWN'),
  causal_claim: Need,
  assumptions: z.array(z.string()).default([]),
  counterevidence: z.array(z.string()).default([]),
  alternative_interpretations: z.array(z.string()).default([]),
  decision_implications: z.array(z.string()).default([]),
});
export type CriticalThinking = z.infer<typeof CriticalThinkingSchema>;

export const ConsultationAnalysisV2Schema = z.object({
  decision_job: z.enum(DECISION_JOB_IDS).nullable().default(null),
  business_questions: z.array(z.enum(BUSINESS_QUESTION_IDS)).default([]),
  analytical_relationships: z.array(z.enum(ANALYTICAL_RELATIONSHIP_IDS)).default([]),
  dimensions: z.array(DimensionProfileSchema).default([]),
  measures: z.array(MeasureProfileSchema).default([]),
  period_count: z.number().int().nonnegative().nullable().default(null),
  data_stage: z.enum(DATA_STAGE_IDS).default('UNKNOWN'),
  /** シェアの分母（例：各カテゴリー内、全市場）。不明なら null のままにする。 */
  share_basis: z.string().nullable().default(null),
  exact_values: Need,
  value_semantics: z.array(z.enum(VALUE_SEMANTIC_IDS)).default([]),
  cell_count: z.number().int().nonnegative().nullable().default(null),
  missingness: z.enum(MISSINGNESS_IDS).default('UNKNOWN'),
  data_grain: z.string().nullable().default(null),
  /** 特定の1項目だけの推移か。折れ線を許可する条件に使う。 */
  focused_item_count: z.number().int().positive().nullable().default(null),
  critical_thinking: CriticalThinkingSchema.default({
    conclusion_kind: 'UNKNOWN', causal_claim: 'unknown', assumptions: [], counterevidence: [], alternative_interpretations: [], decision_implications: [],
  }),
});
export type ConsultationAnalysisV2 = z.infer<typeof ConsultationAnalysisV2Schema>;

/** 現行primary_goalを、新しい分析関係へ読み替える既定値。EVALUATIONは意思決定タスクなので関係へ押し込まない。 */
export const LEGACY_GOAL_RELATIONSHIPS: Record<GoalCode, AnalyticalRelationship[]> = {
  TREND: ['CHANGE_OVER_TIME'],
  COMPARISON: ['MAGNITUDE'],
  COMPOSITION: ['PART_TO_WHOLE'],
  CONTRIBUTION: ['CONTRIBUTION'],
  RELATIONSHIP: ['RELATIONSHIP'],
  EVALUATION: [],
};

/** 保存済みの分類を新Ruleへ渡すための、情報を発明しない互換変換。 */
export function analysisFromLegacy(c: {
  primary_goal: GoalCode;
  comparison_dimension?: string | null;
  measure?: string | null;
  time_mode?: 'NONE' | 'MULTI_PERIOD' | 'TWO_POINT' | 'UNKNOWN';
  comparison_intent?: 'LEVEL' | 'DELTA' | 'RANK_CHANGE' | 'AVERAGE_GAP' | 'NONE' | 'UNKNOWN';
  composition_intent?: 'SHARE' | 'SIZE_AND_SHARE' | 'BREAKDOWN' | 'NONE' | 'UNKNOWN';
  measure_additivity?: 'ADDITIVE' | 'NON_ADDITIVE' | 'UNKNOWN';
  needs_exact_values?: boolean | 'unknown';
}): ConsultationAnalysisV2 {
  const rel = [...LEGACY_GOAL_RELATIONSHIPS[c.primary_goal]];
  if (c.time_mode === 'TWO_POINT') rel.splice(0, rel.length, 'TWO_POINT_CHANGE');
  if (c.comparison_intent === 'DELTA' || c.comparison_intent === 'AVERAGE_GAP') rel.splice(0, rel.length, 'DEVIATION');
  if (c.comparison_intent === 'LEVEL' || c.comparison_intent === 'RANK_CHANGE') rel.splice(0, rel.length, 'RANKING');
  if (c.composition_intent === 'SHARE') rel.splice(0, rel.length, c.time_mode === 'TWO_POINT' ? 'MIX_CHANGE' : 'PART_TO_WHOLE');
  return ConsultationAnalysisV2Schema.parse({
    decision_job: c.primary_goal === 'EVALUATION' ? 'EVALUATE_OPTIONS' : null,
    analytical_relationships: rel,
    dimensions: c.comparison_dimension ? [{ name: c.comparison_dimension, role: 'CATEGORY' }] : [],
    measures: c.measure ? [{
      name: c.measure,
      semantic: c.composition_intent === 'SHARE' ? 'SHARE' : 'UNKNOWN',
      additivity: c.measure_additivity ?? 'UNKNOWN',
    }] : [],
    period_count: c.time_mode === 'TWO_POINT' ? 2 : null,
    exact_values: c.needs_exact_values ?? 'unknown',
    value_semantics: c.time_mode === 'TWO_POINT' ? ['LEVEL', 'DELTA'] : [],
  });
}

/** 新分類から現行の画面・Recipeへ戻す互換マッピング。判断材料が無ければ既存値を保つ。 */
export function legacyGoalFromAnalysis(a: ConsultationAnalysisV2, fallback: GoalCode): GoalCode {
  const r = new Set(a.analytical_relationships);
  if (r.has('CONTRIBUTION') || r.has('FLOW')) return 'CONTRIBUTION';
  if (r.has('RELATIONSHIP')) return 'RELATIONSHIP';
  if (r.has('PART_TO_WHOLE') || r.has('MIX_CHANGE')) return 'COMPOSITION';
  if (r.has('CHANGE_OVER_TIME')) return 'TREND';
  if (r.has('MAGNITUDE') || r.has('RANKING') || r.has('DEVIATION') || r.has('TWO_POINT_CHANGE') || r.has('CROSS_TAB')) return 'COMPARISON';
  if (a.decision_job === 'EVALUATE_OPTIONS') return 'EVALUATION';
  return fallback;
}

export interface ObservedTopologyInput {
  rowDimension: { name: string; role: DimensionRole; values: string[]; hierarchy?: string[] };
  columnDimension: { name: string; role: DimensionRole; values: string[]; hierarchy?: string[] };
  /** current/base、または複数の実績・予測期間。 */
  periods: string[];
  values: (number | null)[][];
  dataStage: DataStage;
  dataGrain: string | null;
}

/**
 * データ入力後に、相談文の推定値を実データで上書きする。
 * 時間軸の判定は呼び出し側が明示し、ラベルから推測しない。
 */
export function topologyFromObservedData(input: ObservedTopologyInput, prior?: ConsultationAnalysisV2): ConsultationAnalysisV2 {
  const nonNull = input.values.flat().filter((v) => v != null).length;
  const total = input.values.reduce((n, row) => n + row.length, 0);
  const missingness: Missingness = total === 0 || nonNull === 0 ? 'HIGH'
    : nonNull === total ? 'NONE'
      : nonNull / total < 0.8 ? 'HIGH' : 'PARTIAL';
  return ConsultationAnalysisV2Schema.parse({
    ...(prior ?? {}),
    dimensions: [input.rowDimension, input.columnDimension].map((d) => ({
      name: d.name,
      role: d.role,
      cardinality: new Set(d.values).size,
      hierarchy: d.hierarchy ?? [],
    })),
    period_count: new Set(input.periods).size,
    cell_count: total,
    missingness,
    data_stage: input.dataStage,
    data_grain: input.dataGrain,
  });
}
