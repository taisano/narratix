import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, type StoryReading } from '@/registry';
import { planFromConsultation, type Plan } from '../start/plan';
import { scopeBlocksOneSlide, scopeOf } from './ScopeCard';

const story: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'],
  scopeCandidate: 'STORY_FLOW', routeSignals: ['PRIORITIZATION'], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};
const plan = (s: StoryReading | null): Plan => planFromConsultation({
  text: '相談', summary: '', question: '', classifier: 'ai', story: s,
  classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }),
});

describe('② の一番上：1枚か Story か', () => {
  it('Story のおすすめの間は、1枚の提案を出さない。「まず1枚に絞る」で1枚の提案に戻る', () => {
    const p = plan(story);
    expect(scopeOf(p).scope).toBe('STORY_FLOW');
    expect(scopeBlocksOneSlide(p)).toBe(true);
    const one = { ...p, scopeChoice: 'one' as const };
    expect(scopeOf(one)).toMatchObject({ scope: 'ONE_SLIDE_STORY', chosen: true });
    expect(scopeBlocksOneSlide(one)).toBe(false);
  });
  it('1枚のおすすめから「Story として組み立てる」を選べる。AI の読み取りが無ければ（ルール版）これまでどおり', () => {
    const p = plan({ ...story, desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE'], routeSignals: [] });
    expect(scopeOf(p).scope).toBe('ONE_SLIDE_STORY');
    expect(scopeOf({ ...p, scopeChoice: 'story' }).scope).toBe('STORY_FLOW');
    const rules = plan(null);
    expect(scopeOf(rules).scope).toBe('ONE_SLIDE_STORY');
    expect(scopeOf({ ...rules, scopeChoice: 'story' }).scope).toBe('ONE_SLIDE_STORY');
  });
});
