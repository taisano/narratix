/**
 * 料金（ベータの後の予定）。docs/pricing-plan.md。ドルが基準。円は指定の値、ユーロはドルを換算した暫定の値。
 * 決済はまだ作っていない。表示と、関心・価格感の記録にだけ使う。
 */
export const CURRENCIES = ['USD', 'JPY', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Billing = 'monthly' | 'term';
/** 有料のプラン。pro＝Plus、team＝Pro（plans.ts の ID のまま） */
export type PaidPlan = 'pro' | 'team';

export const PRICES: Record<Currency, Record<PaidPlan, Record<Billing, number>>> = {
  USD: { pro: { monthly: 9.99, term: 7.99 }, team: { monthly: 19.99, term: 14.99 } },
  JPY: { pro: { monthly: 980, term: 780 }, team: { monthly: 1980, term: 1480 } },
  EUR: { pro: { monthly: 9.49, term: 7.49 }, team: { monthly: 18.99, term: 13.99 } },
};
/** ユーロは、決済を作る時のレートで換算し直して確定する。それまでは目安と表示する */
export const EUR_PROVISIONAL = true;

/** 無料枠の回数の表示用（実際の上限はサーバーの plan_settings。ここは表示の初期値） */
export const FREE_TRIAL = { slide: 10, story: 3 } as const;

export const currencyOfLocale = (locale: string): Currency => (locale === 'ja' ? 'JPY' : 'USD');

export function formatPrice(amount: number, currency: Currency, locale: string): string {
  return new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    style: 'currency', currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2, maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount);
}

/** 3か月以上の契約で、月払いより何%安いか（四捨五入） */
export const termSavingPercent = (plan: PaidPlan, currency: Currency): number => {
  const p = PRICES[currency][plan];
  return Math.round((1 - p.term / p.monthly) * 100);
};

export const isCurrency = (v: unknown): v is Currency => (CURRENCIES as readonly string[]).includes(v as string);
