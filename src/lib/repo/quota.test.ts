import { describe, expect, it } from 'vitest';
import { monthStartUtc, quotaOf } from './quota';

describe('AI 相談の残り回数', () => {
  it('上限から使った回数を引く。下限は 0。上限なしは null', () => {
    expect(quotaOf(3, 10)).toEqual({ used: 3, limit: 10, remaining: 7 });
    expect(quotaOf(12, 10).remaining).toBe(0);
    expect(quotaOf(50, null).remaining).toBeNull();
  });
  it('月の初めは UTC（サーバーの数え方と同じ）', () => {
    expect(monthStartUtc(new Date('2026-09-30T23:30:00+09:00'))).toBe('2026-09-01T00:00:00.000Z');
    expect(monthStartUtc(new Date('2026-10-01T08:00:00+09:00'))).toBe('2026-09-01T00:00:00.000Z');
  });
});
