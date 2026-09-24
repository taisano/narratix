import { describe, expect, it } from 'vitest';
import { composeSlide, IMPLEMENTED_CHARTS } from '@/engine';
import { registry } from '@/registry';
import { initialState, normalizeState, sampleFor, toDataset, toViewSpec, validateState, viewAxes, type BuilderState } from './state';

const bools = [true, false];

describe('Mekko の複合構成（保存形式 v1 の頃と同じ ViewSpec）', () => {
  for (const showTotal of bools) for (const aligned of bools) for (const delta of bools) {
    it(`合計棒=${showTotal} 表=${aligned} 増減=${delta} が検証を通って描ける`, () => {
      const s0 = initialState();
      const s: BuilderState = { ...s0, mekko: { ...s0.mekko, showTotal }, complements: { aligned_table: aligned, delta_labels: delta } };
      const r = validateState(s);
      expect(r.issues).toEqual([]);
      const scene = composeSlide(r.spec!, toDataset(s));
      expect(scene.items.some((i) => i.kind === 'table')).toBe(aligned);
    });
  }

  it('比較期間が空なら、比較期間を使う部品は警告になり、左の合計棒は現在だけ', () => {
    const s = initialState();
    s.dataset.periods.base.values = s.dataset.periods.base.values.map((r) => r.map(() => null));
    expect(toDataset(s).periods.base).toBeUndefined();
    const r = validateState(s);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain('requires_base');
    const total = toViewSpec(s).panels.find((p) => p.id === 'total')!;
    expect(total.transform).toContainEqual({ type: 'select_periods', periods: ['current'] });
  });

  it('消した列の成長率行・強調は無視する', () => {
    const s0 = initialState();
    const s: BuilderState = { ...s0, controls: { ...s0.controls, highlight: '存在しない' }, mekko: { ...s0.mekko, growthRows: ['series:存在しない'] } };
    const spec = toViewSpec(s);
    expect(spec.panels.find((p) => p.id === 'growth')).toBeUndefined();
    expect(spec.panels.find((p) => p.id === 'main')!.controls).not.toHaveProperty('highlight');
    expect(validateState(s).ok).toBe(true);
  });
});

describe('保存形式 v1 → v2 の自動変換', () => {
  const v1 = {
    version: 1, dataset: initialState().dataset, title: 'T', source: 'S', showTotal: false, alignedTable: true,
    growthMode: 'period', growthRows: ['market'], deltaLabels: false, labels: 'abs', sortBySize: false, highlight: 'デュアル', slideLocale: 'en',
  };
  it('Mekko のチャートとして、同じ設定で開ける', () => {
    const s = normalizeState(v1)!;
    expect(s.version).toBe(2);
    expect(s.chart).toBe('mekko');
    expect(s.controls).toEqual({ mekko_labels: 'abs', sort_by_size: false, highlight: 'デュアル' });
    expect(s.complements).toEqual({ aligned_table: true, delta_labels: false });
    expect(s.mekko).toEqual({ showTotal: false, growthMode: 'period', growthRows: ['market'] });
    expect(validateState(s).ok).toBe(true);
    const spec = toViewSpec(s);
    expect(spec.panels.map((p) => p.id)).toEqual(['main', 'growth']);
    expect(spec.slideLocale).toBe('en');
  });
  it('壊れた値は null', () => {
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState({ version: 3 })).toBeNull();
    expect(normalizeState({ ...initialState(), chart: 'pie' })).toBeNull();
  });
});

describe('どのチャートに切り替えても、検証を通って描ける（行と列の入れ替えも）', () => {
  for (const chart of IMPLEMENTED_CHARTS) {
    for (const axis of ['normal', 'swapped']) {
      it(`${chart} / ${axis}`, () => {
        const purpose = registry.charts[chart].purpose;
        const s: BuilderState = { ...initialState(), ...sampleFor(purpose), chart, controls: { axis_swap: axis, mekko_labels: 'pct', gridlines: 'light' } };
        const r = validateState(s);
        expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(() => composeSlide(r.spec!, toDataset(s))).not.toThrow();
        // そのチャートに効かない設定は ViewSpec に入らない
        const main = r.spec!.panels.find((p) => p.id === 'main')!;
        if (chart !== 'mekko') expect(main.controls).not.toHaveProperty('mekko_labels');
      });
    }
  }
});

describe('行と列の入れ替えと絞り込み', () => {
  it('入れ替えると、チャートから見た行と列が逆になる（データは変えない）', () => {
    const s: BuilderState = { ...initialState(), ...sampleFor('trend'), chart: 'line', controls: { axis_swap: 'swapped' } };
    expect(viewAxes(s).rows).toEqual(s.dataset.cols);
    expect(viewAxes(s).cols).toEqual(s.dataset.rows);
    expect(toDataset(s).rows).toEqual(s.dataset.rows);
  });
  it('表示する行・列を絞ると、候補も絞られる。全部選んでいれば絞らない', () => {
    const base = { ...initialState(), ...sampleFor('trend'), chart: 'line' as const };
    const s: BuilderState = { ...base, controls: { items: ['2024', '2025'], series: base.dataset.cols } };
    expect(viewAxes(s).rows).toEqual(['2024', '2025']);
    const main = toViewSpec(s).panels[0]!;
    expect(main.controls).toEqual({ items: ['2024', '2025'] });
  });
  it('比較の対象は、今の行にない値なら使わない（既定の最後の行になる）', () => {
    const s: BuilderState = { ...initialState(), ...sampleFor('comparison'), chart: 'bar_rank', controls: { compare_target: '北米' } };
    expect(toViewSpec(s).panels[0]!.controls).not.toHaveProperty('compare_target');
    const swapped: BuilderState = { ...s, controls: { compare_target: '北米', axis_swap: 'swapped' } };
    expect(toViewSpec(swapped).panels[0]!.controls).toMatchObject({ compare_target: '北米' });
  });
});
