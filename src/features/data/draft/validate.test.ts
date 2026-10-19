import { describe, expect, it } from 'vitest';
import { validateRoleMap } from './validate';
import { ColumnRoleMapSchema } from './columnRoles';
import * as F from './fixtures';

const base = { version: 1 as const };
const v = (tsv: string, input: unknown) => validateRoleMap(F.load(tsv).profile, input, 'ai');
const okMap = (r: ReturnType<typeof v>) => { if (r.status !== 'ok') throw new Error(`undetermined: ${r.reason}`); return r; };

describe('T-ROLE：列対応の検証', () => {
  it('正常：item + metric', () => {
    const r = okMap(v(F.ONE_METRIC_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }] }));
    expect(r.dropped).toEqual([]);
    expect(r.map.source).toBe('ai');
    expect(r.map.assignments[1]).toMatchObject({ role: 'metric', valueKind: 'level' });
    expect(ColumnRoleMapSchema.safeParse(r.map).success).toBe(true);
  });
  it('item が2列 → 後の割り当てを捨てる', () => {
    const r = okMap(v(F.SEVEN_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 6, role: 'item' }, { col: 1, role: 'metric' }] }));
    expect(r.dropped).toContainEqual({ col: 6, reason: 'extra_item' });
  });
  it('文字の列を metric にしたら捨てる', () => {
    const r = okMap(v(F.SEVEN_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 6, role: 'metric' }, { col: 1, role: 'metric' }] }));
    expect(r.dropped).toContainEqual({ col: 6, reason: 'not_numeric' });
  });
  it('範囲外の列番号・重複した列は捨てる', () => {
    const r = okMap(v(F.ONE_METRIC_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }, { col: 1, role: 'metric' }, { col: 7, role: 'metric' }] }));
    expect(r.dropped).toContainEqual({ col: 1, reason: 'duplicate_col' });
    expect(r.dropped).toContainEqual({ col: 7, reason: 'out_of_range' });
  });
  it('zod の形が不正（列番号が負・未知のキー・未知の役割）は全体を判断不能にする', () => {
    for (const bad of [
      { ...base, assignments: [{ col: -1, role: 'item' }] },
      { ...base, assignments: [{ col: 0, role: 'item', extra: 1 }] },
      { ...base, assignments: [{ col: 0, role: 'x' }] },
      { ...base, assignments: 'oops' },
      null, 'not json', { version: 2, assignments: [] },
    ]) {
      const r = v(F.ONE_METRIC_TSV, bad);
      expect(r).toMatchObject({ status: 'undetermined', reason: 'schema' });
    }
  });
  it('AI が数値や項目名を入れようとしても、スキーマが受けない（notes 以外に自由文は無い）', () => {
    expect(v(F.ONE_METRIC_TSV, { ...base, assignments: [{ col: 1, role: 'metric', value: 123 }] })).toMatchObject({ status: 'undetermined' });
  });
  it('compare：相手が無ければ、水準の指標に戻す（逆算しない）', () => {
    const r = okMap(v(F.SEVEN_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 2, role: 'compare', compareKind: 'priorYear', valueKind: 'deltaPoint' }, { col: 1, role: 'metric' }] }));
    const a = r.map.assignments.find((x) => x.col === 2)!;
    expect(a.role).toBe('metric');
    expect(a.valueKind).toBe('deltaPoint');
    expect(r.dropped).toContainEqual({ col: 2, reason: 'compare_not_level' });
    expect(a.compareOf).toBeUndefined();
  });
  it('compare：compareOf が無くても、同じ単位の水準の指標が1つなら結ぶ。結べなければ metric に戻す', () => {
    const r = okMap(v(F.ACTUAL_BUDGET_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }, { col: 2, role: 'compare', compareKind: 'budget' }] }));
    expect(r.map.assignments[2]).toMatchObject({ role: 'compare', compareOf: 1 });
    const r2 = okMap(v(F.ACTUAL_BUDGET_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 2, role: 'compare', compareKind: 'budget' }, { col: 1, role: 'metric', valueKind: 'deltaAbsolute' }] }));
    expect(r2.map.assignments.find((a) => a.col === 2)).toMatchObject({ role: 'metric' });
    expect(r2.dropped).toContainEqual({ col: 2, reason: 'compare_no_partner' });
  });
  it('単位はコードが決める（AI の単位は使わない）。pp の列に level と言われたら deltaPoint に直す', () => {
    const r = okMap(v(F.SEVEN_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 2, role: 'metric', valueKind: 'level', unit: 'USD' }] }));
    expect(r.map.assignments[1]).toMatchObject({ unit: 'pp', valueKind: 'deltaPoint' });
  });
  it('時間：rows は期間の列だけ。期間でない列を指したら time を捨てる', () => {
    const r = okMap(v(F.LONG_TSV, { ...base, time: { orientation: 'rows', at: [1], periodKind: 'month' }, assignments: [{ col: 2, role: 'metric' }] }));
    expect(r.map.time).toBeUndefined();
    expect(r.dropped).toContainEqual({ col: 1, reason: 'not_time_like' });
  });
  it('時間：columns の対象列に、別の役割は付けられない（time が優先）', () => {
    const r = okMap(v(F.PERIOD_ACROSS_TSV, { ...base, time: { orientation: 'columns', at: [1, 2, 3], periodKind: 'month' }, assignments: [{ col: 0, role: 'item' }, { col: 2, role: 'metric' }] }));
    expect(r.map.time).toMatchObject({ orientation: 'columns', at: [1, 2, 3] });
    expect(r.dropped).toContainEqual({ col: 2, reason: 'covered_by_time' });
    expect(r.map.assignments.map((a) => a.role)).toEqual(['item']);
  });
  it('時間：assignments に role: time があれば、time が無い時だけ採る', () => {
    const r = okMap(v(F.LONG_TSV, { ...base, assignments: [{ col: 0, role: 'time' }, { col: 2, role: 'metric' }] }));
    expect(r.map.time).toEqual({ orientation: 'rows', at: [0], periodKind: 'month' });
  });
  it('主指標・ヒントが指標の列でなければ捨てる', () => {
    const r = okMap(v(F.SEVEN_TSV, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }], primaryMetric: 0, hints: { secondaryMetric: 99 } }));
    expect(r.map.primaryMetric).toBeUndefined();
    expect(r.dropped).toContainEqual({ col: 0, reason: 'bad_primary' });
    expect(r.dropped).toContainEqual({ col: 99, reason: 'bad_hint' });
  });
  it('seriesValue は同じ型・単位だけ。食い違いは捨てる', () => {
    const r = okMap(v('月\tA\tB\n2025年1月\t1\t50%\n2025年2月\t2\t60%', { ...base, time: { orientation: 'rows', at: [0], periodKind: 'month' }, assignments: [{ col: 1, role: 'seriesValue' }, { col: 2, role: 'seriesValue' }] }));
    expect(r.dropped).toContainEqual({ col: 2, reason: 'unit_mismatch' });
  });
  it('全部が捨てられたら判断不能（推定→手動指定へ）', () => {
    expect(v(F.SEVEN_TSV, { ...base, assignments: [{ col: 6, role: 'metric' }, { col: 50, role: 'metric' }] })).toMatchObject({ status: 'undetermined', reason: 'no_metric' });
  });
  it('ユーザーの指定は source: user のまま通る', () => {
    const r = validateRoleMap(F.load(F.ONE_METRIC_TSV).profile, { ...base, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }] }, 'user');
    expect(okMap(r).map.source).toBe('user');
  });
});
