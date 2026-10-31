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

/**
 * 数える期間。基本（free）の AI 相談だけ「累計」（登録してからの合計）。ほかは月ごと。
 * 回数は PLAN_LIMITS（基本は累計5回、Plus は月100回、Pro は月300回）
 */
export const AI_CONSULT_TOTAL_PLANS: readonly PlanId[] = ['free'];

/** 月あたりの回数（基本の AI 相談だけ累計）。0＝使えない。null＝上限なし（使いすぎ防止の上限は別に FAIR_USE で持つ） */
export const PLAN_LIMITS: Record<PlanId, Record<AiFeatureId, number | null>> = {
  free: { ai_consult: 5, ai_headline: 0 },
  pro: { ai_consult: 100, ai_headline: 200 },
  team: { ai_consult: 300, ai_headline: null },
};

/** 上限なしのプランでも、1人・1日あたりこれを超えたら止める（誤作動や不正利用の歯止め） */
export const FAIR_USE_PER_DAY: Record<AiFeatureId, number> = { ai_consult: 200, ai_headline: 200 };

export type Allowance =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: 'not_in_plan' | 'monthly_limit' | 'daily_limit'; remaining: 0 };

export function checkAllowance(plan: PlanId, feature: AiFeatureId, used: { month: number; day: number; total?: number }): Allowance {
  const limit = PLAN_LIMITS[plan][feature];
  const spent = feature === 'ai_consult' && AI_CONSULT_TOTAL_PLANS.includes(plan) ? (used.total ?? used.month) : used.month;
  if (limit === 0) return { allowed: false, reason: 'not_in_plan', remaining: 0 };
  if (used.day >= FAIR_USE_PER_DAY[feature]) return { allowed: false, reason: 'daily_limit', remaining: 0 };
  if (limit != null && spent >= limit) return { allowed: false, reason: 'monthly_limit', remaining: 0 };
  return { allowed: true, remaining: limit == null ? null : limit - spent };
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

/**
 * Story（複数の Question からなる説明）を作れるか。Pro（team）の機能。docs/story-spec.md 4.4。
 * ベータの間は全員に開ける。ベータが終わったら false にするだけで、Pro だけが使えるようになる
 */
export const BETA_OPEN_STORY = true;

/** スライドセット（複数のチャート・テンプレートから1つの資料にまとめる）を使えるか。Plus（pro）以上。基本（free）は使えない */
export const canUseSlideSet = (plan: PlanId): boolean => plan === 'pro' || plan === 'team';
/**
 * Story（複数枚）と「コーチにおまかせ」を、画面に出すか。false の間は、入口・案内・料金表の行・マイページのタブをすべて隠す
 * （コードとデータは残す。戻す時は true にするだけ。git タグ story-v1 が、隠す前の状態）。
 * 価格を Plus 1本にする間（2026-10-31〜）は false。戻す時は、環境変数 NEXT_PUBLIC_STORY_COACH=1 を入れて再デプロイするだけ
 */
export const STORY_COACH_ENABLED = process.env.NEXT_PUBLIC_STORY_COACH === '1';
export function canUseStory(plan: PlanId): boolean {
  return STORY_COACH_ENABLED && (BETA_OPEN_STORY || plan === 'team');
}

/**
 * Story と「コーチにお任せ」を、今使えるか。docs/pricing-plan.md
 * Pro（team）は常に。基本（free）は無料枠（Story 3回）が残っている間。Plus（pro）は使えない（limit 0）。
 * 回数が読めない時（未ログイン・通信の失敗）はベータの設定（BETA_OPEN_STORY）に従う。
 */
export function storyAllowedFor(usage: { plan: PlanId; story: { used: number; limit: number | null } } | null | undefined): boolean {
  if (!STORY_COACH_ENABLED) return false;
  if (!usage) return canUseStory('free');
  if (usage.plan === 'team') return true;
  const { used, limit } = usage.story;
  return limit == null || used < limit;
}
