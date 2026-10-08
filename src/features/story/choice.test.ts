import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '次にどの市場へ投資するか', desiredYes: 'SELECTION', primaryBarrier: '規模と成長性で順位が異なる',
  proofNeeds: ['SECOND_METRIC', 'RANKING', 'POSITIONING'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['PRIORITIZATION'], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.91,
  personalizations: [{
    target: 'DECISION', explanation: '市場を一つ選びます。', confidence: 'proposed', requiredDataHints: ['候補市場'],
  }],
  ...over,
});

describe('Choice Route', () => {
  it('SELECTIONは判断基準→選択肢→得失→推奨案で止まる', () => {
    const map = routeQuestionMap(R(), 'ja', 'CHOICE');
    expect(map.map((slide) => [slide.routeRole, slide.proofNeeds])).toEqual([
      ['CHOICE.CRITERIA', ['SECOND_METRIC']],
      ['CHOICE.OPTIONS', ['RANKING']],
      ['CHOICE.TRADE_OFFS', ['POSITIONING']],
      ['CHOICE.RECOMMENDATION', []],
    ]);
    expect(map.at(-1)).toMatchObject({
      question: 'どの案を選ぶか', presentationMode: 'TEXT', userAuthoredMessage: '', textContent: null,
    });
  });

  it('Coachは推奨案を代筆せず、判断向けの具体化も流用しない', () => {
    const recommendation = routeQuestionMap(R(), 'ja', 'CHOICE').at(-1)!;
    expect(recommendation.personalization).toBeUndefined();
    expect(recommendation.userAuthoredMessage).toBe('');
    expect(recommendation.textContent).toBeNull();
  });

  it('証明要求が無くても、選択に必要な問いを空欄のまま置く', () => {
    const map = routeQuestionMap(R({ proofNeeds: [] }), 'en', 'CHOICE');
    expect(map.map((slide) => slide.question)).toEqual([
      'What criteria should be used?',
      'What options are being compared?',
      'What are the trade-offs of each option?',
      'Which option do you recommend?',
    ]);
    expect(map.flatMap((slide) => slide.referenceRecipes)).toEqual([]);
  });

  it('FEASIBILITYは成立条件まで、COMMITMENTだけ最終決定を置く', () => {
    const feasible = routeQuestionMap(R({ desiredYes: 'FEASIBILITY' }), 'ja', 'CHOICE');
    expect(feasible.map((slide) => slide.routeRole)).toEqual([
      'CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION', 'CHOICE.CONDITIONS',
    ]);
    const commitment = routeQuestionMap(R({ desiredYes: 'COMMITMENT' }), 'ja', 'CHOICE');
    expect(commitment.at(-1)).toMatchObject({
      routeRole: 'CHOICE.COMMITMENT', question: '何をいつ決めるか', presentationMode: 'TEXT', userAuthoredMessage: '',
    });
  });

  it('Story作成・保存の往復でChoiceと役割を維持する', () => {
    const story = storyFromReading('次に投資する市場を比較して選びたい', R(), 'ja');
    expect(story.primaryRoute).toBe('CHOICE');
    expect(story.slides.slice(0, 4).map((slide) => slide.routeRole)).toEqual([
      'CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION',
    ]);
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });
});
