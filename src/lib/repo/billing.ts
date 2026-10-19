import type { SupabaseClient } from '@supabase/supabase-js';
import type { Currency, PaidPlan } from '@/lib/pricing';
import type { Term } from '@/lib/billing/prices';

/** 課金の画面側。決済そのものは Stripe の画面で行い、プランへの反映はサーバーの Webhook が行う（ここはその入口だけ） */
export type BillingError =
  | 'billing_disabled' | 'prices_not_configured' | 'unauthorized' | 'already_subscribed'
  | 'bad_input' | 'checkout_failed' | 'no_customer' | 'portal_failed' | 'network';
export type UrlResult = { ok: true; url: string } | { ok: false; error: BillingError };

async function post(path: string, token: string, body: unknown, fetchImpl: typeof fetch): Promise<UrlResult> {
  try {
    const res = await fetchImpl(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    });
    const j = (await res.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
    if (res.ok && typeof j.url === 'string' && /^https:\/\//.test(j.url)) return { ok: true, url: j.url };
    return { ok: false, error: typeof j.error === 'string' ? (j.error as BillingError) : 'checkout_failed' };
  } catch { return { ok: false, error: 'network' }; }
}

export const startCheckout = (token: string, a: { plan: PaidPlan; currency: Currency; term: Term; locale: 'ja' | 'en' }, fetchImpl: typeof fetch = fetch) =>
  post('/api/billing/checkout', token, a, fetchImpl);

export const openPortal = (token: string, fetchImpl: typeof fetch = fetch) => post('/api/billing/portal', token, {}, fetchImpl);

/** 自分の購読（読み取り専用。まだ契約していない・テーブルが無い時は null） */
export interface MySubscription {
  plan: PaidPlan;
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export function parseSubscription(row: unknown): MySubscription | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (r.plan !== 'pro' && r.plan !== 'team') return null;
  const end = typeof r.current_period_end === 'string' ? new Date(r.current_period_end) : null;
  return {
    plan: r.plan, status: typeof r.status === 'string' ? r.status : 'unknown',
    periodEnd: end && !Number.isNaN(end.getTime()) ? end : null, cancelAtPeriodEnd: r.cancel_at_period_end === true,
  };
}

export async function getMySubscription(sb: SupabaseClient): Promise<MySubscription | null> {
  const { data, error } = await sb.from('billing_subscriptions').select('plan,status,current_period_end,cancel_at_period_end').maybeSingle();
  return error ? null : parseSubscription(data);
}

/** 有効な購読か（解約済みでも、支払い済みの期間は使える） */
export const isSubscriptionActive = (s: MySubscription | null): boolean => !!s && ['active', 'trialing', 'past_due'].includes(s.status);
