import { describe, expect, it } from 'vitest';
import { composeSlide } from '@/engine';
import { initialState, toDataset, toViewSpec, validateState, type BuilderState } from './state';

const bools = [true, false];

describe('ビルダーの状態 → ViewSpec', () => {
  for (const showTotal of bools) for (const alignedTable of bools) for (const deltaLabels of bools) {
    it(`合計棒=${showTotal} 表=${alignedTable} 増減=${deltaLabels} が検証を通って描ける`, () => {
      const s: BuilderState = { ...initialState(), showTotal, alignedTable, deltaLabels };
      const r = validateState(s);
      expect(r.issues).toEqual([]);
      const scene = composeSlide(r.spec!, toDataset(s));
      expect(scene.items.some((i) => i.kind === 'table')).toBe(alignedTable);
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
    const s = { ...initialState(), highlight: '存在しない', growthRows: ['series:存在しない'] };
    const spec = toViewSpec(s);
    expect(spec.panels.find((p) => p.id === 'growth')).toBeUndefined();
    expect(spec.panels.find((p) => p.id === 'main')!.controls).not.toHaveProperty('highlight');
    expect(validateState(s).ok).toBe(true);
  });
});
