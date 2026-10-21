import { describe, expect, it } from 'vitest';
import { inferRoles } from './infer';
import { reshape } from './reshape';
import { shapesOf } from './shape';
import { buildDraft } from './session';
import { proposeDerived, withDerivedState, priorFrom } from './derive';
import * as F from './fixtures';

const TSV = ['国\t売上（億円）\t前年差（億円）', '日本\t120.5\t10.3', '米国\t98.2\t-4.1', '英国\t76.0\t2.2', '独国\t64.4\t0.4'].join('\n');

const load = () => {
  const { table, profile } = F.load(TSV);
  const r = inferRoles(profile);
  if (r.status !== 'ok') throw new Error('needs_manual');
  return { table, map: r.map };
};

describe('T-DERIVED：算出値の印と確認', () => {
  it('前年差だけの表：組を見つけるが、確認するまで比較の形は作らない', () => {
    const { table, map } = load();
    const specs = proposeDerived(table, map);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ kind: 'priorLevelFromDelta', confirmed: false });
    expect(shapesOf(map)).not.toContain('item_compare');
    const b = buildDraft(table, map, '前年と比べたい');
    expect(b.ok && b.sets.every((s) => s.shape !== 'item_compare')).toBe(true);
  });

  it('確認すると item_compare ができ、前年＝現在−差（算出の印つき）で、浮動小数の誤差が出ない', () => {
    const { table, map } = load();
    const m = { ...map, derived: withDerivedState(table, map).map((s) => ({ ...s, confirmed: true })), source: 'user' as const };
    expect(shapesOf(m)).toContain('item_compare');
    const r = reshape(table, m, 'item_compare');
    if (!r.ok) throw new Error(r.reason);
    expect(r.dataset.rows[0]).toBe('前年（算出）');
    expect(r.dataset.periods.current.values[0]).toEqual([110.2, 102.3, 73.8, 64]);
    expect(r.dataset.periods.current.values[1]).toEqual([120.5, 98.2, 76, 64.4]);
    expect(r.notes.some((n) => n.code === 'derived_prior')).toBe(true);
    const b = buildDraft(table, m, '前年と比べたい');
    expect(b.ok && b.sets.some((s) => s.shape === 'item_compare' && s.candidates.candidates.length > 0)).toBe(true);
  });

  it('確認状態は引き継がれ、確認を外すと比較の形は消える。比べる列が既にある表には出さない', () => {
    const { table, map } = load();
    const on = { ...map, derived: [{ kind: 'priorLevelFromDelta' as const, level: 1, delta: 2, confirmed: true }], source: 'user' as const };
    expect(withDerivedState(table, on)[0]!.confirmed).toBe(true);
    const off = { ...on, derived: on.derived.map((s) => ({ ...s, confirmed: false })) };
    expect(shapesOf(off)).not.toContain('item_compare');
    const { table: t2, map: m2 } = (() => { const { table, profile } = F.load(F.ACTUAL_BUDGET_TSV); const r = inferRoles(profile); if (r.status !== 'ok') throw new Error('x'); return { table, map: r.map }; })();
    expect(proposeDerived(t2, m2)).toEqual([]);
  });

  it('存在しない列を指す確認済みの組は使わない', () => {
    const { map } = load();
    const bad = { ...map, derived: [{ kind: 'priorLevelFromDelta' as const, level: 9, delta: 8, confirmed: true }] };
    expect(shapesOf(bad)).not.toContain('item_compare');
  });

  it('priorFrom：桁を丸めて返し、欠損は null', () => {
    expect(priorFrom(0.3, 0.1, 1)).toBe(0.2);
    expect(priorFrom(null, 1, 0)).toBeNull();
  });
});
