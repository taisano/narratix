import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import * as F from '../data/draft/fixtures';
import { analyzeTable, resolveRoles, type DraftSource } from '../data/draft/session';
import { storyFromReading } from './questionMap';
import { projectOfStory } from './storyProject';
import { firstShownSeries, storyDatasetsFromDraft, withDraftData } from './draftData';

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
