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
  recommended_recipe_ids: z.array(z.enum(RECIPE_IDS)),
  selected_recipe_ids: z.array(z.enum(RECIPE_IDS)),
  recommendation_version: z.string(),
  ai_used_after_data_input: z.literal(false),
});
export type RecommendationState = z.infer<typeof RecommendationStateSchema>;
