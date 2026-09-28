import { describe, expect, it } from 'vitest';
import { reorder } from './ops';
import type { Matrix } from './matrix';

const m: Matrix = {
  rows: ['A', 'B', 'C', 'その他'], cols: ['x', 'y', 'z'],
  current: { label: '', values: [[1, 5, 1], [3, 1, 1], [2, 2, 9], [9, 9, 9]] },
};

describe('並べ方（think-cell と同じ4つ）', () => {
  it('項目：表の順・逆順・大きい順・小さい順。「その他」はいつも最後', () => {
    expect(reorder(m, 'rows', 'sheet', 'その他').rows).toEqual(['A', 'B', 'C', 'その他']);
    expect(reorder(m, 'rows', 'reverse', 'その他').rows).toEqual(['C', 'B', 'A', 'その他']);
    expect(reorder(m, 'rows', 'desc', 'その他').rows).toEqual(['C', 'A', 'B', 'その他']);
    expect(reorder(m, 'rows', 'asc', 'その他').rows).toEqual(['B', 'A', 'C', 'その他']);
    // 値も一緒に動く
    expect(reorder(m, 'rows', 'desc', 'その他').current.values[0]).toEqual([2, 2, 9]);
  });
  it('系列：合計で並べ、値の列も一緒に動く。同じ合計なら表の順', () => {
    const r = reorder(m, 'cols', 'desc');
    expect(r.cols).toEqual(['z', 'y', 'x']);
    expect(r.current.values[1]).toEqual([1, 1, 3]);
    expect(reorder({ ...m, current: { label: '', values: [[1, 1, 1]] }, rows: ['A'] }, 'cols', 'asc').cols).toEqual(['x', 'y', 'z']);
  });
});

import { composeSlide } from '../layout/compose';
import { registry, validateViewSpec, type ChartTypeId, type Dataset, type ViewSpec } from '@/registry';
import type { Scene, TextItem } from '../scene';

const texts = (s: Scene) => s.items.filter((i): i is TextItem => i.kind === 'text').flatMap((i) => i.lines.map((l) => l.t));
function slide(chart: ChartTypeId, d: Dataset, controls: Record<string, unknown>): Scene {
  const spec: ViewSpec = {
    datasetId: 't', layout: { id: 'p01_single' }, slide: { title: 'x', source: 's' }, slideLocale: 'ja',
    panels: [{ id: 'main', slot: 'main', kind: 'chart', chart, controls, inChartComplements: [] }],
  };
  const r = validateViewSpec(spec, d);
  expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return composeSlide(r.spec!, d);
}
const regions: Dataset = {
  schema: 'MATRIX_TIME_SERIES', unit: '億円', rows: ['日本', '北米', '欧州'], cols: ['製品A', '製品B'],
  periods: { current: { label: '2025', values: [[10, 5], [40, 30], [20, 1]] } },
};
const years: Dataset = { ...regions, rows: ['2023', '2024', '2025'] };

describe('積み上げ縦棒で並べ方を変える', () => {
  it('項目の大きい順：合計の大きい地域から横に並ぶ。系列の小さい順：凡例も小さい系列から', () => {
    const t = texts(slide('stacked_column', regions, { category_order: 'desc', segment_order: 'asc' }));
    expect([t.indexOf('北米'), t.indexOf('欧州'), t.indexOf('日本')]).toEqual([...[t.indexOf('北米'), t.indexOf('欧州'), t.indexOf('日本')]].sort((a, b) => a - b));
    expect(t.indexOf('製品B')).toBeLessThan(t.indexOf('製品A'));
  });
  it('横軸が年なら、項目の順は変えない', () => {
    const t = texts(slide('stacked_column', years, { category_order: 'desc' }));
    expect(t.indexOf('2023')).toBeLessThan(t.indexOf('2025'));
  });
  it('対象のチャートだけ（折れ線に項目の順は無い）', () => {
    expect(registry.controls.category_order.appliesTo).not.toContain('line');
    expect(registry.controls.segment_order.appliesTo).toContain('line');
  });
});
