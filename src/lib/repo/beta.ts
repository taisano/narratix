import type { SupabaseClient } from '@supabase/supabase-js';

/** ベータ版の登録（supabase/migrations/20260928000000_beta.sql） */
export type BetaStatus = 'active' | 'waitlist';

/** 無料で使える回数（月あたり）。PPT の回数は DB の関数でも 10 に抑えている */
export const FREE_PPT_PER_MONTH = 10;
export const FREE_CONSULT_PER_MONTH = 10;

export async function readBeta(sb: SupabaseClient, userId: string): Promise<{ status: BetaStatus; emailOptIn: boolean } | null> {
  const { data, error } = await sb.from('beta_members').select('status, email_opt_in').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { status: (data as { status: BetaStatus }).status, emailOptIn: !!(data as { email_opt_in: boolean }).email_opt_in } : null;
}

export async function joinBeta(sb: SupabaseClient, emailOptIn: boolean): Promise<BetaStatus> {
  const { data, error } = await sb.rpc('join_beta', { p_agree_terms: true, p_email_opt_in: emailOptIn });
  if (error) throw new Error(error.message);
  return data as BetaStatus;
}

export async function setEmailOptIn(sb: SupabaseClient, optIn: boolean): Promise<void> {
  const { error } = await sb.rpc('set_beta_email_opt_in', { p_opt_in: optIn });
  if (error) throw new Error(error.message);
}

/** PPT を出力する前に呼ぶ。今月の回数が残っていれば1回数えて allowed: true */
export async function recordPptExport(sb: SupabaseClient): Promise<{ allowed: boolean; used: number }> {
  const { data, error } = await sb.rpc('record_ppt_export', { p_limit: FREE_PPT_PER_MONTH });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; used: number } | undefined;
  return row ?? { allowed: false, used: 0 };
}

/** 登録の画面で選んだ同意を、メールのリンクから戻るまで覚えておく */
export const CONSENT_KEY = 'slide-story-coach:beta-consent';
