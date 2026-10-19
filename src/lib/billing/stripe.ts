import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe の最小限のクライアント（SDK は使わず、REST と署名検証だけ）。サーバー専用。
 * 秘密鍵（STRIPE_SECRET_KEY）と Webhook の署名シークレット（STRIPE_WEBHOOK_SECRET）は環境変数だけで扱い、ログにも出さない。
 */
const API = 'https://api.stripe.com/v1';

/** Stripe が受け付ける入れ子の form 形式（a[b][0][c]=…）に直す */
export function encodeForm(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item !== null && typeof item === 'object') out.push(...encodeForm(item as Record<string, unknown>, `${key}[${i}]`));
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
    });
    else if (typeof v === 'object') out.push(...encodeForm(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export class StripeError extends Error {
  constructor(public status: number, public code: string | null, message: string) { super(message); }
}

type Fetch = typeof fetch;

export async function stripeRequest<T>(
  secretKey: string, method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {},
  opts: { fetchImpl?: Fetch; idempotencyKey?: string } = {},
): Promise<T> {
  const body = encodeForm(params).join('&');
  const url = method === 'GET' && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await (opts.fetchImpl ?? fetch)(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    ...(method === 'POST' ? { body } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } & T;
  if (!res.ok) throw new StripeError(res.status, json.error?.code ?? null, json.error?.message ?? `stripe ${res.status}`);
  return json;
}

export interface CheckoutArgs {
  priceId: string;
  userId: string;
  email: string | null;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
  locale: 'ja' | 'en';
}

/** 定期購読（前払い）の Checkout セッション。誰の購読かは client_reference_id と metadata に user_id を載せて Webhook に伝える */
export function checkoutParams(a: CheckoutArgs): Record<string, unknown> {
  return {
    mode: 'subscription',
    line_items: [{ price: a.priceId, quantity: 1 }],
    client_reference_id: a.userId,
    ...(a.customerId ? { customer: a.customerId } : a.email ? { customer_email: a.email } : {}),
    metadata: { user_id: a.userId },
    subscription_data: { metadata: { user_id: a.userId } },
    success_url: a.successUrl,
    cancel_url: a.cancelUrl,
    locale: a.locale,
    allow_promotion_codes: false,
  };
}

export const createCheckoutSession = (key: string, a: CheckoutArgs, opts?: { fetchImpl?: Fetch }) =>
  stripeRequest<{ id: string; url: string | null }>(key, 'POST', '/checkout/sessions', checkoutParams(a), opts);

export const createPortalSession = (key: string, customerId: string, returnUrl: string, opts?: { fetchImpl?: Fetch }) =>
  stripeRequest<{ url: string }>(key, 'POST', '/billing_portal/sessions', { customer: customerId, return_url: returnUrl }, opts);

export const retrieveSubscription = (key: string, id: string, opts?: { fetchImpl?: Fetch }) =>
  stripeRequest<StripeSubscription>(key, 'GET', `/subscriptions/${encodeURIComponent(id)}`, {}, opts);

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { price?: { id?: string }; current_period_end?: number }[] };
}

/**
 * Webhook の署名検証。Stripe-Signature の「t=時刻,v1=署名」を、`${t}.${本文}` の HMAC-SHA256 と照らす。
 * 本文は「受け取ったままの文字列」で検証する（JSON にし直すと合わなくなる）。時刻が離れすぎた通知は再送攻撃として拒む。
 */
export function verifyWebhookSignature(payload: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((s) => s.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v).filter((v): v is string => !!v);
  if (!Number.isFinite(t) || sigs.length === 0 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest();
  return sigs.some((s) => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    return timingSafeEqual(expected, Buffer.from(s, 'hex'));
  });
}
