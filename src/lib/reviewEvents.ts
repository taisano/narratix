/** レビューの依頼・入力画面を開く合図（画面のどこからでも。受け取るのは AppShell の ReviewHost） */
const ASK = 'nx:review-ask';
const OPEN = 'nx:review-open';
const SNOOZE_KEY = 'slide-story-coach:review-snooze';
const SNOOZE_DAYS = 30;

const send = (name: string, rating?: number) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail: { rating } })); };
/** 出力・保存が成功した直後に呼ぶ。聞いてよい人にだけ、小さなカードが出る */
export const askForReview = () => send(ASK);
/** 設定メニューなどから、入力画面をそのまま開く */
export const openReview = (rating?: number) => send(OPEN, rating);
export const REVIEW_EVENTS = { ASK, OPEN } as const;

export function snoozed(now = Date.now()): boolean {
  try { const v = Number(localStorage.getItem(SNOOZE_KEY)); return !!v && now - v < SNOOZE_DAYS * 86_400_000; } catch { return false; }
}
export function snooze(now = Date.now()): void { try { localStorage.setItem(SNOOZE_KEY, String(now)); } catch { /* 保存できなくても続ける */ } }
