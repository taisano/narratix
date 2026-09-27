/**
 * プランと AI 機能の使える回数（下準備。課金はまだない）。
 * 判定は必ずサーバー側で行う（画面側の判定はボタンの出し分けだけ）。
 * 回数・プラン名は仮。決まったらここだけ直す。docs/ai-foundation.md 参照。
 */

export const PLAN_IDS = ['free', 'pro', 'team'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const AI_FEATURE_IDS = ['ai_consult', 'ai_headline'] as const;
export type AiFeatureId = (typeof AI_FEATURE_IDS)[number];

export const AI_FEATURES: Record<AiFeatureId, { label: { ja: string; en: string }; description: { ja: string; en: string } }> = {
  ai_consult: {
    label: { ja: 'AI に相談', en: 'Ask AI' },
    description: { ja: '伝えたいことから、チャートの切り口を提案します', en: 'Suggests chart approaches from what you want to say' },
  },
  ai_headline: {
    label: { ja: 'ヘッダーの提案・修正', en: 'Headline suggestions' },
    description: { ja: 'チャートの数字から、スライドのメッセージ案を作り、書いた文を直します', en: 'Drafts and refines the slide message from the chart’s numbers' },
  },
};

/** 月あたりの回数。0＝使えない。null＝上限なし（使いすぎ防止の上限は別に FAIR_USE で持つ） */
export const PLAN_LIMITS: Record<PlanId, Record<AiFeatureId, number | null>> = {
  free: { ai_consult: 10, ai_headline: 0 },
  pro: { ai_consult: 300, ai_headline: 200 },
  team: { ai_consult: null, ai_headline: null },
};

/** 上限なしのプランでも、1人・1日あたりこれを超えたら止める（誤作動や不正利用の歯止め） */
export const FAIR_USE_PER_DAY: Record<AiFeatureId, number> = { ai_consult: 200, ai_headline: 200 };

export type Allowance =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: 'not_in_plan' | 'monthly_limit' | 'daily_limit'; remaining: 0 };

export function checkAllowance(plan: PlanId, feature: AiFeatureId, used: { month: number; day: number }): Allowance {
  const limit = PLAN_LIMITS[plan][feature];
  if (limit === 0) return { allowed: false, reason: 'not_in_plan', remaining: 0 };
  if (used.day >= FAIR_USE_PER_DAY[feature]) return { allowed: false, reason: 'daily_limit', remaining: 0 };
  if (limit != null && used.month >= limit) return { allowed: false, reason: 'monthly_limit', remaining: 0 };
  return { allowed: true, remaining: limit == null ? null : limit - used.month };
}

/** プランが分からない（未ログイン・未設定）時は free として扱う */
export const planOf = (v: unknown): PlanId => ((PLAN_IDS as readonly string[]).includes(v as string) ? (v as PlanId) : 'free');

// ──────────── プランごとの機能（AI 以外）。docs/decisions.md「配色のテーマ」 ────────────

/** 画面に出すプランの呼び名。ID は変えない（free＝基本、pro＝Plus、team＝Pro） */
export const PLAN_NAMES: Record<PlanId, { ja: string; en: string }> = {
  free: { ja: '基本', en: 'Basic' },
  pro: { ja: 'Plus', en: 'Plus' },
  team: { ja: 'Pro', en: 'Pro' },
};

/**
 * ベータの間は Plus の機能を基本（free）にも開ける。ベータが終わったら false にするだけで、
 * Plus（pro）と Pro（team）だけが使えるようになる（プランの読み方は quota.ts と同じ user_plans）。
 */
export const BETA_OPEN_PLUS = true;

/** 配色のテーマ（Quiet Steel Blue など）と強調の色を選べるか。Plus 以上。ベータ中は全員 */
export function canUseColorThemes(plan: PlanId): boolean {
  return BETA_OPEN_PLUS || plan === 'pro' || plan === 'team';
}
