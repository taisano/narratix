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

/** 利用の流れ（同意した人の記録）。管理者だけが読める（RLS）。user_id は持たない（anon_id だけ） */
export interface JourneyRow {
  id: number; anon_id: string; occurred_at: string; session_id: string | null; kind: string;
  payload: Record<string, unknown>; occupation: string | null; referral: string | null; joined_week: string | null;
}

export async function listJourney(sb: SupabaseClient, limit = 5000): Promise<JourneyRow[]> {
  const { data, error } = await sb.from('journey_events')
    .select('id, anon_id, occurred_at, session_id, kind, payload, occupation, referral, joined_week')
    .order('id', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as JourneyRow[];
}

/** ダッシュボードの数字（supabase/migrations/20261015000000_admin_dashboard.sql）。件数だけ。管理者だけが呼べる */
export interface Kn { k: string; n: number }
export interface Dashboard {
  generated_at: string;
  members: { total: number; active: number; waitlist: number };
  signups_daily: { d: string; n: number }[];
  dau: { d: string; n: number }[];
  mau: { m: string; n: number }[];
  active_30d: number;
  active_7d: number;
  by_occupation: Kn[];
  by_referral: Kn[];
  decks: { charts: number; stories: number };
  slides_by_chart: Kn[];
  creation_modes: Kn[];
  usage: { consults: number; ai_consults: number; ppt_exports: number };
}

export async function getDashboard(sb: SupabaseClient): Promise<Dashboard> {
  const { data, error } = await sb.rpc('admin_dashboard');
  if (error) throw new Error(error.message);
  return data as Dashboard;
}

/** ベータの枠と順番待ち（supabase/migrations/20261017000000_beta_cap_100.sql）。管理者だけ */
export interface BetaOverview {
  cap: number; active: number; waitlist: number;
  queue: { pos: number; joined_at: string; occupation: string; referral: string }[];
}
export const getBetaOverview = async (sb: SupabaseClient): Promise<BetaOverview> => {
  const { data, error } = await sb.rpc('admin_beta_overview');
  if (error) throw new Error(error.message);
  return data as BetaOverview;
};
/** 枠を変える。空いた分だけ、順番待ちを登録の早い順に繰り上げる。繰り上げた人のメールを返す（ご案内用） */
export const setBetaCap = async (sb: SupabaseClient, cap: number): Promise<{ cap: number; promoted: string[] }> => {
  const { data, error } = await sb.rpc('admin_set_beta_cap', { p_cap: cap });
  if (error) throw new Error(error.message);
  return data as { cap: number; promoted: string[] };
};
/** 「このサービスを紹介する」経由の来訪（人数・経路ごと） */
export const getShareVisits = async (sb: SupabaseClient): Promise<Kn[]> => {
  const { data, error } = await sb.rpc('admin_share_visits');
  if (error) throw new Error(error.message);
  return (data ?? []) as Kn[];
};
