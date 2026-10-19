import { describe, expect, it } from 'vitest';
import { analyzeTable, buildDraft, loadDraft, manualRoles, resolveRoles, setFor } from './session';
import * as F from './fixtures';
import type { AiRoleResponse } from './columnRoles';

const ai = (a: AiRoleResponse['assignments']): AiRoleResponse => ({ version: 1, assignments: a });

describe('下書きの流れ（AI → 規則 → 手動）', () => {
  it('AI の列対応が有効ならそれを使う（source: ai）', () => {
    const a = analyzeTable(F.ONE_METRIC_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, ai([{ col: 0, role: 'item' }, { col: 1, role: 'metric' }]));
    expect(r).toMatchObject({ status: 'ready', map: { source: 'ai' } });
  });
  it('AI が無い・不正・全部捨てられた時は、規則による推定（source: rules）に戻る', () => {
    const a = analyzeTable(F.ONE_METRIC_TSV); if (!a.ok) throw new Error();
    for (const bad of [null, undefined, { version: 9 } as never, ai([{ col: 99, role: 'metric' }])]) {
      expect(resolveRoles(a.profile, bad)).toMatchObject({ status: 'ready', map: { source: 'rules' } });
    }
  });
  it('規則でも決められない時は手動指定へ。手動指定は検証して source: user', () => {
    const a = analyzeTable('1\t2\n3\t4'); if (!a.ok) throw new Error();
    expect(resolveRoles(a.profile, null)).toMatchObject({ status: 'needs_manual', reasons: ['no_row_labels'] });
    const m = manualRoles(a.profile, { version: 1, assignments: [{ col: 0, role: 'metric' }, { col: 1, role: 'metric' }] });
    expect(m).toMatchObject({ status: 'ready', map: { source: 'user' } });
  });
  it('読めない表は理由を返す（黙って一部だけ読まない）', () => {
    expect(analyzeTable('')).toEqual({ ok: false, reason: 'empty' });
    expect(analyzeTable('   \n  ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('国別売上：Dataset と候補（横棒が先頭）。再読み込みしても同じ結果で、AI は要らない', () => {
    const a = analyzeTable(F.ONE_METRIC_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, '');
    expect(b).toMatchObject({ ok: true, shape: 'item_metric' });
    expect(b.ok && b.candidates.candidates[0]).toEqual({ recipe: 'COMP_RANK', reason: 'default_for_shape' });
    const again = loadDraft({ tsv: F.ONE_METRIC_TSV, map: r.map, shape: 'item_metric', question: '' });
    expect(again.ok && again.dataset).toEqual(b.ok && b.dataset);
  });
  it('月別の売上：形は time_metric、折れ線が先頭', () => {
    const a = analyzeTable(F.LONG_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, '');
    expect(b).toMatchObject({ ok: true, shape: 'time_metric' });
    expect(b.ok && b.candidates.candidates[0]!.recipe).toBe('TREND_LINE');
  });
  it('当てはまる形が無い列対応は no_shape（黙って別の形にしない）', () => {
    const a = analyzeTable(F.SEVEN_TSV); if (!a.ok) throw new Error();
    // item のない列対応
    expect(buildDraft(a.table, { version: 1, assignments: [{ col: 1, role: 'metric' }, { col: 2, role: 'metric', valueKind: 'deltaPoint' }], source: 'user' }, '')).toEqual({ ok: false, reason: 'no_shape' });
  });
  it('列対応が無い下書きは no_map', () => {
    expect(loadDraft({ tsv: F.ONE_METRIC_TSV, map: null, shape: null, question: '' })).toEqual({ ok: false, reason: 'no_map' });
  });
  it('実績と予算：形は2つ（実績と比較先の差 → 項目の大小）。差の候補が先頭で、選んだ候補に合う元データを返す', () => {
    const a = analyzeTable(F.ACTUAL_BUDGET_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, '');
    if (!b.ok) throw new Error();
    expect(b.sets.map((s) => s.shape)).toEqual(['item_compare', 'item_metric']);
    expect(b.sets[0]!.candidates.candidates.map((c) => c.recipe)).toEqual(['COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA']);
    expect(b.sets[0]!.candidates.candidates[0]!.reason).toBe('compare_pair');
    expect(setFor(b.sets, 'COMP_VARIANCE')!.dataset.rows).toEqual(['予算', '実績']);
    expect(setFor(b.sets, 'COMP_RANK')!.dataset.rows).toEqual(['実績']);
  });
  it('7か国型：項目の大小 → 関係（関係は最後）。切り替えても列対応は同じで AI は要らない', () => {
    const a = analyzeTable(F.SEVEN_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, '');
    if (!b.ok) throw new Error();
    expect(b.sets.map((s) => s.shape)).toEqual(['item_metric', 'relation']);
    expect(setFor(b.sets, 'REL_BUBBLE')!.dataset.schema).toBe('BUBBLE');
  });
});
