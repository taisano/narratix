import { describe, expect, it } from 'vitest';
import { ADDITIVE, meaningIssues, metricOf } from './meaning';
import { hideNames } from './MeaningPanel';
import { checkPaste, DEFAULT_OPTIONS } from './dataCheck';
import { switchChart } from './chartSwitch';
import { initialState, type BuilderState } from './state';

const table = (chart: BuilderState['chart'], cols: string[], values: (number | null)[][], rows = ['北米', '欧州', '中国'], unit = ''): BuilderState => {
  const s = switchChart(initialState('ja'), chart).state;
  return { ...s, dataset: { ...s.dataset, unit, rows, cols, periods: { current: { label: '2025', values }, base: { label: '', values: values.map((r) => r.map(() => null)) } } } };
};
const codes = (s: BuilderState) => meaningIssues(s).map((i) => i.code);

describe('指標の種類', () => {
  it('名前と単位から、金額・率・人数・件数・指数・通貨を見分ける', () => {
    expect(metricOf('売上（億円）')).toMatchObject({ kind: 'amount', currency: 'JPY' });
    expect(metricOf('Revenue ($M)')).toMatchObject({ kind: 'amount', currency: 'USD' });
    expect(metricOf('粗利率').kind).toBe('rate');
    expect(metricOf('シェア').kind).toBe('rate');
    expect(metricOf('社員数').kind).toBe('people');
    expect(metricOf('店舗数').kind).toBe('count');
    expect(metricOf('NPS').kind).toBe('index');
    expect(metricOf('デュアル').kind).toBe('unknown');
  });
});

describe('合算の意味（足し合わせるチャートで、違う種類を足さない）', () => {
  const pairs: [string, string][] = [['売上（億円）', '粗利率'], ['売上（億円）', '売上（百万ドル）'], ['売上', '社員数'], ['売上', '店舗数'], ['市場規模', 'シェア'], ['顧客数', '満足度スコア']];
  for (const chart of ADDITIVE) {
    for (const [a, b] of pairs) {
      it(`${chart}：「${a}」＋「${b}」は重大（合算できない）。外す直し方がある`, () => {
        const s = table(chart, [a, b], [[120, 32], [100, 28], [80, 30]]);
        const i = meaningIssues(s).find((x) => x.code === 'mixed_sum');
        expect(i?.level).toBe('error');
        expect(i!.targets!.length).toBeGreaterThan(0);
        expect(i!.fixes!.some((f) => f.kind === 'hide')).toBe(true);
      });
    }
  }
  it('同じ種類（地域別の売上など）は問題にしない。見本のままも出さない', () => {
    expect(codes(table('stacked_column', ['北米売上', '欧州売上'], [[1, 2], [3, 4], [5, 6]]))).not.toContain('mixed_sum');
    for (const chart of ADDITIVE) expect(codes(switchChart(initialState('ja'), chart).state), chart).toEqual([]);
  });
  it('率を外すと、問題が消える。金額と率なら縦棒＋折れ線を勧める', () => {
    const s = table('mekko', ['売上（億円）', '粗利率'], [[120, 32], [100, 28], [80, 30]]);
    const i = meaningIssues(s).find((x) => x.code === 'mixed_sum')!;
    expect(i.fixes!.some((f) => f.kind === 'chart' && f.chart === 'combo')).toBe(true);
    expect(codes(hideNames(s, i.targets!))).not.toContain('mixed_sum');
  });
});

describe('単位・通貨', () => {
  it('同じ軸に円とドル', () => {
    expect(codes(table('line', ['売上（億円）', '売上（百万ドル）'], [[1, 2], [3, 4], [5, 6]], ['2023', '2024', '2025']))).toContain('mixed_currency');
  });
  it('同じ軸に率と金額', () => {
    expect(codes(table('column_trend', ['売上', '粗利率'], [[1, 2], [3, 4], [5, 6]], ['2023', '2024', '2025']))).toContain('mixed_axis');
  });
  it('スライドの単位（百万ドル）と列の単位（億円）が違う → 単位を変える直し方', () => {
    const i = meaningIssues(table('stacked_column', ['売上（億円）'], [[1], [2], [3]], ['2023', '2024', '2025'], '百万ドル')).find((x) => x.code === 'unit_mismatch')!;
    expect(i.fixes).toEqual([{ kind: 'unit', unit: '億円' }]);
  });
});

describe('チャート別の成立条件', () => {
  it('ウォーターフォール：始点＋増減が終点と合わない・途中の小計', () => {
    const s = table('waterfall', ['金額'], [[500], [80], [-45], [999]], ['前年', '価格', '数量', '今年']);
    const i = meaningIssues(s).find((x) => x.code === 'bridge_mismatch')!;
    expect(i.vars).toMatchObject({ calc: '535', end: '999', diff: '464' });
    expect(codes({ ...s, controls: { ...s.controls, mismatch: 'autofix_end' } })).toContain('bridge_fixed');
    expect(codes(table('waterfall', ['金額'], [[500], [80], [580], [-45], [535]], ['前年', '価格', '小計', '数量', '今年']))).toContain('bridge_subtotals');
    expect(codes(table('waterfall', ['金額'], [[500], [80], [-45], [535]], ['前年', '価格', '数量', '今年']))).toEqual([]);
  });
  it('バブル：大きさが 0・マイナス・空', () => {
    const s = table('bubble', ['成長率', '利益率', '売上'], [[5, 10, 100], [3, 8, -5], [4, 9, null]], ['A', 'B', 'C']);
    expect(meaningIssues(s).find((x) => x.code === 'bubble_size')!.targets).toEqual(['B', 'C']);
  });
  it('CAGR：始点が 0 以下・年の間が空いている。暦年と年度の混在', () => {
    let s = table('line', ['A', 'B'], [[0, 10], [5, 12], [8, 15]], ['2021', '2023', '2025']);
    s = { ...s, complements: { ...s.complements, cagr_note: true } };
    expect(codes(s)).toEqual(expect.arrayContaining(['cagr_start', 'year_gap']));
    expect(codes(table('line', ['A'], [[1], [2], [3]], ['2023', 'FY2024', '2025']))).toContain('fiscal_mix');
  });
  it('Mekko：合計が 0 の項目', () => {
    expect(codes(table('mekko', ['シングル', 'デュアル'], [[1, 2], [0, 0], [3, 4]]))).toContain('zero_total');
  });
});

describe('貼り付けの時に照らし合わせる', () => {
  const ctx = { additive: true, chartName: 'Mekko', unit: '百万ドル', source: '出典：旧データ', period: '2021–2025', prevRows: ['A社'], prevCols: ['x'] };
  const text = '地域\t売上\t粗利率\n北米\t120億円\t32%\n欧州\t100億円\t28%';
  it('足し合わせるチャートに金額と率 → 率の列を外して入れるのが既定。外さないことも選べる', () => {
    const r = checkPaste(text, DEFAULT_OPTIONS, ctx);
    expect(r.issues.find((i) => i.code === 'mixedSum')).toMatchObject({ level: 'confirm', option: 'dropMixed' });
    expect(r.table!.cols).toEqual(['売上']);
    expect(checkPaste(text, { ...DEFAULT_OPTIONS, dropMixed: false }, ctx).table!.cols).toEqual(['売上', '粗利率']);
  });
  it('単位が今のスライドと違う → 既定は表に合わせる。外すと今の単位のまま', () => {
    const r = checkPaste(text, DEFAULT_OPTIONS, ctx);
    expect(r.issues.find((i) => i.code === 'unitSync')!.vars).toEqual({ from: '百万ドル', to: '億円' });
    expect(r.summary.unit).toBe('億円');
    expect(checkPaste(text, { ...DEFAULT_OPTIONS, unitSync: false }, ctx).summary.unit).toBeNull();
  });
  it('列の名前の単位（売上（億円））も読む', () => {
    expect(checkPaste('地域\t売上（億円）\n北米\t120\n欧州\t100', DEFAULT_OPTIONS, ctx).summary.unit).toBe('億円');
  });
  it('まったく別のデータなら、出典・期間が前のままかもしれないと伝える', () => {
    expect(checkPaste(text, DEFAULT_OPTIONS, ctx).issues.map((i) => i.code)).toContain('staleMeta');
    expect(checkPaste(text, DEFAULT_OPTIONS, { ...ctx, prevRows: ['北米'] }).issues.map((i) => i.code)).not.toContain('staleMeta');
  });
});
