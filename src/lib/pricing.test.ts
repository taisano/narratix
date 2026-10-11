import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS } from './ai/plans';
import { CURRENCIES, PLAN_MATRIX, PRICES, currencyOfLocale, formatPrice, termSavingPercent } from './pricing';

describe('料金', () => {
  it('ドルと円は合意した値', () => {
    expect(PRICES.USD).toEqual({ pro: { monthly: 9.99, term: 7.99 }, team: { monthly: 19.99, term: 14.99 } });
    expect(PRICES.JPY.pro.monthly).toBe(980);
    expect(PRICES.JPY.team.monthly).toBe(1980);
  });
  it('どの通貨でも、3か月以上は月払いより安く、Pro は Plus より高い', () => {
    for (const c of CURRENCIES) {
      for (const p of ['pro', 'team'] as const) expect(PRICES[c][p].term).toBeLessThan(PRICES[c][p].monthly);
      expect(PRICES[c].team.monthly).toBeGreaterThan(PRICES[c].pro.monthly);
      expect(PRICES[c].team.term).toBeGreaterThan(PRICES[c].pro.term);
    }
  });
  it('割引率は Plus 20%・Pro 25%（ドル）', () => {
    expect(termSavingPercent('pro', 'USD')).toBe(20);
    expect(termSavingPercent('team', 'USD')).toBe(25);
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
    expect(formatPrice(9.99, 'USD', 'en')).toBe('$9.99');
    expect(formatPrice(1980, 'JPY', 'ja')).toMatch(/1,980/);
  });
});
