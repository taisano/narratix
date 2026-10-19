import { describe, expect, it, vi } from 'vitest';
import { getMySubscription, isSubscriptionActive, openPortal, parseSubscription, startCheckout } from './billing';

const res = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const args = { plan: 'pro', currency: 'JPY', term: 'm3', locale: 'ja' } as const;

describe('startCheckout / openPortal', () => {
  it('成功すると https の URL を返し、トークンと内容を送る', async () => {
    const f = res(200, { url: 'https://checkout.stripe.com/c/pay/x' });
    expect(await startCheckout('tok', args, f)).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/x' });
    const [path, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(path).toBe('/api/billing/checkout');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual(args);
  });
  it('サーバーのエラーコードをそのまま返す。https 以外の URL は受け取らない', async () => {
    expect(await startCheckout('t', args, res(409, { error: 'already_subscribed' }))).toEqual({ ok: false, error: 'already_subscribed' });
    expect(await startCheckout('t', args, res(503, { error: 'billing_disabled' }))).toEqual({ ok: false, error: 'billing_disabled' });
    expect(await startCheckout('t', args, res(200, { url: 'javascript:alert(1)' }))).toEqual({ ok: false, error: 'checkout_failed' });
  });
  it('通信できない時は network', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await openPortal('t', f)).toEqual({ ok: false, error: 'network' });
  });
});

describe('購読の読み取り', () => {
  it('行を整えて読む。プランが不正なら null', () => {
    expect(parseSubscription({ plan: 'team', status: 'active', current_period_end: '2027-01-01T00:00:00Z', cancel_at_period_end: true }))
      .toMatchObject({ plan: 'team', status: 'active', cancelAtPeriodEnd: true });
    expect(parseSubscription({ plan: 'free' })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ plan: 'pro', status: 'active', current_period_end: 'x' })?.periodEnd).toBeNull();
  });
  it('有効かどうか（past_due は猶予中なので有効）', () => {
    const s = (status: string) => ({ plan: 'pro' as const, status, periodEnd: null, cancelAtPeriodEnd: false });
    expect(isSubscriptionActive(s('active'))).toBe(true);
    expect(isSubscriptionActive(s('past_due'))).toBe(true);
    expect(isSubscriptionActive(s('canceled'))).toBe(false);
    expect(isSubscriptionActive(null)).toBe(false);
  });
  it('テーブルが無い（SQL 未実行）などの失敗は null', async () => {
    const sb = { from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) } as never;
    expect(await getMySubscription(sb)).toBeNull();
  });
});
