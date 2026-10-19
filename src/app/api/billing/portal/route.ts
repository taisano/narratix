import { NextResponse } from 'next/server';
import { billingState, userFromRequest } from '@/lib/billing/server';
import { StripeError, createPortalSession } from '@/lib/billing/stripe';
import { SITE_URL } from '@/lib/site';

/** 契約の管理（解約・支払い方法・請求書）の Stripe カスタマーポータルの URL を返す */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const st = billingState();
  if (!st.ok) return NextResponse.json({ error: st.reason }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data } = await user.sb.from('billing_subscriptions').select('stripe_customer_id').maybeSingle();
  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return NextResponse.json({ error: 'no_customer' }, { status: 404 });
  try {
    const s = await createPortalSession(st.secretKey, customer, `${SITE_URL}/pricing`);
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.error('[billing] portal failed', e instanceof StripeError ? `${e.status} ${e.code}` : 'unknown');
    return NextResponse.json({ error: 'portal_failed' }, { status: 502 });
  }
}
