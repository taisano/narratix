import { describe, expect, it, vi } from 'vitest';
import { PLAN_LIMITS } from './ai/plans';
import { CURRENCIES, PLAN_MATRIX, PRICES, currencyOfLocale, formatPrice, termSavingPercent } from './pricing';

describe('料金', () => {
  it('ドルと円は合意した値', () => {
    expect(PRICES.USD).toEqual({ pro: { monthly: 4.9, term: 4.9 }, team: { monthly: 19.99, term: 14.99 } });
    expect(PRICES.EUR.pro.monthly).toBe(4.9);
    expect(PRICES.JPY.pro.monthly).toBe(790);
    expect(PRICES.JPY.team.monthly).toBe(1980);
  });
  it('ユーロはドルと同じ数字', () => {
    expect(PRICES.EUR).toEqual(PRICES.USD);
    expect(formatPrice(19.99, 'EUR', 'ja')).toContain('19.99');
  });
  it('Plus は1本の価格（期間割引なし）。Pro は Plus より高く、3か月以上は安い（戻す時のために値は残す）', () => {
    for (const c of CURRENCIES) {
      expect(PRICES[c].pro.term).toBe(PRICES[c].pro.monthly);
      expect(PRICES[c].team.term).toBeLessThan(PRICES[c].team.monthly);
      expect(PRICES[c].team.monthly).toBeGreaterThan(PRICES[c].pro.monthly);
    }
    expect(termSavingPercent('pro', 'USD')).toBe(0);
    expect(termSavingPercent('team', 'USD')).toBe(25);
  });
  it('Story・Coach を隠している間は、Plus だけが買える。戻すと Pro も出る', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_STORY_COACH', '');
    expect((await import('./pricing')).OFFERED_PAID_PLANS).toEqual(['pro']);
    expect((await import('./ai/plans')).storyAllowedFor(null)).toBe(false);
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_STORY_COACH', '1');
    expect((await import('./pricing')).OFFERED_PAID_PLANS).toEqual(['pro', 'team']);
    vi.unstubAllEnvs();
  });
  it('比較表の AI 相談の回数は、サーバーの上限（PLAN_LIMITS）と同じ', () => {
    for (const id of ['free', 'pro', 'team'] as const) expect(PLAN_MATRIX[id].consult.n).toBe(PLAN_LIMITS[id].ai_consult);
    expect(PLAN_MATRIX.free.consult.per).toBe('total');
  });
  it('基本は透かしあり・Story なし、Pro は無制限で Story とコーチ', () => {
    expect(PLAN_MATRIX.free).toMatchObject({ slides: 15, exports: 30, watermark: true, story: false });
    expect(PLAN_MATRIX.pro).toMatchObject({ slides: 100, exports: 200, watermark: false, story: false });
    expect(PLAN_MATRIX.team).toMatchObject({ slides: null, exports: null, story: true, coach: true, earlyAccess: true });
  });
  it('画面の言語から通貨を選び、金額を整える', () => {
    expect(currencyOfLocale('ja')).toBe('JPY');
    expect(currencyOfLocale('en')).toBe('USD');
    expect(formatPrice(4.9, 'USD', 'en')).toBe('$4.90');
    expect(formatPrice(1980, 'JPY', 'ja')).toMatch(/1,980/);
  });
});
