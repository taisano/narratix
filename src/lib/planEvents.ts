/** プランの案内（比較カード）を開く合図。画面のどこからでも。受け取るのは AppShell の PlanHost */
const OPEN = 'nx:plans-open';
const USAGE = 'nx:usage-changed';

/** なぜ開いたか：slide／story＝無料枠を使い切った、daily＝1日の上限、locked＝使えない機能を押した、menu＝設定メニュー */
export type PlanReason = 'slide' | 'story' | 'daily' | 'locked' | 'menu';

export const openPlans = (reason: PlanReason): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN, { detail: { reason } }));
};
/** 回数が変わったかもしれない時（保存・書き出しの後）に、残り回数の表示を読み直させる */
export const usageChanged = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USAGE));
};
export const PLAN_EVENTS = { OPEN, USAGE } as const;

/** 関心を記録する時の「どこから」（DB の plan_interest.source） */
export type InterestSource = 'limit_slide' | 'limit_story' | 'menu' | 'pricing';
export const interestSourceOf = (reason: PlanReason | 'pricing'): InterestSource =>
  reason === 'pricing' ? 'pricing' : reason === 'menu' ? 'menu' : reason === 'story' || reason === 'locked' ? 'limit_story' : 'limit_slide';
