import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '今すぐ対応を始めるべきか', desiredYes: 'RECOGNITION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'GROWTH_SPEED', 'SIZE_CONTEXT', 'TARGET_GAP'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['URGENCY'], outcomeDirection: 'NEGATIVE', explicitSize: null, confidence: 0.9, ...over,
});

describe('Urgency Route', () => {
  it('RECOGNITIONは現状→変化点→影響範囲で止まる', () => {
    const map = routeQuestionMap(R(), 'ja', 'URGENCY');
    expect(map.map((slide) => slide.routeRole)).toEqual(['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.EXPOSURE']);
    expect(map.some((slide) => slide.routeRole === 'URGENCY.COST_OF_DELAY')).toBe(false);
  });

  it('期限や放置影響の値を推測せず、データが無い問いは空のQuestionとして置く', () => {
    const map = routeQuestionMap(R({ desiredYes: 'COMMITMENT', proofNeeds: ['OVERALL_CHANGE'] }), 'ja', 'URGENCY');
    expect(map.find((slide) => slide.routeRole === 'URGENCY.EXPOSURE')).toMatchObject({ proofNeeds: [], question: '放置するとどこまで影響するか' });
    expect(map.find((slide) => slide.routeRole === 'URGENCY.WINDOW')).toMatchObject({ proofNeeds: [], question: 'いつまでに動く必要があるか', presentationMode: 'TEXT' });
  });

  it('COMMITMENTでは遅れる影響・動ける期間・ユーザーが書く最初の対応まで置く', () => {
    const map = routeQuestionMap(R({ desiredYes: 'COMMITMENT' }), 'ja', 'URGENCY');
    expect(map.map((slide) => slide.routeRole)).toEqual([
      'URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.EXPOSURE', 'URGENCY.COST_OF_DELAY', 'URGENCY.WINDOW', 'URGENCY.NO_REGRET_MOVE',
    ]);
    expect(map.at(-1)).toMatchObject({ presentationMode: 'TEXT', userAuthoredMessage: '', textContent: null });
  });

  it('Story作成・保存の往復でUrgencyと役割を維持する', () => {
    const story = storyFromReading('悪化が加速している。今動く必要を説明したい', R(), 'ja');
    expect(story.primaryRoute).toBe('URGENCY');
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });
});
