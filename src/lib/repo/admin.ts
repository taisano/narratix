import type { SupabaseClient } from '@supabase/supabase-js';

/** 管理者だけが読める（RLS）。提案へのフィードバック（② の 👍／👎） */
export interface RecFeedbackRow {
  id: string; created_at: string; entry_mode: string; consultation_text: string | null;
  classification: { primary_goal?: string; business_question?: string | null } | null;
  recommended_recipe_ids: string[]; chosen_recipe_ids: string[]; rating: 'up' | 'down'; reasons: string[]; comment: string | null; classifier: string;
}
/** ベータのご意見（フィードバックのフォーム） */
export interface BetaFeedbackRow {
  id: string; created_at: string; category: string; message: string; reply_email: string | null; page: string | null; locale: string | null; notified: boolean;
}

export async function listRecFeedback(sb: SupabaseClient, limit = 200): Promise<RecFeedbackRow[]> {
  const { data, error } = await sb.from('recommendation_feedback')
    .select('id, created_at, entry_mode, consultation_text, classification, recommended_recipe_ids, chosen_recipe_ids, rating, reasons, comment, classifier')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as RecFeedbackRow[];
}

export async function listBetaFeedback(sb: SupabaseClient, limit = 200): Promise<BetaFeedbackRow[]> {
  const { data, error } = await sb.from('beta_feedback')
    .select('id, created_at, category, message, reply_email, page, locale, notified')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as BetaFeedbackRow[];
}
