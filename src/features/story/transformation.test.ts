import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { normalizeStory } from './model';
import { outlineQuestionMap } from './outline';
import { routeQuestionMap, storyFromReading } from './questionMap';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '変革をどう実行するか', desiredYes: 'FEASIBILITY', primaryBarrier: null,
  proofNeeds: ['TARGET_GAP', 'OVERALL_CHANGE', 'SIZE_CONTEXT', 'BRIDGE', 'CONTRIBUTION'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['EXECUTION'], outcomeDirection: 'NEGATIVE', explicitSize: null, confidence: 0.9, ...over,
});

describe('Transformation Route', () => {
  it('FEASIBILITYは目指す姿→現状→隔たり→施策→順序で止まる', () => {
    const map = routeQuestionMap(R(), 'ja', 'TRANSFORMATION');
    expect([...new Set(map.map((slide) => slide.routeRole))]).toEqual([
      'TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP', 'TRANSFORMATION.INITIATIVES', 'TRANSFORMATION.SEQUENCE',
    ]);
    expect(map.some((slide) => slide.routeRole === 'TRANSFORMATION.OWNERSHIP')).toBe(false);
  });

  it('目指す姿・施策・順序はCoachが決めず、根拠が無ければ空のQuestionとして置く', () => {
    const map = routeQuestionMap(R({ proofNeeds: [] }), 'ja', 'TRANSFORMATION');
    expect(map.map((slide) => slide.proofNeeds)).toEqual([[], [], [], [], []]);
    expect(map.map((slide) => slide.referenceRecipes)).toEqual([[], [], [], [], []]);
    expect(map.filter((slide) => slide.routeRole && ['TRANSFORMATION.AMBITION', 'TRANSFORMATION.INITIATIVES', 'TRANSFORMATION.SEQUENCE'].includes(slide.routeRole)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ routeRole: 'TRANSFORMATION.AMBITION', presentationMode: 'TEXT', userAuthoredMessage: '' }),
        expect.objectContaining({ routeRole: 'TRANSFORMATION.INITIATIVES', presentationMode: 'TEXT', userAuthoredMessage: '' }),
        expect.objectContaining({ routeRole: 'TRANSFORMATION.SEQUENCE', presentationMode: 'TEXT', userAuthoredMessage: '' }),
      ]));
  });

  it('COMMITMENTでは担当・節目・推進方法まで置く', () => {
    const map = routeQuestionMap(R({ desiredYes: 'COMMITMENT', proofNeeds: [] }), 'ja', 'TRANSFORMATION');
    expect(map.map((slide) => slide.routeRole)).toEqual([
      'TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP', 'TRANSFORMATION.INITIATIVES',
      'TRANSFORMATION.SEQUENCE', 'TRANSFORMATION.OWNERSHIP', 'TRANSFORMATION.MILESTONES', 'TRANSFORMATION.GOVERNANCE',
    ]);
    expect(map.slice(-3).every((slide) => slide.presentationMode === 'TEXT' && slide.userAuthoredMessage === '')).toBe(true);
  });

  it('明示された見せ方を現状・隔たり・施策・順序へ割り当てる', () => {
    const outline = ['STORY_TABLE_KPI', 'STORY_TABLE_DELTA', 'STORY_TEXT_ISSUE_INSIGHT_ACTION', 'STORY_TEXT_NEXT_ACTIONS'] as const;
    expect(outlineQuestionMap('', [...outline], 'ja', 'TRANSFORMATION').map((slide) => slide.routeRole)).toEqual([
      'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP', 'TRANSFORMATION.INITIATIVES', 'TRANSFORMATION.SEQUENCE',
    ]);
  });

  it('Story作成・保存の往復でTransformationと役割を維持する', () => {
    const story = storyFromReading('変革プログラムの実行計画を作りたい', R(), 'ja');
    expect(story.primaryRoute).toBe('TRANSFORMATION');
    expect(normalizeStory(JSON.parse(JSON.stringify(story)))).toEqual(story);
  });
});
