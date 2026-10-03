import { describe, expect, it } from 'vitest';
import { fromBuilder } from '@/features/editor/project';
import { applyLong, defaultPivot, detectLong } from '@/features/editor/long';
import { initialState, pairSample, type BuilderState } from '@/features/editor/state';
import { RELATION_SAMPLE, SAMPLE_DATASET, TREND_SAMPLE } from '@/features/editor/sample';
import { ensureTemplate } from '@/features/templates/content';
import { datasetFromCanonical, datasetToCanonical, projectFromCanonical, projectToCanonical } from './canonical';

const asBuilderDataset = (dataset: typeof TREND_SAMPLE) => structuredClone(dataset) as BuilderState['dataset'];
const field = (d: ReturnType<typeof datasetToCanonical>, id: string) => d.table.fields.find((x) => x.id === id)!;

describe('正規化したデータ', () => {
  it('行×列の表は、時間・分類・値の縦長レコードになり、元のDatasetへ戻せる', () => {
    const d = datasetToCanonical(TREND_SAMPLE);
    expect(field(d, 'row').role).toBe('time');
    expect(field(d, 'column').role).toBe('dimension');
    expect(field(d, 'period').role).toBe('time');
    expect(field(d, 'measure').role).toBe('measure');
    expect(d.table.records).toHaveLength(TREND_SAMPLE.rows.length * TREND_SAMPLE.cols.length * 2);
    expect(datasetFromCanonical(d)).toEqual(TREND_SAMPLE);
  });

  it('Mekkoは行・列・期間と実額を保って往復する', () => {
    const d = datasetToCanonical(SAMPLE_DATASET);
    expect(field(d, 'measure')).toMatchObject({ role: 'measure', aggregation: 'sum', unit: { label: '百万ドル', quantity: 'currency', currency: 'USD', scale: 1e6 } });
    expect(d.table.records).toHaveLength(SAMPLE_DATASET.rows.length * SAMPLE_DATASET.cols.length * 2);
    expect(datasetFromCanonical(d)).toEqual(SAMPLE_DATASET);
  });

  it.each(['slope_pair', 'rank_slope'] as const)('%sは期間の入れ物を2指標として分け、名前と単位を別々に持つ', (chart) => {
    const sample = pairSample('ja', true);
    const d = datasetToCanonical(sample.dataset, { twoMetric: true });
    expect(d.projection.mode).toBe('two_metric');
    expect(d.table.fields.filter((x) => x.role === 'measure')).toMatchObject([
      { name: '売上', unit: { label: '億円', quantity: 'currency', currency: 'JPY', scale: 1e8 } },
      { name: '営業利益', unit: { label: '億円', quantity: 'currency', currency: 'JPY', scale: 1e8 } },
    ]);
    expect(d.table.fields.filter((x) => x.role === 'time')).toHaveLength(1);
    const p = fromBuilder({ ...initialState(), chart, dataset: sample.dataset }, null);
    expect(projectFromCanonical(projectToCanonical(p))).toEqual(p);
  });

  it('縦長の表は元の行を正本にし、切り出し方と元入力を保つ', () => {
    const text = [
      '年\t地域\tタイプ\t指標\t値',
      '2023\t北米\tスチーム\tVol\t10',
      '2023\t欧州\tスチーム\tVol\t5',
      '2024\t北米\tスチーム\tVol\t20',
      '2024\t欧州\tスチーム\tVol\t10',
    ].join('\n');
    const table = detectLong(text)!;
    const state = applyLong(initialState(), table, defaultPivot(table));
    const d = datasetToCanonical(state.dataset);
    expect(d.projection.mode).toBe('long');
    expect(d.table.records).toHaveLength(4);
    expect(d.table.fields.map((x) => x.role)).toEqual(['time', 'dimension', 'dimension', 'dimension', 'measure']);
    expect(datasetFromCanonical(d)).toEqual(state.dataset);
  });

  it('バブルのグループを分類フィールドとして残す', () => {
    const d = datasetToCanonical(RELATION_SAMPLE);
    expect(field(d, 'group')).toMatchObject({ role: 'dimension', name: '事業' });
    expect((field(d, 'group') as { members: { label: string }[] }).members.map((x) => x.label)).toEqual(['消費財', '産業財']);
    expect(datasetFromCanonical(d)).toEqual(RELATION_SAMPLE);
  });

  it('同じ値と意味は同じhashになり、値と意味の変更を別々に検出する', () => {
    const original = datasetToCanonical(TREND_SAMPLE);
    const same = datasetToCanonical(structuredClone(TREND_SAMPLE));
    const changedValue = structuredClone(TREND_SAMPLE);
    changedValue.periods.current.values[0]![0] = 999;
    const value = datasetToCanonical(changedValue);
    const changedMeaning = { ...structuredClone(TREND_SAMPLE), unit: '百万円' };
    const meaning = datasetToCanonical(changedMeaning);
    expect(same.contentHash).toBe(original.contentHash);
    expect(same.semanticsHash).toBe(original.semanticsHash);
    expect(value.contentHash).not.toBe(original.contentHash);
    expect(value.semanticsHash).toBe(original.semanticsHash);
    expect(meaning.semanticsHash).not.toBe(original.semanticsHash);
  });
});

describe('ProjectStateとDeckContentの往復', () => {
  it('グラフの見せ方とデータを分け、同じProjectStateへ戻す', () => {
    const state: BuilderState = { ...initialState(), chart: 'mekko', dataset: asBuilderDataset(SAMPLE_DATASET as typeof TREND_SAMPLE), title: '規模と構成', controls: { items: ['北米'] } };
    const project = fromBuilder(state, 'MIX_MEKKO');
    const draft = projectToCanonical(project, '2026-10-03T00:00:00.000Z');
    expect(draft.content.slides[0]!.view).not.toHaveProperty('dataRef');
    expect(draft.content.slides[0]!.data[0]!.datasetVersionId).toBe('dataset-version:@table');
    expect(draft.content.slides[0]!.texts.message).toMatchObject({ text: '規模と構成', author: 'user' });
    expect(draft.datasetVersions['dataset-version:@table']!.table.records).toHaveLength(SAMPLE_DATASET.rows.length * SAMPLE_DATASET.cols.length * 2);
    expect(projectFromCanonical(draft)).toEqual(project);
  });

  it.each(['STORY_TABLE_COMPARISON', 'STORY_TEXT_BULLETS'] as const)('%sはデータ参照を持たないスライドとして往復する', (template) => {
    const initial = initialState();
    const project = fromBuilder({ ...initial, ...ensureTemplate(initial, template, true) }, null);
    const draft = projectToCanonical(project);
    expect(draft.content.slides[0]!.data).toEqual([]);
    expect(projectFromCanonical(draft)).toEqual(project);
  });
});
