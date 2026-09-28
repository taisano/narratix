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

import { initialState, toDataset, toViewSpec, type BuilderState } from '@/features/editor/state';

describe('Mekko（編集画面と同じ構成：左の合計棒＋Mekko＋表）', () => {
  const sceneOf = (controls: Record<string, unknown>): Scene => {
    const s0 = initialState('ja');
    const s: BuilderState = { ...s0, chart: 'mekko', controls: { ...s0.controls, ...controls } };
    const r = validateViewSpec(toViewSpec(s), toDataset(s));
    return composeSlide(r.spec!, toDataset(s));
  };
  const mk = (controls: Record<string, unknown>): string[] => texts(sceneOf(controls));
  const s0 = initialState('ja');
  const segs = s0.dataset.cols;
  it('系列の順（表の逆順）で、凡例・積み上げの順が変わる（左の合計棒ではなく Mekko の設定を使う）', () => {
    const a = mk({}), b = mk({ segment_order: 'reverse' });
    const pos = (t: string[]) => segs.map((n) => t.indexOf(n));
    expect(pos(a)).not.toEqual(pos(b));
    expect(b.indexOf(segs[segs.length - 1]!)).toBeLessThan(b.indexOf(segs[0]!));
  });
  it('項目の順：未設定は古い「規模の大きい順」（既定オン）、オフなら表の順。小さい順も選べる', () => {
    const rows = s0.dataset.rows;
    // 列の名前の横位置で並びを見る
    const order = (c: Record<string, unknown>) => {
      const items = sceneOf(c).items.filter((i): i is TextItem => i.kind === 'text');
      const x = (n: string) => Math.min(...items.filter((i) => i.lines.some((l) => l.t === n)).map((i) => i.x + i.w / 2));
      return [...rows].sort((a, b) => x(a) - x(b));
    };
    expect(order({})).toEqual(order({ category_order: 'desc' }));
    expect(order({ sort_by_size: false })).toEqual(order({ category_order: 'sheet' }));
    expect(order({ category_order: 'sheet' })).toEqual(rows);
    // 小さい順：大きい順の逆（同じ合計の列は表の順のまま）
    const asc = order({ category_order: 'asc' }), desc = order({ category_order: 'desc' });
    expect(asc[asc.length - 1]).toBe(desc[0]);
    expect(asc.slice(2)).toEqual([...desc.slice(0, 3)].reverse());
  });
});
