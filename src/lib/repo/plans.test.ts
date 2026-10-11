import { describe, expect, it } from 'vitest';
import { parseMakeUsage, planLimitKind } from './plans';
import { storyAllowedFor } from '@/lib/ai/plans';

describe('無料枠の読み取り', () => {
  it('サーバーの返事を読む。無制限は null、使えないは 0', () => {
    expect(parseMakeUsage({ plan: 'free', slide: { used: 3, limit: 15 }, story: { used: 0, limit: 0 }, export: { used: 4, limit: 30 } }))
      .toEqual({ plan: 'free', slide: { used: 3, limit: 15 }, story: { used: 0, limit: 0 }, export: { used: 4, limit: 30 } });
    expect(parseMakeUsage({ plan: 'pro', slide: { used: 1, limit: null }, story: { used: 0, limit: 0 } })?.story.limit).toBe(0);
    expect(parseMakeUsage(null)).toBeNull();
    expect(parseMakeUsage({ plan: '??' })?.plan).toBe('free');
  });
  it('エラー文から上限の種類を取り出す', () => {
    expect(planLimitKind('plan_limit:slide')).toBe('slide');
    expect(planLimitKind('error: plan_limit:daily')).toBe('daily');
    expect(planLimitKind('save failed')).toBeNull();
    expect(planLimitKind(undefined)).toBeNull();
  });
  it('Story と Coach が使えるか：Pro だけ。基本・Plus は使えない。読めない時はベータの設定', () => {
    const u = (plan: 'free' | 'pro' | 'team', used: number, limit: number | null) => ({ plan, slide: { used: 0, limit: null }, story: { used, limit } });
    expect(storyAllowedFor(u('team', 99, null))).toBe(true);
    expect(storyAllowedFor(u('free', 0, 0))).toBe(false);
    expect(storyAllowedFor(u('pro', 0, 0))).toBe(false);
    expect(storyAllowedFor(null)).toBe(true);
  });
});
