import { describePriceId } from './prices';
import type { StripeSubscription } from './stripe';

/** Webhook で受け取る Stripe のイベント（使う部分だけ） */
export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export interface ApplyArgs {
  eventId: string; eventType: string; eventCreated: Date;
  userId: string; customerId: string; subscriptionId: string; status: string;
  priceId: string | null; plan: 'pro' | 'team'; periodEnd: Date | null; cancelAtPeriodEnd: boolean;
}
export type ApplyResult = 'applied' | 'duplicate' | 'stale' | 'ignored';

export interface WebhookDeps {
  apply: (a: ApplyArgs) => Promise<ApplyResult>;
  /** 購読の metadata に user_id が無い時の引き当て（保存済みの customer から） */
  userOfCustomer: (customerId: string) => Promise<string | null>;
  fetchSubscription: (id: string) => Promise<StripeSubscription>;
  env?: Record<string, string | undefined>;
}

export type WebhookOutcome =
  | { kind: 'applied' | 'duplicate' | 'stale' | 'ignored'; detail?: string }
  | { kind: 'skipped'; reason: string };

const HANDLED = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'checkout.session.completed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const periodEndOf = (s: StripeSubscription): Date | null => {
  const sec = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return typeof sec === 'number' ? new Date(sec * 1000) : null;
};

/**
 * Stripe のイベント1件を処理する。課金の「正」は Stripe の購読の状態で、ここではそれを DB に写すだけ。
 * 想定外のもの（知らないイベント・知らない価格・誰の購読か分からない）は、再送されても直らないので「skipped」にして 200 を返す
 * （Stripe に何度も再送させない）。DB の失敗など一時的なものだけ例外にして、Stripe に再送させる。
 */
export async function handleStripeEvent(ev: StripeEvent, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (!HANDLED.has(ev.type)) return { kind: 'skipped', reason: 'unhandled_type' };

  let sub: StripeSubscription;
  let userHint: string | null = null;
  if (ev.type === 'checkout.session.completed') {
    const o = ev.data.object;
    if (o.mode !== 'subscription') return { kind: 'skipped', reason: 'not_subscription' };
    const subId = str(o.subscription);
    if (!subId) return { kind: 'skipped', reason: 'no_subscription' };
    userHint = str(o.client_reference_id) ?? str((o.metadata as Record<string, unknown> | undefined)?.user_id);
    sub = await deps.fetchSubscription(subId);
  } else {
    sub = ev.data.object as unknown as StripeSubscription;
  }
  if (!str(sub.id) || !str(sub.customer)) return { kind: 'skipped', reason: 'bad_subscription' };

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const desc = describePriceId(priceId, deps.env);
  if (!desc) return { kind: 'skipped', reason: 'unknown_price' };

  let userId = str(sub.metadata?.user_id) ?? userHint;
  if (!userId || !UUID.test(userId)) userId = await deps.userOfCustomer(sub.customer);
  if (!userId || !UUID.test(userId)) return { kind: 'skipped', reason: 'unknown_user' };

  const res = await deps.apply({
    eventId: ev.id, eventType: ev.type, eventCreated: new Date(ev.created * 1000),
    userId, customerId: sub.customer, subscriptionId: sub.id,
    status: ev.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
    priceId, plan: desc.plan, periodEnd: periodEndOf(sub), cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
  return { kind: res };
}
