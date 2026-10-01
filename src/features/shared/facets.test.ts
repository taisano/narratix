import { describe, expect, it } from 'vitest';
import { newProject } from '@/features/editor/project';
import type { ProjectState } from '@/features/editor/project';
import { EMPTY_SELECTION, facetItem, facetOptions, facetSearchText, facetSummary, matchesFacets } from './facets';

const withCharts = (charts: string[]): ProjectState => {
  const p = newProject('ja');
  return { ...p, slides: charts.map((c, i) => ({ ...p.slides[0]!, id: `s${i}`, chart: c as never })) };
};

describe('目的・チャート・タグの絞り込み', () => {
  const items = [
    facetItem(withCharts(['line']), ['日本語', '売上']),
    facetItem(withCharts(['mekko', 'line']), ['日本語']),
    facetItem(withCharts(['waterfall']), ['English']),
    facetItem(withCharts(['bar_rank']), ['日本語']),
  ];
  it('目的はチャートから決まり、どれか1枚が当てはまれば入る。欄の中は OR、欄どうしは AND', () => {
    expect(items[1]!.purposes).toEqual(['trend', 'composition']);
    const hit = (s: Partial<typeof EMPTY_SELECTION>) => items.map((x) => matchesFacets(x, { ...EMPTY_SELECTION, ...s }));
    expect(hit({ purpose: ['trend'] })).toEqual([true, true, false, false]);
    expect(hit({ purpose: ['trend', 'contribution'] })).toEqual([true, true, true, false]);
    expect(hit({ purpose: ['trend'], chart: ['mekko'] })).toEqual([false, true, false, false]);
    expect(hit({ purpose: ['trend'], tag: ['売上'] })).toEqual([true, false, false, false]);
  });
  it('件数はほかの欄の条件の中で数え、目的を選ぶとチャートの選択肢はその目的のものだけ', () => {
    const all = facetOptions(items, EMPTY_SELECTION, 'ja');
    expect(all.purpose.map((o) => [o.value, o.count])).toEqual([['trend', 2], ['comparison', 1], ['composition', 1], ['contribution', 1]]);
    expect(all.purpose[0]!.label).toBe('推移');
    expect(all.chart[0]).toMatchObject({ value: 'line', count: 2 });
    const trend = facetOptions(items, { ...EMPTY_SELECTION, purpose: ['trend'] }, 'ja');
    expect(trend.chart.map((o) => o.value)).toEqual(['line']);
    // タグは目的で絞った中で数える
    expect(trend.tag.find((o) => o.value === '日本語')!.count).toBe(2);
    expect(trend.tag.some((o) => o.value === 'English')).toBe(false);
  });
  it('検索にチャート名・目的名（日英）が入り、カードの一言は「目的・チャート ほかN枚」', () => {
    expect(facetSearchText(items[1]!)).toContain('Mekko');
    expect(facetSearchText(items[2]!)).toContain('Waterfall');
    expect(facetSummary(withCharts(['mekko', 'line', 'line']), 'ja', (n) => `ほか${n}枚`)).toBe('構成・Mekko ほか2枚');
    expect(facetSummary(withCharts(['line']), 'en', (n) => `+${n}`)).toBe('Trend · Line');
  });
  it('表示中のスライドに合わせる。表・言葉の型は型の名前で、チャートの絞り込みには入れない', () => {
    const p = withCharts(['line', 'line', 'mekko']);
    const q: ProjectState = { ...p, slides: p.slides.map((s, i) => (i === 1 ? { ...s, view: 'STORY_TABLE_COMPARISON' as const } : s)) };
    const more = (n: number) => `ほか${n}枚`;
    expect(facetSummary(q, 'ja', more, 0)).toBe('推移・折れ線 ほか2枚');
    expect(facetSummary(q, 'ja', more, 1)).toBe('表・比較表 ほか2枚');
    expect(facetSummary(q, 'ja', more, 2)).toBe('構成・Mekko ほか2枚');
    expect(facetSummary({ ...q, slides: [q.slides[1]!] }, 'en', more)).toBe('Table · Comparison table');
    expect(facetItem(q, []).charts).toEqual(['line', 'mekko']);
  });
});
