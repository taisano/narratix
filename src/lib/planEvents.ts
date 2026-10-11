/** プランの案内（比較カード）を開く合図。画面のどこからでも。受け取るのは AppShell の PlanHost */
const OPEN = 'nx:plans-open';
const USAGE = 'nx:usage-changed';

/** なぜ開いたか：slide＝今月の作成数を使い切った、export＝今月の出力を使い切った、consult＝AI 相談を使い切った、daily＝1日の上限、locked＝使えない機能（Story など）を押した、menu＝設定メニュー */
export type PlanReason = 'slide' | 'export' | 'consult' | 'daily' | 'locked' | 'menu';

export const openPlans = (reason: PlanReason): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN, { detail: { reason } }));
};
/** 回数が変わったかもしれない時（保存・書き出しの後）に、残り回数の表示を読み直させる */
export const usageChanged = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USAGE));
};
export const PLAN_EVENTS = { OPEN, USAGE } as const;

/** 関心を記録する時の「どこから」（DB の plan_interest.source） */
export type InterestSource = 'limit_slide' | 'limit_story' | 'limit_export' | 'limit_consult' | 'menu' | 'pricing';
export const interestSourceOf = (reason: PlanReason | 'pricing'): InterestSource =>
  reason === 'pricing' ? 'pricing' : reason === 'menu' ? 'menu' : reason === 'locked' ? 'limit_story' : reason === 'export' ? 'limit_export' : reason === 'consult' ? 'limit_consult' : 'limit_slide';
