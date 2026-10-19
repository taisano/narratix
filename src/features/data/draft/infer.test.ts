import { describe, expect, it } from 'vitest';
import { inferRoles } from './infer';
import { relationBinding, primaryMetricOf, type Assignment } from './columnRoles';
import * as F from './fixtures';

const ok = (tsv: string) => {
  const r = inferRoles(F.load(tsv).profile);
  if (r.status !== 'ok') throw new Error(`needs_manual: ${r.reasons.join(',')}`);
  return r.map;
};
const roleOf = (a: Assignment[], col: number) => a.find((x) => x.col === col);

describe('T-INFER：規則による推定', () => {
  it('国別売上1列 → item + metric(level)', () => {
    const m = ok(F.ONE_METRIC_TSV);
    expect(m.source).toBe('rules');
    expect(roleOf(m.assignments, 0)?.role).toBe('item');
    expect(roleOf(m.assignments, 1)).toMatchObject({ role: 'metric', valueKind: 'level' });
    expect(m.time).toBeUndefined();
  });
  it('縦持ち時系列 → time(rows, month) + series + metric + compare(budget → 実績)', () => {
    const m = ok(F.LONG_TSV);
    expect(m.time).toEqual({ orientation: 'rows', at: [0], periodKind: 'month' });
    expect(roleOf(m.assignments, 1)?.role).toBe('series');
    expect(roleOf(m.assignments, 2)).toMatchObject({ role: 'metric', valueKind: 'level' });
    expect(roleOf(m.assignments, 3)).toMatchObject({ role: 'compare', compareKind: 'budget', compareOf: 2, valueKind: 'level' });
  });
  it('横持ち時系列（月×国）→ time(rows) + 同種の seriesValue。国名の見出しから役割を推定しない', () => {
    const m = ok(F.WIDE_TSV);
    expect(m.time?.orientation).toBe('rows');
    expect(m.assignments.map((a) => a.role)).toEqual(['seriesValue', 'seriesValue', 'seriesValue', 'seriesValue']);
  });
  it('列見出しが期間の表 → time(columns) + item', () => {
    const m = ok(F.PERIOD_ACROSS_TSV);
    expect(m.time).toEqual({ orientation: 'columns', at: [1, 2, 3], periodKind: 'month' });
    expect(m.assignments).toEqual([{ col: 0, role: 'item' }]);
  });
  it('実績と予算（項目別）→ compare は実在する水準列の時だけ', () => {
    const m = ok(F.ACTUAL_BUDGET_TSV);
    expect(roleOf(m.assignments, 2)).toMatchObject({ role: 'compare', compareOf: 1, compareKind: 'budget' });
  });
  it('7か国型：前年差ppは metric(deltaPoint)、compare にしない。前年水準は逆算しない', () => {
    const m = ok(F.SEVEN_TSV);
    expect(m.assignments.some((a) => a.role === 'compare')).toBe(false);
    expect(roleOf(m.assignments, 2)).toMatchObject({ role: 'metric', valueKind: 'deltaPoint', unit: 'pp' });
    expect(roleOf(m.assignments, 2)?.compareOf).toBeUndefined();
    expect(roleOf(m.assignments, 4)).toMatchObject({ role: 'metric', valueKind: 'growthRate' });
    expect(roleOf(m.assignments, 1)).toMatchObject({ role: 'metric', valueKind: 'level', unit: '%' });
    expect(roleOf(m.assignments, 6)?.role).toBe('group');
    expect(m.derived).toBeUndefined();
  });
  it('7か国型：主指標は元の列順で最初の水準指標（差分・率を理由なく選ばない）', () => {
    const m = ok(F.SEVEN_TSV);
    expect(primaryMetricOf(m)).toBe(1);
    const onlyDelta = { assignments: [{ col: 3, role: 'metric', valueKind: 'deltaPoint' }, { col: 5, role: 'metric', valueKind: 'level' }] as Assignment[] };
    expect(primaryMetricOf(onlyDelta)).toBe(5);
  });
  it('AI の主指標が有効ならそれを使い、不正なら列順のフォールバック', () => {
    const m = ok(F.SEVEN_TSV);
    expect(primaryMetricOf({ ...m, primaryMetric: 3 })).toBe(3);
    expect(primaryMetricOf({ ...m, primaryMetric: 0 })).toBe(1);
    expect(primaryMetricOf({ ...m, primaryMetric: 99 })).toBe(1);
  });
  it('関係の割り当て（X・Y・サイズ）は候補ごと。列の恒久的な役割ではない', () => {
    const m = ok(F.SEVEN_TSV);
    expect(m.assignments.every((a) => !['x', 'y', 'size'].includes(a.role))).toBe(true);
    const b = relationBinding({ ...m, hints: { secondaryMetric: 2, scaleMetric: 5 } });
    expect(b).toMatchObject({ x: 1, y: 2, size: 5 });
    // 同じ列対応から、ヒントを変えても共通の列対応は変わらない
    expect(relationBinding({ ...m, hints: { secondaryMetric: 3 } })).toMatchObject({ x: 1, y: 3 });
  });
  it('確信が低い時は埋めず needs_manual を返す', () => {
    expect(inferRoles(F.load('1\t2\n3\t4').profile)).toMatchObject({ status: 'needs_manual', reasons: ['no_row_labels'] }); // 行の名前も時間も無い
    expect(inferRoles(F.load('開始\t終了\t売上\n2025年1月\t2025年2月\t5\n2025年2月\t2025年3月\t6').profile)).toMatchObject({ status: 'needs_manual', reasons: ['multiple_time_columns'] });
    expect(inferRoles(F.load('国\t名前\nZZ_A\tq\nZZ_B\tw').profile).status).toBe('needs_manual'); // 数値の列が無い
    const budgets = inferRoles(F.load('商品\t実績A\t実績B\t予算\nZ1\t1\t2\t3\nZ2\t2\t3\t4').profile);
    expect(budgets.status).toBe('needs_manual'); // 予算の相手が決められない
    if (budgets.status === 'needs_manual') expect(budgets.reasons).toContain('compare_partner_unclear');
  });
  it('英語の見出しでも同じ推定（Budget / Actual）', () => {
    const m = ok('Product\tActual\tBudget\nZ1\t1\t2\nZ2\t2\t3');
    expect(roleOf(m.assignments, 2)).toMatchObject({ role: 'compare', compareOf: 1 });
  });
});
