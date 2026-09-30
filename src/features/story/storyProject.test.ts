import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { viewOf, withView } from '../editor/project';
import { storyFromReading } from './questionMap';
import { moveQuestion, setCoachingOnly, setSection } from './storyOps';
import { editorQuestions, mergeProject, progressOf, projectOfStory } from './storyProject';
import { normalizeStory } from './model';

const R: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'], scopeCandidate: 'STORY_FLOW',
  routeSignals: [], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};
const story = () => storyFromReading('相談', R, 'ja');

describe('ストーリー ⇄ 編集画面のプロジェクト', () => {
  it('グラフの問いだけを、問いと同じ id のスライドにする（判断の問い・外した問いは出さない）。最初は参考の見せ方の1つ目', () => {
    const s = story();
    const p = projectOfStory(s, 'ja');
    const graph = s.slides.filter((q) => q.routeRole !== 'AIMED.DECISION');
    expect(p.slides.map((x) => x.id)).toEqual(graph.map((q) => q.id));
    expect(p.slides.map((x) => x.recipe)).toEqual(graph.map((q) => q.referenceRecipes[0]));
    expect(projectOfStory(setCoachingOnly(s, s.slides[0]!.id, true), 'ja').slides).toHaveLength(graph.length - 1);
  });
  it('並びはメイン → 付録', () => {
    const s0 = story();
    const s = setSection(s0, s0.slides[0]!.id, 'APPENDIX');
    expect(editorQuestions(s).at(-1)!.id).toBe(s0.slides[0]!.id);
  });
  it('書き戻す：メッセージタイトル＝Message、グラフ・データも。保存形式として読み戻せる', () => {
    const s = story();
    let p = projectOfStory(s, 'ja');
    p = withView(p, 0, { ...viewOf(p, 0), title: '市場全体は2019年の水準を超えた' });
    const m = mergeProject(s, p, 'ja');
    expect(m.slides[0]).toMatchObject({ userAuthoredMessage: '市場全体は2019年の水準を超えた', status: 'IN_PROGRESS' });
    expect(m.slides[0]!.visual!.id).toBe(s.slides[0]!.id);
    expect(m.datasets.map((d) => d.id)).toContain('table');
    expect(normalizeStory(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
  it('問いを並べ替えても、入れたデータとグラフの設定は失わない', () => {
    const s = story();
    let p = projectOfStory(s, 'ja');
    p = withView(p, 1, { ...viewOf(p, 1), title: '差の Message' });
    const merged = mergeProject(s, p, 'ja');
    const moved = moveQuestion(merged, merged.slides[1]!.id, -1);
    const p2 = projectOfStory(moved, 'ja', p);
    expect(p2.slides[0]!.id).toBe(s.slides[1]!.id);
    expect(p2.slides[0]!.title).toBe('差の Message');
    expect(p2.dataset).toBe(p.dataset);
  });
  it('進み具合：見本のデータのままなら作成中、判断の問いは Message があれば確認済み', () => {
    const s = story();
    const p = projectOfStory(s, 'ja');
    expect(progressOf(s.slides[0]!, p)).toBe('working');
    expect(progressOf({ ...s.slides[3]!, userAuthoredMessage: '優先市場を決める' }, p)).toBe('done');
    expect(progressOf(s.slides[3]!, p)).toBe('todo');
  });
});
