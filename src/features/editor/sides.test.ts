import { describe, expect, it } from 'vitest';
import { switchChart } from './chartSwitch';
import { initialProject, viewOf, withView } from './project';
import { TREND_SAMPLE } from './sample';
import { sideBlock, sideOf, sidesFor, withSide } from './sides';
import { recipeOf, toViewSpec, type BuilderState } from './state';

const base = (chart: BuilderState['chart'] = 'stacked_100'): BuilderState =>
  ({ ...viewOf(initialProject('ja'), 0), chart, dataset: TREND_SAMPLE as BuilderState['dataset'], recipe: null });

describe('付け合わせ（右側に並べる）', () => {
  it('プロジェクトに書き戻しても、付けた・引き継いだ付け合わせが残る', () => {
    const p0 = initialProject('ja');
    const v = { ...viewOf(p0, 0), chart: 'stacked_100' as const, recipe: null };
    const p1 = withView(p0, 0, v);
    const p2 = withView(p1, 0, withSide(viewOf(p1, 0), 'delta'));
    expect(viewOf(p2, 0).recipe).toBe('TREND_SHARE_DELTA');
    const p3 = withView(p2, 0, switchChart(viewOf(p2, 0), 'line').state);
    expect(viewOf(p3, 0).recipe).toBe('TREND_LINE_DELTA');
    const p4 = withView(p3, 0, withSide(viewOf(p3, 0), 'none'));
    expect(sideOf(viewOf(p4, 0))).toBe('none');
  });

  it('推移の折れ線・積み上げ・100%積み上げで、なし／増加額／伸び率を選べる', () => {
    for (const c of ['line', 'stacked_column', 'stacked_100'] as const) expect(sidesFor(c)).toEqual(['none', 'delta', 'cagr']);
    expect(sidesFor('bar_rank')).toEqual(['none', 'delta']);
    expect(sidesFor('column_compare')).toEqual([]);
  });

  it('付けると左右構成（2/3：1/3）になり、外すとチャート1つに戻る。データはそのまま', () => {
    const s = base();
    const on = withSide(s, 'delta');
    expect(sideOf(on)).toBe('delta');
    expect(recipeOf(on)?.id).toBe('TREND_SHARE_DELTA');
    expect(toViewSpec(on).layout).toEqual({ id: 'p03_left_right', ratios: [0.67] });
    expect(on.dataset).toBe(s.dataset);
    const off = withSide(on, 'none');
    expect(sideOf(off)).toBe('none');
    expect(toViewSpec(off).panels).toHaveLength(1);
    expect(sideOf(withSide(on, 'cagr'))).toBe('cagr');
  });

  it('チャートを替えても付け合わせを引き継ぐ（100%積み上げ → 折れ線 → 100%積み上げ）', () => {
    const a = withSide(base(), 'delta');
    const line = switchChart(a, 'line').state;
    expect(sideOf(line)).toBe('delta');
    expect(recipeOf(line)?.id).toBe('TREND_LINE_DELTA');
    const back = switchChart(line, 'stacked_100').state;
    expect(recipeOf(back)?.id).toBe('TREND_SHARE_DELTA');
    // 付け合わせの無いチャートでは、チャート1つ
    const col = switchChart(back, 'column_trend').state;
    expect(recipeOf(col)).toBeNull();
  });

  it('比率だけのデータ（100%積み上げ）では、増加額・伸び率を選べない理由を出す', () => {
    const d = { ...TREND_SAMPLE, unit: '%', rows: ['2023', '2024', '2025'], cols: ['A', 'B'], periods: { current: { label: 'x', values: [[40, 60], [45, 55], [50, 50]] }, base: { label: 'b', values: [[null, null], [null, null], [null, null]] } } };
    const s = { ...base(), dataset: d as BuilderState['dataset'] };
    expect(sideBlock(s, 'delta')).toBe('no_absolute');
    expect(sideBlock(s, 'none')).toBeNull();
    expect(sideBlock(base(), 'delta')).toBeNull();
  });
});

describe('期間の見せ方・右 1/3 の量（docs/composition-review.md）', () => {
  it('最初と最後だけ：表示は2本、データは消さない。全期間に戻せば5本', async () => {
    const { composeSlide } = await import('@/engine/layout/compose');
    const s = withSide({ ...base('stacked_column'), controls: { period_display: 'FIRST_LAST' } }, 'cagr');
    const years = (st: BuilderState) => composeSlide(toViewSpec(st), st.dataset as never).items
      .flatMap((i) => (i.kind === 'text' ? i.lines.map((l) => l.t) : [])).filter((t) => /^20\d\d$/.test(t));
    expect(new Set(years(s))).toEqual(new Set(['2021', '2025']));
    expect(s.dataset.rows).toHaveLength(5);
    expect(new Set(years({ ...s, controls: { period_display: 'ALL_PERIODS' } })).size).toBe(5);
  });
  it('右の差分バーは6項目、表は8行まで。超えたら知らせる（上位5＋その他で収まる）', async () => {
    const { sideOverflow } = await import('./sides');
    const seven = { ...base('stacked_column'), dataset: { ...TREND_SAMPLE, cols: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], periods: { current: { label: 'x', values: TREND_SAMPLE.periods.current.values.map((r) => [...r, 1, 2]) }, base: TREND_SAMPLE.periods.base } } as BuilderState['dataset'] };
    expect(sideOverflow(seven, 'delta')).toEqual({ count: 7, max: 6 });
    expect(sideOverflow(seven, 'cagr')).toBeNull();
    expect(sideOverflow({ ...seven, controls: { top_n: '5' } }, 'delta')).toBeNull();
  });
});
