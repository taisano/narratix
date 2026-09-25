import type { SupabaseClient } from '@supabase/supabase-js';
import { RECIPE_DB_VERSION, type ConsultationClassification, type RecipeId } from '@/registry';

/** 👎 の理由（画面の選択肢。文言は messages の feedback.reason.*） */
export const FEEDBACK_REASONS = ['not_my_goal', 'data_mismatch', 'better_chart', 'hard_to_understand'] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export interface FeedbackInput {
  entryMode: 'CONSULTATION' | 'PURPOSE' | 'CHART';
  consultationText?: string;
  classification?: ConsultationClassification;
  recommended: RecipeId[];
  chosen: RecipeId[];
  rating: 'up' | 'down';
  reasons: FeedbackReason[];
  comment?: string;
}

/** 提案へのフィードバックを保存する（ログインしている時だけ。RLS で本人の行として入る） */
export async function sendFeedback(sb: SupabaseClient, f: FeedbackInput): Promise<void> {
  const { error } = await sb.from('recommendation_feedback').insert({
    entry_mode: f.entryMode,
    consultation_text: f.consultationText?.slice(0, 4000) ?? null,
    classification: f.classification ?? null,
    recommended_recipe_ids: f.recommended,
    chosen_recipe_ids: f.chosen,
    rating: f.rating,
    reasons: f.reasons,
    comment: f.comment?.trim().slice(0, 2000) || null,
    recommendation_version: RECIPE_DB_VERSION,
    classifier: 'rules',
  });
  if (error) throw new Error(error.message);
}
