/**
 * 料金（ベータの後の予定）。docs/pricing-plan.md。ドルが基準。ユーロはドルと同じ数字（€9.99 など）、円は指定の値。
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
  EUR: { pro: { monthly: 9.99, term: 7.99 }, team: { monthly: 19.99, term: 14.99 } },
};

/**
 * プランごとの内容（比較表の元）。回数の表示用で、強制はサーバー側：
 * 作成・出力は DB の plan_settings（既定値がこの数字）、AI 相談は ai/plans.ts の PLAN_LIMITS（pricing.test.ts で一致を確かめる）。
 * null は無制限（誤作動や不正利用を防ぐ1日の上限は別にある）
 */
export interface PlanSpec {
  /** AI 相談（相談文から、AI が1枚スライドの切り口を提案）。per＝total は登録してからの累計、month は月ごと */
  consult: { n: number; per: 'total' | 'month' };
  /** チャート・目的からのスライド作成（新しく保存した数）。月あたり */
  slides: number | null;
  /** 編集できる PPT の出力。月あたり */
  exports: number | null;
  watermark: boolean;
  story: boolean;
  coach: boolean;
  earlyAccess: boolean;
}
export const PLAN_MATRIX: Record<'free' | PaidPlan, PlanSpec> = {
  free: { consult: { n: 5, per: 'total' }, slides: 15, exports: 30, watermark: true, story: false, coach: false, earlyAccess: false },
  pro: { consult: { n: 100, per: 'month' }, slides: 100, exports: 200, watermark: false, story: false, coach: false, earlyAccess: false },
  team: { consult: { n: 300, per: 'month' }, slides: null, exports: null, watermark: false, story: true, coach: true, earlyAccess: true },
};

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
