import { describe, expect, it } from 'vitest';
import goldenJson from '../__fixtures__/reference-mekko.json';
import { mekkoModel } from '../model/mekko';
import { fromDataset, periodYears, type Matrix } from './matrix';
import { aggregateRows, applyTransforms, deltaShare, filter, growth, selectPeriods, share, sort } from './ops';
import { goldenDataset, type GoldenCase } from '../test-helpers';

type G = GoldenCase;
const golden = goldenJson as unknown as Record<'default' | 'period_mode' | 'highlight_dual' | 'no_table' | 'input_order_no_pt', G>;

const matrixOf = (g: G): Matrix => fromDataset(goldenDataset(g.state));

describe('見本（mekko-builder.html）と同じ数値になる', () => {
  for (const [name, g] of Object.entries(golden)) {
    it(`${name}: Mekko の列（幅・構成比）`, () => {
      const model = mekkoModel(matrixOf(g), { sortBySize: g.state.sortBySize });
      expect(model.columns.map((c) => c.name)).toEqual(g.model.regs.map((r) => r.name));
      model.columns.forEach((c, i) => {
        const r = g.model.regs[i]!;
        expect(c.tot).toBe(r.tot);
        expect(c.totB).toBe(r.totB);
        expect(c.share).toBeCloseTo(r.share, 12);
        c.mix.forEach((v, k) => expect(v).toBeCloseTo(r.mix[k]!, 12));
        c.mixB.forEach((v, k) => expect(v).toBeCloseTo(r.mixB[k]!, 12));
      });
      expect(model.missingBase).toEqual(g.model.missing);
    });

    it(`${name}: 成長率（市場全体と形状別）`, () => {
      const m = matrixOf(g);
      const keys = ['market', ...g.state.shapes.map((s) => `series:${s}`)];
      const gr = growth(m, g.state.mode, keys);
      expect(gr.growth?.useCagr).toBe(g.model.useCagr);
      g.model.regs.forEach((r) => {
        const col = gr.cols.indexOf(r.name);
        expect(gr.current.values[0]![col]).toBeCloseTo(r.gMarket!, 12);
        r.gShape.forEach((v, k) => expect(gr.current.values[k + 1]![col]).toBeCloseTo(v!, 12));
      });
    });
  }
});

const small: Matrix = {
  rows: ['A', 'B', 'C'],
  cols: ['x', 'y'],
  current: { label: '2025', values: [[30, 10], [0, 0], [5, 15]] },
  base: { label: '2021', values: [[20, 0], [10, 10], [0, 0]] },
};

describe('transform', () => {
  it('aggregate_rows は列ごとに合計する', () => {
    const a = aggregateRows(small, '全体');
    expect(a.rows).toEqual(['全体']);
    expect(a.current.values).toEqual([[35, 25]]);
    expect(a.base?.values).toEqual([[30, 10]]);
  });

  it('select_periods（両方）は期間を行にする', () => {
    const s = selectPeriods(aggregateRows(small, '全体'), ['base', 'current']);
    expect(s.rows).toEqual(['2021', '2025']);
    expect(s.current.values).toEqual([[30, 10], [35, 25]]);
    expect(s.base).toBeUndefined();
  });

  it('select_periods（両方）は複数行ではエラー', () => {
    expect(() => selectPeriods(small, ['base', 'current'])).toThrow();
  });

  it('share は合計0の行を0（比較期間は null）にする', () => {
    const s = share(small);
    expect(s.current.values[0]).toEqual([0.75, 0.25]);
    expect(s.current.values[1]).toEqual([0, 0]);
    expect(s.base?.values[2]).toEqual([null, null]);
  });

  it('delta_share は構成比の差', () => {
    const d = deltaShare(small);
    expect(d.current.values[0]![0]).toBeCloseTo(-0.25);
    expect(d.current.values[2]).toEqual([null, null]);
  });

  it('growth: 比較期間が0なら null、年が逆転していれば期間の伸び率', () => {
    const g = growth(small, 'cagr', ['market', 'series:y']);
    expect(g.current.values[0]![0]).toBeCloseTo(Math.pow(40 / 20, 1 / 4) - 1);
    expect(g.current.values[1]![0]).toBeNull(); // y の比較期間が0
    const rev = growth({ ...small, base: { ...small.base!, label: '2026' } }, 'cagr');
    expect(rev.growth?.useCagr).toBe(false);
    expect(rev.current.values[0]![0]).toBeCloseTo(40 / 20 - 1);
    expect(periodYears('FY21', '2025')).toBeNull();
  });

  it('filter / sort', () => {
    expect(filter(small, { top: 2 }).rows).toEqual(['A', 'C']);
    expect(filter(small, { cols: ['y'] }).current.values).toEqual([[10], [0], [15]]);
    expect(sort(small, 'total', 'asc').rows).toEqual(['B', 'C', 'A']);
  });

  it('applyTransforms は順に適用する（p05 の左の合計棒）', () => {
    const out = applyTransforms(small, [{ type: 'aggregate_rows' }, { type: 'select_periods', periods: ['base', 'current'] }], { total: '全体' });
    expect(out.rows).toEqual(['2021', '2025']);
  });
});
