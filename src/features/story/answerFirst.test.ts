import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: 'C案への投資を承認するか', desiredYes: 'SELECTION', primaryBarrier: '結論を支える根拠を短く示す必要がある',
  proofNeeds: ['OVERALL_CHANGE', 'CONTRIBUTION', 'TARGET_GAP'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['ANSWER_READY'], outcomeDirection: 'POSITIVE', explicitSize: null, confidence: 0.94,
  personalizations: [{
    target: 'DECISION', explanation: 'C案を推す前提で整理します。', confidence: 'confirmed', requiredDataHints: ['承認対象'],
  }],
  ...over,
});

const active = <T extends { questionPriority: string }>(map: T[]) => map.filter((slide) => slide.questionPriority !== 'COACHING_ONLY');

describe('Answer First Route', () => {
  it('SELECTIONは結論→根拠→裏づけ→依頼で止まり、リスクへ広げない', () => {
    const map = active(routeQuestionMap(R(), 'ja', 'ANSWER_FIRST'));
    expect(map.map((slide) => [slide.routeRole, slide.proofNeeds])).toEqual([
      ['ANSWER_FIRST.ANSWER', []],
      ['ANSWER_FIRST.REASONS', ['OVERALL_CHANGE']],
      ['ANSWER_FIRST.EVIDENCE', ['CONTRIBUTION']],
      ['ANSWER_FIRST.ASK', []],
    ]);
    expect(map.some((slide) => slide.routeRole === 'ANSWER_FIRST.RISKS')).toBe(false);
  });

  it('Coachは結論と依頼を代筆せず、判断向けの具体化も流用しない', () => {
    const map = routeQuestionMap(R(), 'ja', 'ANSWER_FIRST');
    for (const role of ['ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.ASK']) {
      expect(map.find((slide) => slide.routeRole === role)).toMatchObject({
        presentationMode: 'TEXT', userAuthoredMessage: '', textContent: null, personalization: undefined,
      });
    }
  });

  it('証明要求が無くても、結論・根拠・裏づけ・依頼を空欄のまま置く', () => {
    const map = routeQuestionMap(R({ proofNeeds: [] }), 'en', 'ANSWER_FIRST');
    expect(map.map((slide) => slide.question)).toEqual([
      'What answer do you propose?',
      'What reasons support the answer?',
      'What evidence supports the reasons?',
      'What do you want the audience to decide?',
    ]);
    expect(map.flatMap((slide) => slide.referenceRecipes)).toEqual([]);
  });

  it('COMMITMENTではリスクを依頼の前に置く', () => {
    const map = routeQuestionMap(R({ desiredYes: 'COMMITMENT' }), 'ja', 'ANSWER_FIRST');
    expect(map.map((slide) => slide.routeRole)).toEqual([
      'ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE', 'ANSWER_FIRST.RISKS', 'ANSWER_FIRST.ASK',
    ]);
    expect(map[3]).toMatchObject({ proofNeeds: ['TARGET_GAP'], question: '判断前に確認すべき反対材料や条件は何か' });
  });

  it('Story作成・保存の往復でAnswer Firstと役割を維持する', () => {
    const story = storyFromReading('結論はC案。根拠を示して承認を得たい', R(), 'ja');
    expect(story.primaryRoute).toBe('ANSWER_FIRST');
    expect(active(story.slides).slice(0, 4).map((slide) => slide.routeRole)).toEqual([
      'ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE', 'ANSWER_FIRST.ASK',
    ]);
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });
});
