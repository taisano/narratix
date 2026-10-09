import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '新施策が継続率を改善したと言えるか', desiredYes: 'INTERPRETATION', primaryBarrier: null,
  proofNeeds: ['RELATIONSHIP', 'OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['VALIDATION'], outcomeDirection: 'POSITIVE', explicitSize: null, confidence: 0.9, ...over,
});

describe('Proof Route', () => {
  it('INTERPRETATIONは主張→検証方法→支持材料→成立範囲で止まる', () => {
    const map = routeQuestionMap(R(), 'ja', 'PROOF');
    expect(map.map((slide) => slide.routeRole)).toEqual(['PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.BOUNDARY']);
    expect(map.some((slide) => slide.routeRole === 'PROOF.COUNTER_EVIDENCE')).toBe(false);
  });

  it('主張はユーザー入力で、関連を原因として自動確定しない', () => {
    const map = routeQuestionMap(R(), 'ja', 'PROOF');
    expect(map[0]).toMatchObject({ presentationMode: 'TEXT', userAuthoredMessage: '', textContent: null });
    expect(map[1]!.question).toBe('2つの指標は連動しているか');
    expect(map.every((slide) => !slide.userAuthoredMessage)).toBe(true);
  });

  it('FEASIBILITYでは反対材料・次の検証・ユーザーが決める展開条件まで置く', () => {
    const map = routeQuestionMap(R({ desiredYes: 'FEASIBILITY' }), 'ja', 'PROOF');
    expect(map.map((slide) => slide.routeRole)).toEqual([
      'PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.COUNTER_EVIDENCE', 'PROOF.BOUNDARY', 'PROOF.EXPERIMENT', 'PROOF.SCALE_DECISION',
    ]);
    expect(map.at(-1)).toMatchObject({ presentationMode: 'TEXT', userAuthoredMessage: '' });
  });

  it('Story作成・保存の往復でProofと役割を維持する', () => {
    const story = storyFromReading('新施策の効果という主張を検証したい', R(), 'ja');
    expect(story.primaryRoute).toBe('PROOF');
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });
});
