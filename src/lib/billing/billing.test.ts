import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CURRENCIES, PRICES } from '../pricing';
import { TERMS, TEST_PRICE_IDS, describePriceId, priceIdOf, priceTable, termTotal } from './prices';
import { StripeError, checkoutParams, createCheckoutSession, encodeForm, verifyWebhookSignature } from './stripe';
import { handleStripeEvent, type ApplyArgs, type StripeEvent, type WebhookDeps } from './webhook';

const UID = '11111111-1111-1111-1111-111111111111';

describe('価格表（Stripe の Price ID）', () => {
  it('プラン×通貨×期間の18個が、重複なく揃っている', () => {
    const ids = Object.values(TEST_PRICE_IDS);
    expect(ids).toHaveLength(2 * CURRENCIES.length * TERMS.length);
    expect(new Set(ids).size).toBe(18);
    expect(ids.every((i) => /^price_[A-Za-z0-9]+$/.test(i))).toBe(true);
  });
  it('Price ID から、プラン・通貨・期間を引ける', () => {
    expect(describePriceId(priceIdOf('team', 'JPY', 'm3'))).toEqual({ plan: 'team', currency: 'JPY', term: 'm3' });
    expect(describePriceId('price_unknown')).toBeNull();
    expect(describePriceId(null)).toBeNull();
  });
  it('3か月・12か月の額は、月額換算（3か月以上の価格）×月数で、Stripe に作った金額と一致する', () => {
    expect(termTotal('pro', 'USD', 'm1')).toBe(4.9);
    expect(termTotal('pro', 'USD', 'm3')).toBe(14.7);
    expect(termTotal('pro', 'USD', 'm12')).toBe(58.8);
    expect(termTotal('team', 'EUR', 'm3')).toBe(44.97);
    expect(termTotal('team', 'EUR', 'm12')).toBe(179.88);
    expect(termTotal('pro', 'JPY', 'm3')).toBe(2370);
    expect(termTotal('pro', 'JPY', 'm12')).toBe(9480);
    expect(termTotal('team', 'JPY', 'm3')).toBe(4440);
    expect(termTotal('team', 'JPY', 'm12')).toBe(17760);
    expect(PRICES.JPY.team.term * 12).toBe(17760);
  });
  it('STRIPE_PRICE_IDS_JSON で丸ごと差し替えられる。足りない・壊れている時はテスト用のまま', () => {
    const full: Record<string, string> = {};
    for (const p of ['pro', 'team']) for (const c of CURRENCIES) for (const t of TERMS) full[`${p}:${c}:${t}`] = `price_live${p}${c}${t}`;
    expect(priceTable({ STRIPE_PRICE_IDS_JSON: JSON.stringify(full) })['pro:USD:m1']).toBe('price_liveproUSDm1');
    expect(priceTable({ STRIPE_PRICE_IDS_JSON: JSON.stringify({ 'pro:USD:m1': 'price_a' }) })).toBe(TEST_PRICE_IDS);
    // Plus 1本（月払い・3通貨）だけでも差し替えられる。ほかはテスト用のまま
    const plus: Record<string, string> = {};
    for (const c of CURRENCIES) plus[`pro:${c}:m1`] = `price_plus${c}`;
    const t = priceTable({ STRIPE_PRICE_IDS_JSON: JSON.stringify(plus) });
    expect(t['pro:JPY:m1']).toBe('price_plusJPY');
    expect(t['team:USD:m1']).toBe(TEST_PRICE_IDS['team:USD:m1']);
    expect(priceTable({ STRIPE_PRICE_IDS_JSON: '{broken' })).toBe(TEST_PRICE_IDS);
  });
});

describe('Stripe クライアント', () => {
  it('入れ子の値を Stripe の form 形式にする', () => {
    expect(encodeForm({ managed_payments: { enabled: false } })).toEqual(['managed_payments%5Benabled%5D=false']);
    expect(encodeForm({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { user_id: 'u' }, skip: undefined })).toEqual([
      'mode=subscription', 'line_items%5B0%5D%5Bprice%5D=price_1', 'line_items%5B0%5D%5Bquantity%5D=1', 'metadata%5Buser_id%5D=u',
    ]);
  });
  it('Checkout は誰の購読かを載せ、既存の顧客があればそれを使う', () => {
    const base = { priceId: 'price_1', userId: UID, successUrl: 's', cancelUrl: 'c', locale: 'ja' as const };
    const a = checkoutParams({ ...base, email: 'a@b.c', customerId: null });
    expect(a).toMatchObject({ mode: 'subscription', client_reference_id: UID, customer_email: 'a@b.c', metadata: { user_id: UID }, subscription_data: { metadata: { user_id: UID } } });
    expect(a).toMatchObject({ managed_payments: { enabled: false } });
    expect(checkoutParams({ ...base, email: null, customerId: null, managedPayments: true })).toMatchObject({ managed_payments: { enabled: true } });
    const b = checkoutParams({ ...base, email: 'a@b.c', customerId: 'cus_1' });
    expect(b).toMatchObject({ customer: 'cus_1' });
    expect(b).not.toHaveProperty('customer_email');
  });
  it('API の呼び出しは Bearer 認証の form POST。失敗は StripeError', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 'cs_1', url: 'https://x' }), { status: 200 }));
    const r = await createCheckoutSession('sk_test_x', { priceId: 'price_1', userId: UID, email: null, customerId: null, successUrl: 's', cancelUrl: 'c', locale: 'en' }, { fetchImpl: f as unknown as typeof fetch });
    expect(r.url).toBe('https://x');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x');
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'resource_missing', message: 'no such price' } }), { status: 400 }));
    await expect(createCheckoutSession('sk', { priceId: 'p', userId: UID, email: null, customerId: null, successUrl: 's', cancelUrl: 'c', locale: 'en' }, { fetchImpl: bad as unknown as typeof fetch })).rejects.toBeInstanceOf(StripeError);
  });
});

describe('Webhook の署名検証', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1"}';
  const sign = (t: number, b = body, s = secret) => createHmac('sha256', s).update(`${t}.${b}`).digest('hex');
  it('正しい署名は通り、本文・秘密・時刻が違うものは拒む', () => {
    const now = 1_800_000_000;
    expect(verifyWebhookSignature(body, `t=${now},v1=${sign(now)}`, secret, now)).toBe(true);
    expect(verifyWebhookSignature(body + ' ', `t=${now},v1=${sign(now)}`, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${now},v1=${sign(now, body, 'other')}`, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${now},v1=${sign(now)}`, secret, now + 301)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${now},v1=zz`, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${now},v1=${sign(now)}`, '', now)).toBe(false);
  });
  it('署名が複数（鍵の入れ替え中）でも、どれかが合えば通る', () => {
    const now = 1_800_000_000;
    expect(verifyWebhookSignature(body, `t=${now},v1=${'0'.repeat(64)},v1=${sign(now)}`, secret, now)).toBe(true);
  });
});

describe('Webhook のイベント処理', () => {
  const price = priceIdOf('team', 'USD', 'm3');
  const sub = (o: Record<string, unknown> = {}) => ({
    id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { user_id: UID },
    items: { data: [{ price: { id: price }, current_period_end: 1_900_000_000 }] }, ...o,
  });
  const ev = (type: string, object: Record<string, unknown>, id = 'evt_1'): StripeEvent => ({ id, type, created: 1_800_000_000, data: { object } });
  const mk = (over: Partial<WebhookDeps> = {}) => {
    const applied: ApplyArgs[] = [];
    const deps: WebhookDeps = {
      apply: async (a) => { applied.push(a); return 'applied'; },
      userOfCustomer: async () => null,
      fetchSubscription: async () => sub() as never,
      ...over,
    };
    return { deps, applied };
  };

  it('購読の作成・更新を、プランと期間の終わりつきで DB に写す（新しい API の items 側の期間にも対応）', async () => {
    const { deps, applied } = mk();
    expect(await handleStripeEvent(ev('customer.subscription.updated', sub()), deps)).toEqual({ kind: 'applied' });
    expect(applied[0]!).toMatchObject({ userId: UID, plan: 'team', status: 'active', subscriptionId: 'sub_1', customerId: 'cus_1', cancelAtPeriodEnd: false });
    expect(applied[0]!.periodEnd?.toISOString()).toBe(new Date(1_900_000_000_000).toISOString());
  });
  it('削除の通知は、状態を canceled として写す', async () => {
    const { deps, applied } = mk();
    await handleStripeEvent(ev('customer.subscription.deleted', sub({ status: 'active' })), deps);
    expect(applied[0]!.status).toBe('canceled');
  });
  it('Checkout 完了は、購読を取り直して写す。誰のかは client_reference_id', async () => {
    const fetchSubscription = vi.fn(async () => sub({ metadata: {} }) as never);
    const { deps, applied } = mk({ fetchSubscription });
    await handleStripeEvent(ev('checkout.session.completed', { mode: 'subscription', subscription: 'sub_1', client_reference_id: UID }), deps);
    expect(fetchSubscription).toHaveBeenCalledWith('sub_1');
    expect(applied[0]!.userId).toBe(UID);
  });
  it('metadata に user_id が無い購読は、保存済みの顧客から引く', async () => {
    const { deps, applied } = mk({ userOfCustomer: async () => UID });
    await handleStripeEvent(ev('customer.subscription.updated', sub({ metadata: {} })), deps);
    expect(applied[0]!.userId).toBe(UID);
  });
  it('知らないイベント・知らない価格・誰か分からない購読は、何も書かずに skipped（再送させない）', async () => {
    const { deps, applied } = mk();
    expect(await handleStripeEvent(ev('invoice.paid', {}), deps)).toEqual({ kind: 'skipped', reason: 'unhandled_type' });
    expect(await handleStripeEvent(ev('customer.subscription.updated', sub({ items: { data: [{ price: { id: 'price_other' } }] } })), deps)).toEqual({ kind: 'skipped', reason: 'unknown_price' });
    expect(await handleStripeEvent(ev('customer.subscription.updated', sub({ metadata: { user_id: 'not-a-uuid' } })), deps)).toEqual({ kind: 'skipped', reason: 'unknown_user' });
    expect(await handleStripeEvent(ev('checkout.session.completed', { mode: 'payment' }), deps)).toEqual({ kind: 'skipped', reason: 'not_subscription' });
    expect(applied).toHaveLength(0);
  });
  it('DB の失敗は例外のまま上げる（Stripe に再送させる）', async () => {
    const { deps } = mk({ apply: async () => { throw new Error('db down'); } });
    await expect(handleStripeEvent(ev('customer.subscription.updated', sub()), deps)).rejects.toThrow('db down');
  });
});
