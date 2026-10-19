import { NextResponse } from 'next/server';
import { billingState, serviceClient } from '@/lib/billing/server';
import { retrieveSubscription, verifyWebhookSignature } from '@/lib/billing/stripe';
import { handleStripeEvent, type ApplyResult, type StripeEvent } from '@/lib/billing/webhook';

/**
 * Stripe からの通知（購読の作成・更新・解約）を受けて、user_plans を合わせる。
 * 署名を確かめてから処理する（偽の通知ではプランを変えられない）。本文は加工せず、受け取ったままで検証する。
 * 想定外の通知は 200（再送不要）、DB の失敗だけ 500（Stripe が再送する）。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const st = billingState();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sb = serviceClient();
  if (!st.ok || !secret || !sb) return NextResponse.json({ error: 'billing_disabled' }, { status: 503 });

  const payload = await req.text();
  if (!verifyWebhookSignature(payload, req.headers.get('stripe-signature'), secret)) return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  let ev: StripeEvent;
  try { ev = JSON.parse(payload) as StripeEvent; } catch { return NextResponse.json({ error: 'bad_payload' }, { status: 400 }); }
  if (!ev?.id || !ev.type || !ev.data?.object) return NextResponse.json({ error: 'bad_payload' }, { status: 400 });

  try {
    const out = await handleStripeEvent(ev, {
      fetchSubscription: (id) => retrieveSubscription(st.secretKey, id),
      userOfCustomer: async (customerId) => {
        const { data } = await sb.from('billing_subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
        return (data?.user_id as string | undefined) ?? null;
      },
      apply: async (a) => {
        const { data, error } = await sb.rpc('apply_stripe_subscription', {
          p_event_id: a.eventId, p_event_type: a.eventType, p_event_created: a.eventCreated.toISOString(),
          p_user: a.userId, p_customer: a.customerId, p_subscription: a.subscriptionId, p_status: a.status,
          p_price: a.priceId, p_plan: a.plan, p_period_end: a.periodEnd?.toISOString() ?? null, p_cancel_at_end: a.cancelAtPeriodEnd,
        });
        if (error) throw new Error(error.message);
        return data as ApplyResult;
      },
    });
    if (out.kind === 'skipped') console.warn('[stripe] skipped', ev.type, out.reason);
    return NextResponse.json({ received: true, result: out.kind });
  } catch (e) {
    console.error('[stripe] webhook failed', ev.type, e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
