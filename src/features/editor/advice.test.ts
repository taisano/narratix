import { describe, expect, it } from 'vitest';
import { chartAdvice } from './advice';
import { initialState, sampleFor } from './state';

describe('チャートとデータの相性', () => {
  const trend = { ...initialState(), ...sampleFor('trend') };
  it('年の表で Mekko → 積み上げ縦棒をすすめる', () => {
    expect(chartAdvice({ ...trend, chart: 'mekko' })).toEqual([{ code: 'mekko_time', suggest: 'stacked_column' }]);
  });
  it('年でない表で折れ線 → 縦棒をすすめる。見本の Mekko には何も言わない', () => {
    expect(chartAdvice({ ...initialState(), chart: 'line' }).map((a) => a.code)).toEqual(['line_not_time']);
    expect(chartAdvice(initialState())).toEqual([]);
  });
  it('単位が率なら積み上げに向かない', () => {
    const s = { ...trend, chart: 'stacked_column' as const, dataset: { ...trend.dataset, unit: '%' } };
    expect(chartAdvice(s)).toEqual([{ code: 'non_additive_stack', suggest: 'line', vars: { unit: '%' } }]);
  });
  it('向いている組み合わせには何も言わない', () => {
    expect(chartAdvice({ ...trend, chart: 'line' })).toEqual([]);
    expect(chartAdvice({ ...trend, chart: 'stacked_column' })).toEqual([]);
  });
});

describe('上位だけ表示の設定', () => {
  it('積み上げは「その他」にまとめ、折れ線・率はまとめない', async () => {
    const { toViewSpec } = await import('./state');
    const trend = { ...initialState(), ...sampleFor('trend') };
    const t = (s: typeof trend) => toViewSpec(s).panels.find((p) => p.id === 'main')!.transform;
    expect(t({ ...trend, chart: 'stacked_column', controls: { top_n: '3' } })).toEqual([{ type: 'top_n', n: 3, other: true, label: 'その他' }]);
    expect(t({ ...trend, chart: 'line', controls: { top_n: '3' } })).toEqual([{ type: 'top_n', n: 3, other: false, label: 'その他' }]);
    expect(t({ ...trend, chart: 'stacked_column', controls: { top_n: '3' }, dataset: { ...trend.dataset, unit: '%' } })?.[0]).toMatchObject({ other: false });
    expect(t({ ...trend, chart: 'line', controls: { top_n: 'all' } })).toBeUndefined();
  });
});

describe('データの形から、ほかの見せ方', async () => {
  const { dataSuggestions } = await import('./advice');
  it('項目ごとに指標が3つ → バブル、2つ → 散布図。関係のチャートなら言わない', () => {
    const rel = { ...initialState(), ...sampleFor('relationship') };
    expect(dataSuggestions({ ...rel, chart: 'bar_rank' })).toEqual([{ code: 'items_three_metrics', suggest: 'bubble' }]);
    expect(dataSuggestions({ ...rel, chart: 'bubble' })).toEqual([]);
  });
  it('1列でプラスとマイナス → ウォーターフォール。年の行で関係のチャート → 折れ線', () => {
    const br = { ...initialState(), ...sampleFor('contribution') };
    expect(dataSuggestions({ ...br, chart: 'column_compare' }).map((x) => x.suggest)).toEqual(['waterfall']);
    const tr = { ...initialState(), ...sampleFor('trend') };
    expect(dataSuggestions({ ...tr, chart: 'scatter' }).map((x) => x.suggest)).toEqual(['line']);
    expect(dataSuggestions({ ...tr, chart: 'line' })).toEqual([]);
  });
});
