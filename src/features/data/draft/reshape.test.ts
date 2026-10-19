import { describe, expect, it } from 'vitest';
import { DatasetSchema } from '@/registry';
import { proposalSvg } from '@/features/start/dishView';
import { inferRoles } from './infer';
import { reshape } from './reshape';
import { shapesOf } from './shape';
import { candidatesFor } from './candidates';
import * as F from './fixtures';

const run = (tsv: string, shape: Parameters<typeof reshape>[2]) => {
  const { table, profile } = F.load(tsv);
  const r = inferRoles(profile);
  if (r.status !== 'ok') throw new Error('needs_manual');
  return { table, map: r.map, res: reshape(table, r.map, shape) };
};
const okData = (x: ReturnType<typeof run>) => { if (!x.res.ok) throw new Error(x.res.reason); return x.res.dataset; };

describe('T-SHAPE：形の判定', () => {
  it('国別売上＝item_metric、時系列＝time_metric、7か国型＝item_metric と relation', () => {
    expect(shapesOf(run(F.ONE_METRIC_TSV, 'item_metric').map)).toEqual(['item_metric', 'exact_table']);
    expect(shapesOf(run(F.LONG_TSV, 'time_metric').map)).toEqual(['time_metric', 'exact_table']);
    expect(shapesOf(run(F.SEVEN_TSV, 'item_metric').map)).toEqual(['item_metric', 'relation', 'exact_table']);
    expect(shapesOf(run(F.ACTUAL_BUDGET_TSV, 'item_metric').map)).toContain('item_compare');
    expect(shapesOf(run(F.PERIOD_ACROSS_TSV, 'time_metric').map)).toContain('time_metric');
  });
});

describe('T-RESHAPE：組み替え（1a）', () => {
  it('国別売上 → 行＝指標名、列＝項目。値は元のセルのまま。Dataset として正しい', () => {
    const d = okData(run(F.ONE_METRIC_TSV, 'item_metric'));
    expect(d.rows).toEqual(['売上']);
    expect(d.cols).toEqual(['ZZ_ALAND', 'ZZ_BORDURIA', 'ZZ_CASCADIA', 'ZZ_DORNE']);
    expect(d.periods.current.values).toEqual([[120, 340, 210, 55]]);
    expect(DatasetSchema.safeParse(d).success).toBe(true);
  });
  it('7か国型：主指標（最初の水準指標＝CY Value Share）の列を、単位 % で写す。差分の列は主指標にしない', () => {
    const d = okData(run(F.SEVEN_TSV, 'item_metric'));
    expect(d.rows).toEqual(['CY Value Share']);
    expect(d.unit).toBe('%');
    expect(d.periods.current.values[0]).toEqual([21.2, 32.8, 18.5, 0.3, 0.1, 0, 0.2]);
  });
  it('縦持ち（月・商品・実績）→ 行＝月、列＝商品、値は実績', () => {
    const d = okData(run(F.LONG_TSV, 'time_metric'));
    expect(d.rows).toEqual(['2025年1月', '2025年2月', '2025年3月']);
    expect(d.cols).toEqual(['ZZ_PRODUCT_ALPHA', 'ZZ_PRODUCT_BETA']);
    expect(d.periods.current.values).toEqual([[1200, 800], [1350, 760], [1500, 910]]);
    expect(DatasetSchema.safeParse(d).success).toBe(true);
  });
  it('横持ち（月×国）→ 行＝月、列＝国のまま', () => {
    const d = okData(run(F.WIDE_TSV, 'time_metric'));
    expect(d.rows).toHaveLength(4);
    expect(d.cols).toEqual(['ZZ_JAPAN', 'ZZ_USA', 'ZZ_GERMANY', 'ZZ_CLIENT_A']);
    expect(d.periods.current.values[0]).toEqual([120, 340, 210, 55]);
  });
  it('横に並んだ期間（商品×月）→ 行＝月、列＝商品（入れ替える）', () => {
    const d = okData(run(F.PERIOD_ACROSS_TSV, 'time_metric'));
    expect(d.rows).toEqual(['2025年1月', '2025年2月', '2025年3月']);
    expect(d.cols).toEqual(['ZZ_ITEM_ONE', 'ZZ_ITEM_TWO', 'ZZ_ITEM_THREE']);
    expect(d.periods.current.values).toEqual([[100, 200, 50], [110, 190, 55], [120, 210, 53]]);
  });
  it('同じ（月，系列）が2回あれば、合計せずに拒否する', () => {
    const x = run(`${F.LONG_TSV}\n2025年3月\tZZ_PRODUCT_BETA\t5\t5`, 'time_metric');
    expect(x.res).toEqual({ ok: false, reason: 'duplicate_keys' });
  });
  it('項目名が重複する国別売上は、推定の段階で手動指定に回り、ユーザーが指定しても組み替えは拒否する', () => {
    const { table, profile } = F.load('国\t売上\nZZ_A\t1\nZZ_A\t2');
    expect(inferRoles(profile).status).toBe('needs_manual');
    const map = { version: 1 as const, assignments: [{ col: 0, role: 'item' as const }, { col: 1, role: 'metric' as const, valueKind: 'level' as const }], source: 'user' as const };
    expect(reshape(table, map, 'item_metric')).toEqual({ ok: false, reason: 'duplicate_keys' });
  });
  it('期間が1つだけの時系列は拒否する', () => {
    const { table, profile } = F.load('月\t売上\n2025年1月\t1');
    const r = inferRoles(profile);
    if (r.status !== 'ok') return; // 推定で手動に回ってもよい
    expect(reshape(table, r.map, 'time_metric')).toEqual({ ok: false, reason: 'too_few_rows' });
  });
  it('段階1b・1c の形は、まだ作れないと明示する', () => {
    expect(run(F.SEVEN_TSV, 'relation').res).toEqual({ ok: false, reason: 'unsupported_shape' });
  });
  it('欠損は null のまま残り、知らせる（0にしない）', () => {
    const x = run('国\t売上\nZZ_A\t1\nZZ_B\t-\nZZ_C\t3', 'item_metric');
    expect(okData(x).periods.current.values).toEqual([[1, null, 3]]);
    expect(x.res.ok && x.res.notes).toContainEqual({ code: 'blank_values', n: 1 });
  });
  it('どの候補から作っても、元の表と列対応は変わらない（reshape は入力を変更しない）', () => {
    const { table, map } = run(F.SEVEN_TSV, 'item_metric');
    const t0 = JSON.stringify(table), m0 = JSON.stringify(map);
    reshape(table, map, 'item_metric'); reshape(table, map, 'time_metric');
    expect(JSON.stringify(table)).toBe(t0);
    expect(JSON.stringify(map)).toBe(m0);
  });
});

describe('実データで描かれる（完了条件）', () => {
  it('国別売上の1列から、横棒ランキングが実データで描かれる', () => {
    const svg = proposalSvg({ recipe: 'COMP_RANK' }, 'ja', okData(run(F.ONE_METRIC_TSV, 'item_metric')) as never);
    for (const n of ['ZZ_ALAND', 'ZZ_BORDURIA']) expect(svg).toContain(n);
  });
  it('縦棒（COMP_COLUMN）も同じデータで描かれる', () => {
    expect(proposalSvg({ recipe: 'COMP_COLUMN' }, 'ja', okData(run(F.ONE_METRIC_TSV, 'item_metric')) as never)).toContain('ZZ_CASCADIA');
  });
  it('月別売上から、折れ線と時系列縦棒が描かれる', () => {
    const d = okData(run(F.LONG_TSV, 'time_metric')) as never;
    expect(proposalSvg({ recipe: 'TREND_LINE' }, 'ja', d)).toContain('ZZ_PRODUCT_ALPHA');
    expect(proposalSvg({ recipe: 'TREND_COLUMN' }, 'ja', d)).toContain('ZZ_PRODUCT_BETA');
  });
  it('候補を切り替えても同じ Dataset を使う（AI は関与しない）', () => {
    const d = okData(run(F.WIDE_TSV, 'time_metric')) as never;
    expect(proposalSvg({ recipe: 'TREND_LINE' }, 'ja', d)).toContain('ZZ_JAPAN');
    expect(proposalSvg({ recipe: 'TREND_STACKED' }, 'ja', d)).toContain('ZZ_JAPAN');
  });
});

describe('T-CAND：候補の並びと理由コード（1a）', () => {
  const facts = (tsv: string, shape: Parameters<typeof reshape>[2]) => {
    const d = okData(run(tsv, shape));
    return { rows: d.rows.length, cols: d.cols.length, unit: d.unit, itemNames: shape === 'item_metric' ? d.cols : undefined };
  };
  it('項目比較：横棒が先頭（形の既定）。項目名が短く少数なら縦棒の理由は short_items', () => {
    const r = candidatesFor('item_metric', 'どこが多いか', facts(F.ONE_METRIC_TSV, 'item_metric'));
    expect(r.candidates).toEqual([{ recipe: 'COMP_RANK', reason: 'default_for_shape' }, { recipe: 'COMP_COLUMN', reason: 'short_items' }]);
  });
  it('長い項目名・多い項目では、縦棒の理由は default_for_shape', () => {
    const r = candidatesFor('item_metric', '', { rows: 1, cols: 20, itemNames: Array.from({ length: 20 }, (_, i) => `item${i}`) });
    expect(r.candidates[1]).toEqual({ recipe: 'COMP_COLUMN', reason: 'default_for_shape' });
  });
  it('質問が「大小を比べたい」なら縦棒が先頭になり、理由は question_fit。質問が無関係なら入れ替わらない', () => {
    const f = facts(F.ONE_METRIC_TSV, 'item_metric');
    expect(candidatesFor('item_metric', '大小を比べたい', f).candidates[0]).toEqual({ recipe: 'COMP_COLUMN', reason: 'question_fit' });
    expect(candidatesFor('item_metric', '何かを知りたい', f).candidates[0]!.recipe).toBe('COMP_RANK');
  });
  it('時系列：折れ線が先頭、次に時系列縦棒、複数系列なら積み上げ。質問が「内訳」なら積み上げが先頭', () => {
    const f = facts(F.WIDE_TSV, 'time_metric');
    expect(candidatesFor('time_metric', '', f).candidates.map((c) => c.recipe)).toEqual(['TREND_LINE', 'TREND_COLUMN', 'TREND_STACKED']);
    expect(candidatesFor('time_metric', '全体の内訳を見たい', f).candidates[0]).toEqual({ recipe: 'TREND_STACKED', reason: 'question_fit' });
  });
  it('系列が多すぎる・足せない値の候補は除き、理由を返す', () => {
    const many = candidatesFor('time_metric', '', { rows: 12, cols: 10, unit: '' });
    expect(many.excluded).toContainEqual({ recipe: 'TREND_COLUMN', why: 'too_many_series' });
    expect(many.excluded).toContainEqual({ recipe: 'TREND_STACKED', why: 'too_many_series' });
    const pct = candidatesFor('time_metric', '', { rows: 5, cols: 3, unit: '%' });
    expect(pct.excluded).toContainEqual({ recipe: 'TREND_STACKED', why: 'not_additive' });
    expect(pct.candidates.map((c) => c.recipe)).toEqual(['TREND_LINE', 'TREND_COLUMN']);
  });
  it('正確な値が主目的なら wantsExactTable（表は段階 1c）。同じ入力は同じ結果', () => {
    expect(candidatesFor('item_metric', '正確な数字がほしい', { rows: 1, cols: 3 }).wantsExactTable).toBe(true);
    const f = facts(F.LONG_TSV, 'time_metric');
    expect(candidatesFor('time_metric', 'q', f)).toEqual(candidatesFor('time_metric', 'q', f));
  });
});
