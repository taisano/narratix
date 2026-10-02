import { describe, expect, it } from 'vitest';
import { initialState, isAnySample, pairSample, sampleFor, toShowcase, type BuilderState } from './state';
import { applyRecipe, isSampleData } from './fromRecipe';
import { switchChart } from './chartSwitch';
import { isPlaceholderTitle } from './leftovers';
import { PLACEHOLDER_TITLE, SAMPLE_DATASET, SAMPLE_TITLE, TREND_TITLE } from './sample';
import { registry } from '@/registry';

const REAL = /北米|欧州|中国|東南アジア|デュアル|製品A|消費財|North America|China|Dual|Consumer/;
const PURPOSES = ['composition', 'trend', 'contribution', 'relationship'] as const;

describe('編集画面の見本は中立（誰かが作った資料に見せない）', () => {
  it('項目は AAA・BBB…、タイトルは書く場所の案内。年・数字は同じ', () => {
    for (const l of ['ja', 'en'] as const) {
      for (const p of PURPOSES) {
        const s = sampleFor(p, l);
        expect(JSON.stringify(s.dataset)).not.toMatch(REAL);
        expect(isPlaceholderTitle(s.title)).toBe(true);
        expect(s.dataset.periods.current.values).toEqual(sampleFor(p, l, true).dataset.periods.current.values);
      }
      expect(JSON.stringify(pairSample(l).dataset)).not.toMatch(REAL);
    }
    expect(sampleFor('trend').title).toBe(PLACEHOLDER_TITLE);
    expect(sampleFor('trend').dataset.cols).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    expect(sampleFor('trend').dataset.rows).toEqual(['2021', '2022', '2023', '2024', '2025']);
  });
  it('チャートを替えても、出てくる見本は中立', () => {
    for (const c of ['line', 'waterfall', 'bubble', 'slope_pair', 'mekko'] as const) {
      const s = switchChart(initialState(), c).state;
      expect(JSON.stringify(s.dataset)).not.toMatch(REAL);
      expect(isPlaceholderTitle(s.title)).toBe(true);
    }
  });
  it('前に保存した本物らしい見本も「見本のまま」とみなし、チャートを替えると中立の見本になる', () => {
    const old: BuilderState = { ...initialState(), dataset: structuredClone({ ...SAMPLE_DATASET, periods: { ...SAMPLE_DATASET.periods } }) as BuilderState['dataset'], title: SAMPLE_TITLE };
    expect(isSampleData(old)).toBe(true);
    expect(isPlaceholderTitle(TREND_TITLE)).toBe(true);
    const next = switchChart(old, 'line').state;
    expect(JSON.stringify(next.dataset)).not.toMatch(REAL);
  });
  it('紹介・一覧の絵は本物らしい見本（名前・タイトル・名前を指す設定も替える）', () => {
    const s = applyRecipe(initialState(), registry.recipes.TREND_CAGR_TABLE);
    const show = toShowcase({ ...s, controls: { ...s.controls, highlight: 'CCC' } });
    expect(show.dataset.cols).toContain('中国');
    expect(show.controls.highlight).toBe('中国');
    expect(show.title).toBe(TREND_TITLE);
    expect(isAnySample(show.dataset)).toBe(true);
    const mine = { ...s, dataset: { ...s.dataset, cols: ['自社', 'B', 'C', 'D', 'E'] } };
    expect(toShowcase(mine)).toBe(mine);
  });
});
