import { NextResponse } from 'next/server';
import { isCurrency } from '@/lib/pricing';
import { isPaidPlan, isTerm, priceIdOf } from '@/lib/billing/prices';
import { ACTIVE_STATUSES, billingState, userFromRequest } from '@/lib/billing/server';
import { StripeError, createCheckoutSession } from '@/lib/billing/stripe';
import { SITE_URL } from '@/lib/site';

/** 有料プランの申し込み（Stripe Checkout へ進む URL を返す）。プランの反映は Webhook が行う。docs/pricing-plan.md 7章 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const st = billingState();
  if (!st.ok) return NextResponse.json({ error: st.reason }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { plan?: unknown; currency?: unknown; term?: unknown; locale?: unknown } | null;
  if (!b || !isPaidPlan(b.plan) || !isCurrency(b.currency) || !isTerm(b.term)) return NextResponse.json({ error: 'bad_input' }, { status: 400 });

  // すでに有効な購読があれば二重に申し込ませない（変更・解約はポータルで）
  const { data: cur } = await user.sb.from('billing_subscriptions').select('stripe_customer_id,status').maybeSingle();
  if (cur && (ACTIVE_STATUSES as readonly string[]).includes(cur.status as string)) return NextResponse.json({ error: 'already_subscribed' }, { status: 409 });

  try {
    const s = await createCheckoutSession(st.secretKey, {
      priceId: priceIdOf(b.plan, b.currency, b.term),
      userId: user.id, email: user.email, customerId: (cur?.stripe_customer_id as string | undefined) ?? null,
      successUrl: `${SITE_URL}/pricing?checkout=success`, cancelUrl: `${SITE_URL}/pricing?checkout=cancel`,
      locale: b.locale === 'ja' ? 'ja' : 'en',
    });
    if (!s.url) return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
    return NextResponse.json({ url: s.url });
  } catch (e) {
    // Stripe の内部メッセージは画面に出さない（サーバーのログにだけ）
    console.error('[billing] checkout failed', e instanceof StripeError ? `${e.status} ${e.code}` : 'unknown');
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
