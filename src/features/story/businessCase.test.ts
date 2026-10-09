import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: 'この事業へ投資すべきか', desiredYes: 'FEASIBILITY', primaryBarrier: null,
  proofNeeds: ['SIZE_CONTEXT', 'GROWTH_SPEED', 'BRIDGE', 'SECOND_METRIC'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['INVESTMENT'], outcomeDirection: 'POSITIVE', explicitSize: null, confidence: 0.9, ...over,
});

describe('Business Case Route', () => {
  it('FEASIBILITYは機会・価値の規模・採算・前提で止まる', () => {
    const map = routeQuestionMap(R(), 'ja', 'BUSINESS_CASE');
    expect([...new Set(map.map((slide) => slide.routeRole))]).toEqual([
      'BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL', 'BUSINESS_CASE.ECONOMICS', 'BUSINESS_CASE.ASSUMPTIONS',
    ]);
    expect(map.some((slide) => slide.routeRole === 'BUSINESS_CASE.ASK')).toBe(false);
  });

  it('根拠が無い採算・シナリオ・リスクの数値を作らない', () => {
    const map = routeQuestionMap(R({ proofNeeds: [] }), 'ja', 'BUSINESS_CASE');
    expect(map.map((slide) => slide.proofNeeds)).toEqual([[], [], [], []]);
    expect(map.map((slide) => slide.referenceRecipes)).toEqual([[], [], [], []]);
    expect(map[2]).toMatchObject({ question: '費用・便益・回収はどう見込むか', presentationMode: 'GRAPH' });
  });

  it('COMMITMENTでは全役割を置き、段階判断と投資依頼はユーザー入力にする', () => {
    const map = routeQuestionMap(R({ desiredYes: 'COMMITMENT', proofNeeds: [] }), 'ja', 'BUSINESS_CASE');
    expect(map.map((slide) => slide.routeRole)).toEqual([
      'BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL', 'BUSINESS_CASE.ECONOMICS', 'BUSINESS_CASE.ASSUMPTIONS',
      'BUSINESS_CASE.SCENARIOS', 'BUSINESS_CASE.RISKS', 'BUSINESS_CASE.STAGE_GATES', 'BUSINESS_CASE.ASK',
    ]);
    expect(map.slice(-2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ routeRole: 'BUSINESS_CASE.STAGE_GATES', presentationMode: 'TEXT', userAuthoredMessage: '' }),
      expect.objectContaining({ routeRole: 'BUSINESS_CASE.ASK', presentationMode: 'TEXT', userAuthoredMessage: '' }),
    ]));
  });

  it('Story作成・保存の往復でBusiness Caseと役割を維持する', () => {
    const story = storyFromReading('新事業への投資判断をしたい', R(), 'ja');
    expect(story.primaryRoute).toBe('BUSINESS_CASE');
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });
});
