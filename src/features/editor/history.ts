/**
 * 元に戻す・やり直すの履歴（プロジェクト全体の状態を丸ごと持つ）。
 * - 30手前まで戻れる。
 * - 続けて打った変更（数字の入力など、前の変更から 700ms 以内）は1手にまとめる。
 * - 見ているスライドを替えただけ（current だけの変化）は1手に数えない。
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** 最後に手を記録した時刻（まとめる判断に使う） */
  lastAt: number;
}

export const HISTORY_LIMIT = 30;
export const COALESCE_MS = 700;

export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], lastAt: 0 });

export function pushHistory<T>(h: History<T>, next: T, now: number, sameStep: (a: T, b: T) => boolean = () => false): History<T> {
  if (next === h.present) return h;
  // 表示の切り替えだけ：履歴は増やさず、今の状態だけ差し替える
  if (sameStep(h.present, next)) return { ...h, present: next };
  if (h.past.length && now - h.lastAt < COALESCE_MS) return { ...h, present: next, future: [], lastAt: now };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], lastAt: now };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastAt: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: h.future.slice(1), lastAt: 0 };
}
