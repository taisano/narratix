import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import * as F from '../data/draft/fixtures';
import { analyzeTable, resolveRoles, type DraftSource } from '../data/draft/session';
import { storyFromReading } from './questionMap';
import { projectOfStory } from './storyProject';
import { storyDatasetsFromDraft, withDraftData } from './draftData';

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
