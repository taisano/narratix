import type { SupabaseClient } from '@supabase/supabase-js';

/** ユーザーのレビュー（supabase/migrations/20261016000000_reviews.sql）。1人1件・書き直せる */
export const REVIEW_COMMENT_MAX = 400;
export const REVIEW_NICK_MAX = 40;

export interface MyReview { rating: number; comment: string; nickname: string; publishConsent: boolean; published: boolean }
export interface PublicReview { id: string; rating: number; comment: string; name: string | null; occupation: string | null; created_at: string }
export interface AdminReview {
  id: string; rating: number; comment: string; nickname: string; occupation: string | null;
  publish_consent: boolean; published: boolean; sort: number; created_at: string; updated_at: string;
}

export async function getMyReview(sb: SupabaseClient, userId: string): Promise<MyReview | null> {
  const { data, error } = await sb.from('reviews').select('rating, comment, nickname, publish_consent, published').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as { rating: number; comment: string; nickname: string; publish_consent: boolean; published: boolean };
  return { rating: r.rating, comment: r.comment, nickname: r.nickname, publishConsent: r.publish_consent, published: r.published };
}

export async function submitReview(sb: SupabaseClient, r: { rating: number; comment: string; nickname: string; publishConsent: boolean }): Promise<void> {
  const { error } = await sb.rpc('submit_review', { p_rating: r.rating, p_comment: r.comment, p_nickname: r.nickname, p_publish_consent: r.publishConsent });
  if (error) throw new Error(error.message);
}

export async function deleteMyReview(sb: SupabaseClient): Promise<void> {
  const { error } = await sb.rpc('delete_my_review');
  if (error) throw new Error(error.message);
}

/** 出力・保存の直後に聞いてよいか（まだ書いていない人で、使い込んだ人） */
export async function reviewEligible(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.rpc('review_prompt_state');
  if (error) return false;
  return !!(data as { eligible?: boolean } | null)?.eligible;
}

/** 公開されているレビュー（だれでも）。取れなかった時は空 */
export async function listPublicReviews(sb: SupabaseClient, limit = 12): Promise<PublicReview[]> {
  const { data, error } = await sb.rpc('public_reviews', { p_limit: limit });
  if (error || !Array.isArray(data)) return [];
  return data as PublicReview[];
}

/** 管理者：全件 */
export async function listAllReviews(sb: SupabaseClient): Promise<AdminReview[]> {
  const { data, error } = await sb.from('reviews')
    .select('id, rating, comment, nickname, occupation, publish_consent, published, sort, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as AdminReview[];
}

export async function setReviewPublished(sb: SupabaseClient, id: string, published: boolean, sort: number): Promise<void> {
  const { error } = await sb.rpc('admin_set_review', { p_id: id, p_published: published, p_sort: sort });
  if (error) throw new Error(error.message);
}

/** 星の平均は、公開の有無にかかわらず全件から（良いものだけを選んで平均を上げない） */
export const averageRating = (rows: { rating: number }[]): number => (rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : 0);

/** 表示名：ニックネーム、無ければ職種（表示用の文言は画面側で付ける） */
export const reviewerName = (name: string | null | undefined): string | null => (name && name.trim() ? name.trim() : null);
