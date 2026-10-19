import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { usingCustomPrices } from './prices';

type Env = Record<string, string | undefined>;

/** 課金を動かせる状態か。秘密鍵が無ければ無効（画面は従来の「この料金なら使いたい」のまま）。本番鍵なのに本番の Price ID が無ければ止める */
export function billingState(env: Env = process.env): { ok: true; secretKey: string } | { ok: false; reason: 'billing_disabled' | 'prices_not_configured' } {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) return { ok: false, reason: 'billing_disabled' };
  if (secretKey.startsWith('sk_live_') && !usingCustomPrices(env)) return { ok: false, reason: 'prices_not_configured' };
  return { ok: true, secretKey };
}

/** ログイン中の本人として Supabase を使うクライアントと、その人の情報（Bearer の access token で確かめる） */
export async function userFromRequest(req: Request): Promise<{ sb: SupabaseClient; id: string; email: string | null } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!url || !key || !token) return null;
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { sb, id: data.user.id, email: data.user.email ?? null };
}

/** Webhook 専用。service role キー（サーバーの環境変数だけ。画面・リポジトリ・チャットには出さない） */
export function serviceClient(env: Env = process.env): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;
