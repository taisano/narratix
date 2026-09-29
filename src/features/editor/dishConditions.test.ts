import { describe, expect, it } from 'vitest';
import { dataConditions } from './dishConditions';
import { initialProject, viewOf } from './project';
import { TREND_SAMPLE } from './sample';
import type { BuilderState } from './state';

const base = (): BuilderState => ({ ...viewOf(initialProject('ja'), 0), chart: 'stacked_column', controls: {} });
const withData = (rows: string[], cols: string[], values: (number | null)[][], unit = '億円'): BuilderState => ({
  ...base(),
  dataset: { ...TREND_SAMPLE, unit, rows, cols, periods: { current: { label: 'x', values }, base: { label: 'b', values: values.map((r) => r.map(() => null)) } } },
});

describe('一品料理の表：データの条件', () => {
  it('推移の見本（実額・5年・5地域）：期間は3つ以上、内訳で足せる、CAGR を出せる。合計列が無いので合計との一致は成立しない', () => {
    const { conditions: c } = dataConditions({ ...base(), dataset: TREND_SAMPLE as BuilderState['dataset'] });
    expect(c).toMatchObject({
      PERIODS_2: 'no', PERIODS_3PLUS: 'yes', MULTI_SERIES: 'yes', FEW_SERIES: 'no', ADDITIVE: 'yes',
      PARTS_FORM_WHOLE: 'yes', ABSOLUTE_BASE_AVAILABLE: 'yes', CAGR_CALCULABLE: 'yes', RECONCILES_TO_TOTAL: 'no',
    });
  });

  it('合計の列があり、項目の和と一致すれば RECONCILES_TO_TOTAL。合わない時点は差を返す', () => {
    const ok = dataConditions(withData(['2023', '2025'], ['A', 'B', '合計'], [[10, 20, 30], [15, 25, 40]]));
    expect(ok.conditions.RECONCILES_TO_TOTAL).toBe('yes');
    expect(ok.conditions.MULTI_SERIES).toBe('yes');
    expect(ok.detail.totalCol).toBe('合計');
    const ng = dataConditions(withData(['2023', '2025'], ['A', 'B', 'Total'], [[10, 20, 30], [15, 25, 50]]));
    expect(ng.conditions.RECONCILES_TO_TOTAL).toBe('no');
    expect(ng.detail.mismatch).toEqual([{ row: '2025', diff: 10 }]);
  });

  it('比率（各時点の和が 100%）のデータは絶対値ではない：増加額・CAGR を出せない', () => {
    const { conditions: c } = dataConditions(withData(['2023', '2024', '2025'], ['A', 'B'], [[40, 60], [45, 55], [50, 50]], '%'));
    expect(c.ABSOLUTE_BASE_AVAILABLE).toBe('no');
    expect(c.CAGR_CALCULABLE).toBe('no');
    const noUnit = dataConditions(withData(['2023', '2024', '2025'], ['A', 'B'], [[40, 60], [45, 55], [50, 50]], ''));
    expect(noUnit.conditions.ABSOLUTE_BASE_AVAILABLE).toBe('no');
  });

  it('率の指標は足せない（内訳ではない）。「うち」が混ざる項目も内訳ではない', () => {
    const rate = dataConditions(withData(['2024', '2025'], ['粗利率', '営業利益率'], [[30, 10], [32, 12]], ''));
    expect(rate.conditions.ADDITIVE).toBe('no');
    expect(rate.conditions.PARTS_FORM_WHOLE).toBe('no');
    const subset = dataConditions(withData(['2024', '2025'], ['国内', 'うち東京', '海外'], [[100, 40, 50], [110, 45, 60]]));
    expect(subset.conditions.PARTS_FORM_WHOLE).toBe('no');
  });

  it('CAGR：年の期間が無い、または始点が 0 以下の項目があれば出せない（項目を返す）', () => {
    const noYear = dataConditions(withData(['上期', '下期'], ['A', 'B'], [[10, 20], [12, 22]]));
    expect(noYear.conditions.CAGR_CALCULABLE).toBe('no');
    const zero = dataConditions(withData(['2021', '2025'], ['A', 'B'], [[0, 20], [12, 22]]));
    expect(zero.conditions.CAGR_CALCULABLE).toBe('no');
    expect(zero.detail.noCagr).toEqual(['A']);
  });

  it('期間が2つならスロープ、系列が4つまでなら積み上げに伸び率を直接書ける', () => {
    const { conditions: c } = dataConditions(withData(['2020', '2025'], ['A', 'B', 'C', 'D'], [[1, 2, 3, 4], [2, 3, 4, 5]]));
    expect(c).toMatchObject({ PERIODS_2: 'yes', PERIODS_3PLUS: 'no', FEW_SERIES: 'yes' });
  });
});
