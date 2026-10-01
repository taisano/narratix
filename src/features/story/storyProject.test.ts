import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { detachData, selectSlide, viewOf, withView } from '../editor/project';
import { addSupplementSlide } from '../editor/coach';
import { evaluate } from '../editor/preview';
import { storyFromReading } from './questionMap';
import { addExecSummary, groupOf, moveQuestion, setCoachingOnly, setSection, skipExecSummary } from './storyOps';
import { editorQuestions, exportOrder, mergeProject, orderedQuestions, progressOf, projectOfStory, questionPosition, sharingQuestions } from './storyProject';
import { normalizeStory } from './model';

const R: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'], scopeCandidate: 'STORY_FLOW',
  routeSignals: [], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};
const story = () => storyFromReading('相談', R, 'ja');

describe('ストーリー ⇄ 編集画面のプロジェクト', () => {
  it('外していない問いを、問いと同じ id のスライドにする。グラフの問いは参考の見せ方の1つ目、判断の問いは結論＋3つの根拠', () => {
    const s = story();
    const p = projectOfStory(s, 'ja');
    expect(p.slides.map((x) => x.id)).toEqual(s.slides.map((q) => q.id));
    const graph = s.slides.filter((q) => q.routeRole !== 'AIMED.DECISION');
    expect(p.slides.slice(0, graph.length).map((x) => x.recipe)).toEqual(graph.map((q) => q.referenceRecipes[0]));
    expect(p.slides.at(-1)).toMatchObject({ view: 'STORY_TEXT_CONCLUSION_REASONS' });
    expect(projectOfStory(setCoachingOnly(s, s.slides[0]!.id, true), 'ja').slides).toHaveLength(s.slides.length - 1);
  });
  it('判断の問い：書いておいたメッセージが結論になり、書き戻すと言葉の問いのまま', () => {
    const s0 = story();
    const d = s0.slides.at(-1)!;
    const s = { ...s0, slides: s0.slides.map((q) => (q.id === d.id ? { ...q, userAuthoredMessage: '韓国と台湾を優先する' } : q)) };
    const p = projectOfStory(s, 'ja');
    expect(viewOf(p, p.slides.length - 1).title).toBe('韓国と台湾を優先する');
    const m = mergeProject(s, p, 'ja');
    expect(m.slides.at(-1)).toMatchObject({ presentationMode: 'TEXT', userAuthoredMessage: '韓国と台湾を優先する' });
    expect(normalizeStory(JSON.parse(JSON.stringify(m)))).toEqual(m);
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
  it('進み具合：見本のデータのままなら作成中。言葉のスライドは結論と根拠が入れば確認済み', () => {
    const s = story();
    let p = projectOfStory(s, 'ja');
    expect(progressOf(s.slides[0]!, p)).toBe('working');
    const last = p.slides.length - 1;
    expect(progressOf(s.slides[last]!, p)).toBe('working');
    const v = viewOf(p, last);
    p = withView(p, last, { ...v, title: '優先市場を決める', content: { conclusion: { ...v.content!.conclusion!, reasons: [{ id: 'r', heading: '伸び', body: '', ref: null }] } } });
    expect(progressOf(s.slides[last]!, p)).toBe('done');
  });
  it('補助スライドは、今の問いのすぐ後ろ（同じ置き場所）に入る。最後には回らない', () => {
    const s = story();
    let p = projectOfStory(s, 'ja');
    p = addSupplementSlide(selectSlide(p, 0), 'COMP_RANK');
    const m = mergeProject(s, p, 'ja');
    expect(m.slides[1]!.id).toBe(p.slides[1]!.id);
    expect(m.slides[1]).toMatchObject({ section: 'MAIN', questionPriority: 'SUPPORTING', routeRole: s.slides[0]!.routeRole });
    // 行き来しても同じ位置
    expect(projectOfStory(m, 'ja', p).slides.map((x) => x.id)).toEqual(p.slides.map((x) => x.id));
    // 付録の問いの後ろに足せば付録に入る
    const sa = setSection(s, s.slides[0]!.id, 'APPENDIX');
    let pa = projectOfStory(sa, 'ja');
    const last = pa.slides.length - 1;
    pa = addSupplementSlide(selectSlide(pa, last), 'COMP_RANK');
    expect(mergeProject(sa, pa, 'ja').slides.find((q) => q.id === pa.slides[last + 1]!.id)!.section).toBe('APPENDIX');
  });
  it('問い n / 全体（言葉の問いも数える）と、同じデータを使う問いの番号', () => {
    const s = story();
    const p = projectOfStory(s, 'ja');
    expect(questionPosition(s, s.slides[1]!.id)).toEqual({ n: 2, total: s.slides.length });
    expect(questionPosition(s, 'nope')).toBeNull();
    const sh = sharingQuestions(s, p);
    expect(sh.main[0]).toBe(1);
    expect(sh.appendix).toBe(0);
  });
  it('ストーリーの色：増減の棒のプラスは主要の色（緑を使わない）、マイナスは赤のまま', () => {
    const p = projectOfStory(story(), 'ja');
    expect(p.tone).toBe('story');
    const i = p.slides.findIndex((x) => x.chart === 'variance_bar');
    expect(i).toBeGreaterThanOrEqual(0);
    const fills = (pp: typeof p) => JSON.stringify(evaluate(viewOf(pp, i)).scene);
    expect(fills(p)).not.toContain('#2E7D32');
    expect(fills({ ...p, tone: undefined })).toContain('#2E7D32');
  });
  it('問いだけのデータ：保存して読み戻しても、その問いだけが使う。外した問いのデータも残る', () => {
    const s = story();
    let p = detachData(projectOfStory(s, 'ja'), 1);
    const id = p.slides[1]!.dataRef!;
    const m = mergeProject(s, p, 'ja');
    expect(m.datasets.find((d) => d.id === id)).toMatchObject({ family: 'table', label: 'データ 2' });
    expect(m.slides[1]!.datasetRefs).toEqual([id]);
    const back = normalizeStory(JSON.parse(JSON.stringify(m)))!;
    const p2 = projectOfStory(back, 'ja');
    expect(p2.slides[1]!.dataRef).toBe(id);
    expect(p2.extra![id]).toBeTruthy();
    expect(sharingQuestions(back, selectSlide(p2, 1)).main).toEqual([2]);
    // 外した問いのデータは、編集画面に出ていなくても残す
    const out = setCoachingOnly(back, back.slides[1]!.id, true);
    const p3 = projectOfStory(out, 'ja', p2);
    expect(p3.extra![id]).toBeTruthy();
    expect(mergeProject(out, p3, 'ja').datasets.some((d) => d.id === id)).toBe(true);
  });
  it('Executive Summary：追加するとメインに1枚（編集中はメインの一番下・出力は先頭）。書き戻すと入れた印と参照。スキップは印だけ', () => {
    const s = story();
    const r = addExecSummary(s, 'ja');
    expect(r.story.slides[0]!.id).toBe(r.id);
    let p = projectOfStory(r.story, 'ja');
    const k = p.slides.findIndex((x) => x.id === r.id);
    expect(p.slides[k]).toMatchObject({ id: r.id, view: 'STORY_TEXT_EXECUTIVE_SUMMARY' });
    // 編集中はメインの一番下（付録より前）
    expect(k).toBe(orderedQuestions(r.story).filter((q) => groupOf(q) === 'MAIN').length - 1);
    // 出力は先頭（既定）。「最後」を選べばそのまま
    expect(exportOrder(p, r.story).slides[0]!.id).toBe(r.id);
    expect(exportOrder(p, { ...r.story, executiveSummary: { ...r.story.executiveSummary, position: 'last' } }).slides[k]!.id).toBe(r.id);
    const v = viewOf(p, k);
    p = withView(p, k, { ...v, content: { ...v.content, exec: { blocks: v.content!.exec!.blocks.map((b, i) => (i === 0 ? { ...b, body: 'x', refs: [s.slides[0]!.id] } : b)) } } });
    const m = mergeProject(r.story, p, 'ja');
    expect(m.executiveSummary).toMatchObject({ enabled: true, evidenceSlideRefs: [s.slides[0]!.id] });
    expect(skipExecSummary(s).executiveSummary.skipped).toBe(true);
    // 外すと印も外れる。もう一度足すと同じスライド（中身はそのまま）が先頭に戻る
    const out = mergeProject(setCoachingOnly(m, r.id, true), p, 'ja');
    expect(out.executiveSummary.enabled).toBe(false);
    const again = addExecSummary(out, 'ja');
    expect(again.id).toBe(r.id);
    expect(projectOfStory(again.story, 'ja', p).slides.some((x) => x.id === r.id)).toBe(true);
  });
});
