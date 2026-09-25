import { describe, expect, it } from 'vitest';
import { COALESCE_MS, HISTORY_LIMIT, initHistory, pushHistory, redo, undo } from './history';

describe('元に戻す・やり直す', () => {
  it('戻して、やり直せる。新しい変更でやり直しは消える', () => {
    let h = initHistory(1);
    h = pushHistory(h, 2, 1000);
    h = pushHistory(h, 3, 5000);
    h = undo(h); expect(h.present).toBe(2);
    h = undo(h); expect(h.present).toBe(1);
    h = undo(h); expect(h.present).toBe(1);
    h = redo(h); expect(h.present).toBe(2);
    h = pushHistory(h, 9, 9000);
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe(9);
  });

  it('続けて打った変更は1手にまとめる', () => {
    let h = initHistory('');
    h = pushHistory(h, '1', 1000);
    h = pushHistory(h, '12', 1000 + COALESCE_MS - 1);
    h = pushHistory(h, '123', 1000 + 2 * COALESCE_MS - 2);
    expect(undo(h).present).toBe('');
  });

  it('表示の切り替えだけは数えない。30手まで', () => {
    type S = { v: number; current: number };
    const same = (a: S, b: S) => a.v === b.v;
    let h = initHistory<S>({ v: 0, current: 0 });
    h = pushHistory(h, { v: 0, current: 2 }, 1000, same);
    expect(h.past).toEqual([]);
    for (let i = 1; i <= 40; i++) h = pushHistory(h, { v: i, current: 0 }, i * 10_000, same);
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });
});
