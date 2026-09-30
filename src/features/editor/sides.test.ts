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
    expect(sidesFor('bar_rank')).toEqual(['none', 'delta', 'cagr', 'metric2']);
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

describe('付け合わせの形（中身はそのまま、形だけ）', () => {
  const texts = async (st: BuilderState) => {
    const { composeSlide } = await import('@/engine/layout/compose');
    return composeSlide(toViewSpec(st), st.dataset as never).items.flatMap((i) => (i.kind === 'text' ? i.lines.map((l) => l.t) : i.kind === 'table' ? i.rows.flat().map((c) => c.text) : []));
  };
  it('増加額：差分バー（既定）→ 増減表 → ウォーターフォール。どれも同じ増加額', async () => {
    const { formsFor, formOf } = await import('./sides');
    const s = withSide(base('stacked_column'), 'delta');
    expect(formsFor(s, 'delta')).toEqual(['bars', 'table', 'waterfall']);
    expect(formOf(s, 'delta')).toBe('bars');
    const table = { ...s, controls: { ...s.controls, side_form: 'table' } };
    expect(toViewSpec(table).panels.find((p) => p.id !== 'main')).toMatchObject({ kind: 'table', table: 'delta_table' });
    const t1 = await texts(table);
    expect(t1).toEqual(expect.arrayContaining(['+170', '+110', '増加額（億円、2021→2025）']));
    const wf = await texts({ ...s, controls: { ...s.controls, side_form: 'waterfall' } });
    // 始点の合計 1,030 → 項目の増減 → 終点の合計 1,408
    expect(wf).toEqual(expect.arrayContaining(['1,030', '+170', '1,408', '合計の増減の内訳（億円、2021→2025）']));
    // データは変えない
    expect(table.dataset).toBe(s.dataset);
  });
  it('伸び率：CAGR の表（既定）⇄ 伸び率の横棒', async () => {
    const s = withSide(base('line'), 'cagr');
    const bars = { ...s, controls: { ...s.controls, side_form: 'bars' } };
    expect(toViewSpec(bars).panels.find((p) => p.id !== 'main')).toMatchObject({ kind: 'chart', chart: 'variance_bar', controls: { side_measure: 'cagr' } });
    expect(await texts(bars)).toEqual(expect.arrayContaining(['20.4%', '13.8%', 'CAGR（2021→2025）']));
  });
  it('ウォーターフォールは、項目が全体を構成する時だけ。合計の列と合わなければ使えない', async () => {
    const { formBlock } = await import('./sides');
    const rate = { ...base('line'), dataset: { ...TREND_SAMPLE, unit: '%' } as BuilderState['dataset'] };
    expect(formBlock(rate, 'waterfall')).toBe('not_parts');
    const withTotal = { ...base('stacked_column'), dataset: { ...TREND_SAMPLE, cols: ['A', 'B', '合計'], periods: { current: { label: 'x', values: [[1, 2, 3], [2, 2, 9]] }, base: { label: 'b', values: [[null, null, null], [null, null, null]] } }, rows: ['2024', '2025'] } as BuilderState['dataset'] };
    expect(formBlock(withTotal, 'waterfall')).toBe('not_reconciled');
    expect(formBlock(base('stacked_column'), 'waterfall')).toBeNull();
  });
});

describe('左右の幅（お皿の構成）', () => {
  it('既定は主役 2/3。左右 1/2 を選べ、2つの指標の比較は最初から 1/2', async () => {
    const s = withSide(base('stacked_100'), 'delta');
    expect(toViewSpec(s).layout.ratios).toEqual([0.67]);
    expect(toViewSpec({ ...s, controls: { ...s.controls, side_ratio: 'half' } }).layout.ratios).toEqual([0.5]);
    const pair = withSide(base('bar_rank'), 'metric2');
    expect(toViewSpec(pair).layout.ratios).toEqual([0.5]);
  });
  it('CAGR の表で開始・終了も出す時（列が多い）は、自動で 1/2', () => {
    const s = withSide(base('line'), 'cagr');
    expect(toViewSpec({ ...s, controls: { ...s.controls, cagr_table_cols: 'all' } }).layout.ratios).toEqual([0.5]);
    expect(toViewSpec(s).layout.ratios).toEqual([0.67]);
  });
  it('幅で上限が変わる：1/2 なら棒は8項目まで', async () => {
    const { sideOverflow } = await import('./sides');
    const seven = { ...base('stacked_column'), dataset: { ...TREND_SAMPLE, cols: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], periods: { current: { label: 'x', values: TREND_SAMPLE.periods.current.values.map((r) => [...r, 1, 2]) }, base: TREND_SAMPLE.periods.base } } as BuilderState['dataset'] };
    const d = withSide(seven, 'delta');
    expect(sideOverflow(d, 'delta')).toEqual({ count: 7, max: 6 });
    expect(sideOverflow({ ...d, controls: { ...d.controls, side_ratio: 'half' } }, 'delta')).toBeNull();
  });
});

describe('順位の横棒の右：数値だけ・順位の基準', () => {
  const run = async (st: BuilderState) => {
    const { composeSlide } = await import('@/engine/layout/compose');
    return composeSlide(toViewSpec(st), st.dataset as never).items;
  };
  it('数値だけ：右に棒を描かず、数字だけを左の行にそろえる', async () => {
    const { formsFor } = await import('./sides');
    const s = withSide(base('bar_rank'), 'delta');
    expect(formsFor(s, 'delta')).toEqual(['bars', 'numbers']);
    const bars = (await run(s)).filter((i) => i.kind === 'box' && i.x > 8).length;
    const nums = await run({ ...s, controls: { ...s.controls, side_form: 'numbers' } });
    expect(bars).toBeGreaterThan(0);
    expect(nums.filter((i) => i.kind === 'box' && i.x > 8)).toHaveLength(0);
    expect(nums.some((i) => i.kind === 'text' && i.lines.some((l) => l.t === '+48'))).toBe(true);
  });
  it('2つの指標：右の指標の順位で行を並べられる（棒は左の指標の値のまま）', async () => {
    const s = withSide(base('bar_rank'), 'metric2');
    const order = async (st: BuilderState) => (await run(st)).filter((i): i is Extract<typeof i, { kind: 'text' }> => i.kind === 'text' && i.x < 1.5 && ['北米', '中国', '欧州', '日本', '東南アジア'].includes(i.lines[0]?.t ?? ''))
      .sort((a, b) => a.y - b.y).map((i) => i.lines[0]!.t);
    const first = await order(s);
    const second = await order({ ...s, controls: { ...s.controls, rank_basis: 'second' } });
    expect(first[0]).toBe('北米');
    expect(second).not.toEqual(first);
  });
});

describe('上下構成（右 1/3 に収まらない時）', () => {
  const many = (): BuilderState => {
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const values = [[10, 20, 30, 40, 50, 60, 70, 80, 90], [12, 25, 31, 44, 50, 66, 71, 90, 95]];
    return { ...base('stacked_column'), dataset: { ...TREND_SAMPLE, rows: ['2021', '2025'], cols, periods: { current: { label: 'x', values }, base: { label: 'b', values: values.map((r) => r.map(() => null)) } } } as BuilderState['dataset'] };
  };
  it('上下に並べると、主役が上・付け合わせが下。下は縦の棒で項目を横に並べる。上限は12項目', async () => {
    const { sideOverflow } = await import('./sides');
    const s = withSide(many(), 'delta');
    expect(sideOverflow(s, 'delta')).toEqual({ count: 9, max: 6 });
    const st = { ...s, controls: { ...s.controls, side_ratio: 'stacked' } };
    expect(sideOverflow(st, 'delta')).toBeNull();
    const v = toViewSpec(st);
    expect(v.layout.id).toBe('p02_top_bottom');
    expect(v.panels.map((p) => p.slot)).toEqual(['top', 'bottom']);
    expect(v.panels[1]!.controls?.orientation).toBe('vertical');
    const { composeSlide } = await import('@/engine/layout/compose');
    expect(() => composeSlide(v, st.dataset as never)).not.toThrow();
  });
  it('表は下の段で横向き（項目が列に並ぶ）', async () => {
    const s = withSide(many(), 'cagr');
    const st = { ...s, controls: { ...s.controls, side_ratio: 'stacked' } };
    const { composeSlide } = await import('@/engine/layout/compose');
    const table = composeSlide(toViewSpec(st), st.dataset as never).items.find((i) => i.kind === 'table');
    expect(table && table.kind === 'table' && table.rows[0]!.length).toBe(10); // 見出し＋9項目
  });
  it('順位の横棒の右（行をそろえる）は上下にしない', async () => {
    const { canStack } = await import('./sides');
    expect(canStack(base('bar_rank'), 'delta')).toBe(false);
  });
});
