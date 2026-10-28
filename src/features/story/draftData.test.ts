import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import * as F from '../data/draft/fixtures';
import { analyzeTable, resolveRoles, type DraftSource } from '../data/draft/session';
import { storyFromReading } from './questionMap';
import { mergeProject, projectOfStory, rebuildStoryData } from './storyProject';
import { normalizeStory } from './model';
import { firstShownSeries, isVolumeAndRate, questionColumns, storyDatasetsFromDraft, withDraftData } from './draftData';

const draftOf = (tsv: string): DraftSource => {
  const a = analyzeTable(tsv); if (!a.ok) throw new Error();
  const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
  return { tsv, map: r.map, shape: null, question: '' };
};
const R: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'], scopeCandidate: 'STORY_FLOW',
  routeSignals: [], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};

describe('貼った表のデータで Story を始める', () => {
  it('貼った表から表のデータを作る。列対応が無い表・読めない表は空', () => {
    const d = storyDatasetsFromDraft(draftOf(F.ONE_METRIC_TSV), 'ja');
    expect(d.find((x) => x.id === 'table')!.data.cols).toEqual(['ZZ_ALAND', 'ZZ_BORDURIA', 'ZZ_CASCADIA', 'ZZ_DORNE']);
    expect(d.find((x) => x.id === 'table')!.source).toContain('出典');
    expect(storyDatasetsFromDraft({ ...draftOf(F.ONE_METRIC_TSV), map: null }, 'ja')).toEqual([]);
    expect(storyDatasetsFromDraft(undefined, 'ja')).toEqual([]);
  });
  it('Story のデータに入り、編集画面のプロジェクトは見本ではなく貼った表で始まる', () => {
    const s = withDraftData(storyFromReading('相談', R, 'ja'), draftOf(F.ONE_METRIC_TSV), 'ja');
    expect(s.datasets.find((x) => x.id === 'table')!.data.cols).toContain('ZZ_CASCADIA');
    const p = projectOfStory(s, 'ja');
    expect(p.dataset.cols).toContain('ZZ_CASCADIA');
    expect(p.source).toContain('出典');
  });
  it('下書きが無ければ Story はそのまま', () => {
    const s = storyFromReading('相談', R, 'ja');
    expect(withDraftData(s, undefined, 'ja')).toBe(s);
  });
});

describe('単位の違う指標がある表で Story を始める', () => {
  const TSV = ['月\t売上(万円)\t粗利率\t新規顧客数(人)\t解約率', '2026年1月\t4,820\t31.2%\t128\t2.4%', '2026年2月\t4,950\t31.8%\t135\t2.2%', '2026年3月\t5,310\t30.9%\t162\t2.6%', '2026年4月\t5,180\t32.4%\t149\t2.1%'].join('\n');
  it('データは4つの指標を全部持ち、最初のグラフは先頭の指標と同じ単位の列だけ（ほかは「表示する列」で足せる）', () => {
    const s = withDraftData(storyFromReading('相談', R, 'ja'), draftOf(TSV), 'ja');
    const t = s.datasets.find((x) => x.id === 'table')!.data;
    expect(t.cols).toHaveLength(4);
    const p = projectOfStory(s, 'ja');
    expect(p.dataset.cols).toHaveLength(4);
    const charts = p.slides.filter((x) => !x.view && !String(x.chart).startsWith('table_') && x.chart !== 'combo');
    expect(charts.length).toBeGreaterThan(0);
    for (const sl of charts) expect(sl.controls.series).toEqual(['売上(万円)']);
  });
  it('単位が1種類なら絞らない', () => {
    expect(firstShownSeries({ cols: ['a', 'b'], colUnits: ['円', '円'] })).toBeNull();
    expect(firstShownSeries({ cols: ['a', 'b'] })).toBeNull();
    expect(firstShownSeries({ cols: ['a', 'b', 'c'], colUnits: ['円', '%', '円'] })).toEqual(['a', 'c']);
  });
});

describe('問いに合わせて、最初に見せる指標を選ぶ', () => {
  const TSV = ['月\t売上(万円)\t粗利率\t新規顧客数(人)\t解約率', '2026年1月\t4,820\t31.2%\t128\t2.4%', '2026年2月\t4,950\t31.8%\t135\t2.2%', '2026年3月\t5,310\t30.9%\t162\t2.6%', '2026年4月\t5,180\t32.4%\t149\t2.1%'].join('\n');
  const COLS = ['売上(万円)', '粗利率', '新規顧客数(人)', '解約率'];
  it('問いの文に名前がある指標を、見出しの順で拾う（単位の括弧は外して比べる）。無ければ null', () => {
    expect(questionColumns(COLS, '新規顧客数と解約率はどう動いたか')).toEqual(['新規顧客数(人)', '解約率']);
    expect(questionColumns(COLS, '売上の推移は')).toEqual(['売上(万円)']);
    expect(questionColumns(COLS, 'どの市場を優先するか')).toBeNull();
    // 言い換え：解約数 → 解約率、新規顧客 → 新規顧客数
    expect(questionColumns(COLS, '新規顧客と解約数の動きは')).toEqual(['新規顧客数(人)', '解約率']);
    expect(isVolumeAndRate(['新規顧客数(人)', '解約率'])).toBe(true);
    expect(isVolumeAndRate(['売上(万円)', '新規顧客数(人)'])).toBe(false);
  });
  it('量と率を聞く問いは組み合わせ（2軸）で、ほかの指標は隠して始める。1指標を聞く問いは、その指標だけの折れ線', () => {
    const s0 = withDraftData(storyFromReading('相談', R, 'ja'), draftOf(TSV), 'ja');
    const qi = s0.slides.findIndex((q) => q.referenceRecipes[0] && q.presentationMode === 'GRAPH');
    const mk = (question: string) => ({ ...s0, slides: s0.slides.map((q, i) => (i === qi ? { ...q, question } : q)) });
    const combo = projectOfStory(mk('新規顧客数と解約率はどう動いたか'), 'ja').slides[qi]!;
    expect(combo.recipe).toBe('COMP_COMBO');
    const cs = combo.controls.combo_series as { name: string; hidden?: boolean }[];
    expect(cs.filter((x) => !x.hidden).map((x) => x.name)).toEqual(['新規顧客数(人)', '解約率']);
    const one = projectOfStory(mk('粗利率の推移はどうか'), 'ja').slides[qi]!;
    expect(one.controls.series).toEqual(['粗利率']);
  });
});

describe('Story で列の使い方を直して、データを作り直す', () => {
  const TSV = ['月\t売上(万円)\t粗利率\t新規顧客数(人)\t解約率', '2026年1月\t4,820\t31.2%\t128\t2.4%', '2026年2月\t4,950\t31.8%\t135\t2.2%', '2026年3月\t5,310\t30.9%\t162\t2.6%', '2026年4月\t5,180\t32.4%\t149\t2.1%'].join('\n');
  const base = () => withDraftData(storyFromReading('相談', R, 'ja'), draftOf(TSV), 'ja');
  it('貼った表の元と列対応は Story に保存され、書き戻しても・読み直しても残る', () => {
    const s = base();
    expect(s.draft?.tsv).toBe(TSV);
    const p = projectOfStory(s, 'ja');
    expect(p.draft?.map).toEqual(s.draft!.map);
    const m = mergeProject(s, p, 'ja');
    expect(m.draft).toEqual(s.draft);
    expect(normalizeStory(JSON.parse(JSON.stringify(m)))!.draft).toEqual(s.draft);
    expect(normalizeStory({ ...JSON.parse(JSON.stringify(m)), draft: { tsv: TSV, map: { bad: 1 }, question: '' } })!.draft).toBeUndefined();
  });
  it('解約率を「使わない」にして作り直すと、データから外れ、Message は残る', () => {
    const s = base();
    const p = projectOfStory(s, 'ja');
    const idx = p.slides.findIndex((x) => !x.view && x.chart !== 'table_basic');
    const slides = p.slides.map((x, i) => (i === idx ? { ...x, title: '売上は伸びている' } : x));
    const map = { ...p.draft!.map, assignments: p.draft!.map.assignments.filter((a) => a.col !== 4), source: 'user' as const };
    const r = rebuildStoryData({ ...p, slides }, map, () => '');
    if (!r.ok) throw new Error(r.reason);
    expect(r.project.dataset.cols).not.toContain('解約率');
    expect(r.project.dataset.cols).toHaveLength(3);
    expect(r.project.slides[idx]!.title).toBe('売上は伸びている');
    expect(r.project.draft!.map.assignments.some((a) => a.col === 4)).toBe(false);
  });
  it('元の表が無い Story・作れない列の使い方は、何も変えず理由を返す', () => {
    const p = projectOfStory(storyFromReading('相談', R, 'ja'), 'ja');
    expect(rebuildStoryData(p, { version: 1, assignments: [], source: 'user' }, () => '')).toEqual({ ok: false, reason: 'no_draft' });
    const q = projectOfStory(base(), 'ja');
    expect(rebuildStoryData(q, { ...q.draft!.map, assignments: [], time: undefined, source: 'user' }, () => '')).toEqual({ ok: false, reason: 'unbuildable' });
  });
});

describe('問いごとに形の合うデータを分ける', () => {
  it('実績と予算の表なら、実績比較の問いだけ自分のデータを持ち、順位の問いは共通の表のまま', () => {
    const base = storyFromReading('相談', R, 'ja');
    const q = (i: number, rec: string) => ({ ...base.slides[i]!, referenceRecipes: [rec as never] });
    const s0 = { ...base, slides: [q(0, 'COMP_TWO_DELTA'), q(1, 'COMP_RANK')] };
    const s = withDraftData(s0, draftOf(F.ACTUAL_BUDGET_TSV), 'ja');
    const own = s.datasets.filter((d) => d.id.startsWith('dr_'));
    expect(s.slides[1]!.datasetRefs.some((r) => r.startsWith('dr_'))).toBe(false);
    expect(own.length).toBeGreaterThan(0);
    {
      expect(s.slides[0]!.datasetRefs).toEqual([own[0]!.id]);
      const p = projectOfStory(s, 'ja');
      expect(Object.keys(p.extra ?? {})).toContain(own[0]!.id);
      const rb = rebuildStoryData(p, p.draft!.map, () => '');
      expect(rb.ok).toBe(true);
      if (rb.ok) expect(Object.keys(rb.project.extra ?? {})).toContain(own[0]!.id);
    }
  });
});
