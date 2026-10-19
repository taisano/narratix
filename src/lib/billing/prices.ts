import { CURRENCIES, PRICES, type Currency, type PaidPlan } from '../pricing';

/**
 * Stripe の Price ID（前払いの定期購読）。プラン × 通貨 × 期間。docs/pricing-plan.md 7章。
 * m1＝1か月、m3＝3か月ごと、m12＝12か月ごと（どちらも前払い・期間ごとに自動更新・いつでも解約できる）。
 * 下の ID はテストモードのもの。本番（live）では別の ID になるので、環境変数 STRIPE_PRICE_IDS_JSON で丸ごと差し替える：
 *   {"pro:USD:m1":"price_...", ... }（18個すべて）。ID は公開されても問題ない識別子で、秘密ではない。
 */
export const TERMS = ['m1', 'm3', 'm12'] as const;
export type Term = (typeof TERMS)[number];
export const TERM_MONTHS: Record<Term, number> = { m1: 1, m3: 3, m12: 12 };
export const isTerm = (v: unknown): v is Term => (TERMS as readonly string[]).includes(v as string);
export const isPaidPlan = (v: unknown): v is PaidPlan => v === 'pro' || v === 'team';

export type PriceKey = `${PaidPlan}:${Currency}:${Term}`;
export const priceKey = (plan: PaidPlan, currency: Currency, term: Term): PriceKey => `${plan}:${currency}:${term}`;

export const TEST_PRICE_IDS: Record<PriceKey, string> = {
  'pro:USD:m1': 'price_1US6ynAFqRqvdeOX9bEUnL22',
  'pro:USD:m3': 'price_1US6ynAFqRqvdeOXuPcCx1On',
  'pro:USD:m12': 'price_1US6ynAFqRqvdeOXmAD4O5Lj',
  'pro:EUR:m1': 'price_1US6ynAFqRqvdeOXM7nDYVPQ',
  'pro:EUR:m3': 'price_1US6ynAFqRqvdeOXlaexp0zb',
  'pro:EUR:m12': 'price_1US6ynAFqRqvdeOXafHY5kxD',
  'pro:JPY:m1': 'price_1US6ynAFqRqvdeOXs0EKij5t',
  'pro:JPY:m3': 'price_1US6ynAFqRqvdeOXQP6gWVe9',
  'pro:JPY:m12': 'price_1US6ynAFqRqvdeOX7zJOg2I2',
  'team:USD:m1': 'price_1US6zwAFqRqvdeOXEAh37EVn',
  'team:USD:m3': 'price_1US6zwAFqRqvdeOXT7CmKV2e',
  'team:USD:m12': 'price_1US6zwAFqRqvdeOXTNUU7yee',
  'team:EUR:m1': 'price_1US6zwAFqRqvdeOXNxiviiOg',
  'team:EUR:m3': 'price_1US6zwAFqRqvdeOX5mhX0YuI',
  'team:EUR:m12': 'price_1US6zwAFqRqvdeOXU8O3WBj4',
  'team:JPY:m1': 'price_1US6zwAFqRqvdeOXPLGRy6zx',
  'team:JPY:m3': 'price_1US6zwAFqRqvdeOXAeJCJCAH',
  'team:JPY:m12': 'price_1US6zwAFqRqvdeOXdUYm1my7',
};

type Env = Record<string, string | undefined>;

/** 使う Price ID の表。STRIPE_PRICE_IDS_JSON が正しければそれ（18個すべて必要）、無ければテスト用 */
export function priceTable(env: Env = process.env): Record<PriceKey, string> {
  const raw = env.STRIPE_PRICE_IDS_JSON;
  if (!raw) return TEST_PRICE_IDS;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out = {} as Record<PriceKey, string>;
    for (const plan of ['pro', 'team'] as const) for (const c of CURRENCIES) for (const t of TERMS) {
      const k = priceKey(plan, c, t); const v = o[k];
      if (typeof v !== 'string' || !/^price_[A-Za-z0-9]+$/.test(v)) return TEST_PRICE_IDS;
      out[k] = v;
    }
    return out;
  } catch { return TEST_PRICE_IDS; }
}

export const usingCustomPrices = (env: Env = process.env): boolean => priceTable(env) !== TEST_PRICE_IDS;

export const priceIdOf = (plan: PaidPlan, currency: Currency, term: Term, env: Env = process.env): string => priceTable(env)[priceKey(plan, currency, term)];

/** Webhook で届いた Price ID から、どのプラン・通貨・期間かを引く */
export function describePriceId(id: string | null | undefined, env: Env = process.env): { plan: PaidPlan; currency: Currency; term: Term } | null {
  if (!id) return null;
  for (const [k, v] of Object.entries(priceTable(env))) {
    if (v === id) { const [plan, currency, term] = k.split(':'); return { plan: plan as PaidPlan, currency: currency as Currency, term: term as Term }; }
  }
  return null;
}

/** その期間に一度に支払う額（表示用。Stripe 側の金額と pricing.test.ts で一致を確かめる） */
export function termTotal(plan: PaidPlan, currency: Currency, term: Term): number {
  const p = PRICES[currency][plan];
  const n = TERM_MONTHS[term];
  const raw = term === 'm1' ? p.monthly : p.term * n;
  return Math.round(raw * 100) / 100;
}
