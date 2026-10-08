import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '売上減少の要因は何か', desiredYes: 'INTERPRETATION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'CONTRIBUTION'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['ROOT_CAUSE'], outcomeDirection: 'NEGATIVE', explicitSize: null, confidence: 0.9, ...over,
});

describe('Diagnosis Route', () => {
  it('RECOGNITIONはOutcome＋Locationで止まり、Driverや原因へ広げない', () => {
    const map = routeQuestionMap(R({ desiredYes: 'RECOGNITION' }), 'ja', 'DIAGNOSIS');
    expect(map.map((slide) => slide.routeRole)).toEqual(['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION']);
    expect(map.flatMap((slide) => slide.proofNeeds)).not.toContain('CONTRIBUTION');
    expect(map.some((slide) => slide.routeRole === 'DIAGNOSIS.ROOT_CAUSE')).toBe(false);
  });

  it('INTERPRETATIONはOutcome＋Location＋Driver。寄与を原因とは呼ばない', () => {
    const map = routeQuestionMap(R(), 'ja', 'DIAGNOSIS');
    expect(map.map((slide) => [slide.routeRole, slide.proofNeeds])).toEqual([
      ['DIAGNOSIS.SYMPTOM', ['OVERALL_CHANGE']],
      ['DIAGNOSIS.LOCATION', ['SEGMENT_DIFFERENCE']],
      ['DIAGNOSIS.DRIVER', ['CONTRIBUTION']],
    ]);
    expect(map[2]!.question).toBe('どの項目が全体の減少に寄与したか');
    expect(map[2]!.question).not.toContain('原因');
    expect(map[2]!.referenceRecipes).toContain('CONTRIB_DRIVERS');
  });

  it('Driverのデータが無い時は、寄与・関連を確かめる問いだけを置く', () => {
    const map = routeQuestionMap(R({ proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'] }), 'ja', 'DIAGNOSIS');
    expect(map[2]).toMatchObject({ routeRole: 'DIAGNOSIS.DRIVER', proofNeeds: [], question: '何が増減へ寄与し、何と関連しているか' });
  });

  it('FEASIBILITYは動かせる点まで、COMMITMENTだけ次の対応を置く', () => {
    const feasible = routeQuestionMap(R({ desiredYes: 'FEASIBILITY' }), 'ja', 'DIAGNOSIS');
    expect(feasible.map((slide) => slide.routeRole)).toEqual(['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION', 'DIAGNOSIS.DRIVER', 'DIAGNOSIS.ACTIONABILITY']);
    const commitment = routeQuestionMap(R({ desiredYes: 'COMMITMENT' }), 'ja', 'DIAGNOSIS');
    expect(commitment.at(-1)).toMatchObject({ routeRole: 'DIAGNOSIS.ACTION', presentationMode: 'TEXT', userAuthoredMessage: '', textContent: null });
  });

  it('Story作成・保存の往復でDiagnosisと役割を維持する', () => {
    const story = storyFromReading('売上減少の要因を特定したい', R(), 'ja');
    expect(story.primaryRoute).toBe('DIAGNOSIS');
    expect(story.outcomeDirection).toBe('NEGATIVE');
    expect(story.slides.slice(0, 3).map((slide) => slide.routeRole)).toEqual(['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION', 'DIAGNOSIS.DRIVER']);
    expect(story.slides.every((slide) => slide.userAuthoredMessage === '')).toBe(true);
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });

  it('結果の向きに合わせて寄与の問いを変え、増減混在にはプラス・マイナスを提案する', () => {
    const positive = routeQuestionMap(R({ outcomeDirection: 'POSITIVE' }), 'en', 'DIAGNOSIS')[2]!;
    expect(positive.question).toBe('Which parts contributed to the increase?');
    const mixed = routeQuestionMap(R({ outcomeDirection: 'MIXED' }), 'ja', 'DIAGNOSIS')[2]!;
    expect(mixed.question).toBe('どの項目が全体の増減に寄与したか');
    expect(mixed.referenceRecipes[0]).toBe('CONTRIB_POSNEG');
  });
});
