import { z } from 'zod';
import { AUDIENCE_IDS, RECIPE_IDS, type PurposeId } from './ids';

/**
 * 相談から入った時の、AI の入出力の形（docs/consultation-flow.md 6・7・16章）。
 * AI は分類と recipe_id の候補だけを返す。順位はアプリの規則（rankRecipes）で決め、文言はレシピから取る。
 */

export const GOAL_CODES = ['TREND', 'COMPARISON', 'COMPOSITION', 'CONTRIBUTION', 'RELATIONSHIP', 'EVALUATION'] as const;
export type GoalCode = (typeof GOAL_CODES)[number];

export const GOAL_TO_PURPOSE: Record<GoalCode, PurposeId> = {
  TREND: 'trend', COMPARISON: 'comparison', COMPOSITION: 'composition',
  CONTRIBUTION: 'contribution', RELATIONSHIP: 'relationship', EVALUATION: 'evaluate',
};

/** true / false / 相談文からは分からない */
const Need = z.union([z.boolean(), z.literal('unknown')]).default('unknown');
export type Need = z.infer<typeof Need>;

/** 行動：案を出す／案を出さずに確認する／まだ作れないと伝える */
export const ADVISOR_ACTIONS = ['RECOMMEND', 'CLARIFY', 'UNSUPPORTED'] as const;
export type AdvisorAction = (typeof ADVISOR_ACTIONS)[number];
/** 確認で聞くこと（質問の文と選択肢はアプリが持つ。AI には書かせない） */
export const MISSING_INFO = ['MEASURE', 'VIEW', 'DECISION', 'AVERAGE_BASIS'] as const;
export type MissingInfo = (typeof MISSING_INFO)[number];
/** 時間の扱い：なし（1時点）／複数時点（推移）／2時点（開始と終了、前年と今年） */
export const TIME_MODES = ['NONE', 'MULTI_PERIOD', 'TWO_POINT', 'UNKNOWN'] as const;
export type TimeMode = (typeof TIME_MODES)[number];
/** 比較の意味：大小・順位／差／順位の入れ替わり／平均との差 */
export const COMPARISON_INTENTS = ['LEVEL', 'DELTA', 'RANK_CHANGE', 'AVERAGE_GAP', 'NONE', 'UNKNOWN'] as const;
export type ComparisonIntent = (typeof COMPARISON_INTENTS)[number];
/** 構成の意味：構成比／規模と構成比（Mekko）／全体と内訳の推移 */
export const COMPOSITION_INTENTS = ['SHARE', 'SIZE_AND_SHARE', 'BREAKDOWN', 'NONE', 'UNKNOWN'] as const;
export type CompositionIntent = (typeof COMPOSITION_INTENTS)[number];
/** 指標を足し合わせられるか（率・平均・単価・指数は足せない） */
export const ADDITIVITY = ['ADDITIVE', 'NON_ADDITIVE', 'UNKNOWN'] as const;
export type Additivity = (typeof ADDITIVITY)[number];
/** 系列（比べる項目）が1つか、複数か */
export const SERIES_COUNTS = ['SINGLE', 'MULTIPLE', 'UNKNOWN'] as const;
export type SeriesCount = (typeof SERIES_COUNTS)[number];

/** 相談文から分からない項目は null / 'unknown' のまま（推測で決めない） */
export const ConsultationClassificationSchema = z.object({
  primary_goal: z.enum(GOAL_CODES),
  business_question: z.string().nullable().default(null),
  audience: z.enum([...AUDIENCE_IDS, 'UNKNOWN']).default('UNKNOWN'),
  /** 例：'2021-2025'。時系列かどうか分からなければ null */
  time_scope: z.string().nullable().default(null),
  comparison_dimension: z.string().nullable().default(null),
  measure: z.string().nullable().default(null),
  decision_context: z.string().nullable().default(null),
  needs_exact_values: Need,
  needs_size_context: Need,
  needs_rate_context: Need,
  confidence: z.number().min(0).max(1).default(0.5),
  // ── 2026-09-25 追加（正解表のレビューから）。無い古いデータは既定値で読む ──
  expected_action: z.enum(ADVISOR_ACTIONS).default('RECOMMEND'),
  missing_info: z.array(z.enum(MISSING_INFO)).default([]),
  time_mode: z.enum(TIME_MODES).default('UNKNOWN'),
  comparison_intent: z.enum(COMPARISON_INTENTS).default('UNKNOWN'),
  composition_intent: z.enum(COMPOSITION_INTENTS).default('UNKNOWN'),
  measure_additivity: z.enum(ADDITIVITY).default('UNKNOWN'),
  series_count: z.enum(SERIES_COUNTS).default('UNKNOWN'),
});
export type ConsultationClassification = z.infer<typeof ConsultationClassificationSchema>;

/** 推薦理由のコード（画面の文言は出さず、コードだけ） */
export const REASON_CODES = [
  'GOAL_MATCH', 'SUB_GOAL_MATCH', 'TIME_SERIES', 'AUDIENCE_MATCH', 'EXECUTIVE_USE',
  'RATE_REQUIRED', 'SIZE_REQUIRED', 'EXACT_VALUES', 'MIX_CHANGE', 'START_END_COMPARISON', 'IMPACT',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const ConsultationResultSchema = z.object({
  consultation_summary: z.string(),
  interpreted_question: z.string(),
  classification: ConsultationClassificationSchema,
  recommendations: z
    .array(z.object({ recipe_id: z.enum(RECIPE_IDS), rank: z.number().int().min(1), reason_codes: z.array(z.string()).default([]) }))
    .max(3),
});
export type ConsultationResult = z.infer<typeof ConsultationResultSchema>;

/** AI に渡す JSON Schema（出力の形を固定する） */
export function consultationJsonSchema() {
  return z.toJSONSchema(ConsultationResultSchema, { io: 'input' });
}

/** プロジェクトに残す推薦の状態（16章） */
export const RecommendationStateSchema = z.object({
  entry_mode: z.enum(['CONSULTATION', 'PURPOSE', 'CHART']),
  consultation_text: z.string().optional(),
  consultation_classification: ConsultationClassificationSchema.optional(),
  /** 相談の履歴の id（マイページの履歴と、保存したチャートをつなぐ） */
  consultation_history_id: z.string().optional(),
  recommended_recipe_ids: z.array(z.enum(RECIPE_IDS)),
  selected_recipe_ids: z.array(z.enum(RECIPE_IDS)),
  recommendation_version: z.string(),
  ai_used_after_data_input: z.literal(false),
});
export type RecommendationState = z.infer<typeof RecommendationStateSchema>;
