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
  it('基本表の元データ（exact_table）：行＝項目、列＝数値の列すべて（貼った順。単位は見出しに）。値は丸めない', () => {
    const d = okData(run('商品\t客単価（円）\t粗利率\nZZ_A\t1200.5\t12.55%\nZZ_B\t900\t8.1%\nZZ_C\t640\t10%', 'exact_table'));
    expect(d.rows).toEqual(['ZZ_A', 'ZZ_B', 'ZZ_C']);
    expect(d.cols.length).toBe(2);
    expect(d.cols[0]).toContain('客単価');
    expect(d.cols[1]).toContain('粗利率');
    expect(d.periods.current.values[0]).toEqual([1200.5, 12.55]);
  });
  it('項目の無い表・時間のある表では exact_table は作らない', () => {
    expect(run('月\t売上\n1月\t1\n2月\t2\n3月\t3', 'exact_table').res.ok).toBe(false);
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

/** グラフの候補だけ（正確な数値の表は別に確認する） */
const noTables = <T extends { recipe: string }>(xs: T[]): T[] => xs.filter((c) => !c.recipe.startsWith('TABLE_'));

describe('T-CAND：候補の並びと理由コード（1a）', () => {
  const facts = (tsv: string, shape: Parameters<typeof reshape>[2]) => {
    const d = okData(run(tsv, shape));
    return { rows: d.rows.length, cols: d.cols.length, unit: d.unit, itemNames: shape === 'item_metric' ? d.cols : undefined };
  };
  it('項目比較：横棒が先頭（形の既定）。項目名が短く少数なら縦棒の理由は short_items', () => {
    const r = candidatesFor('item_metric', 'どこが多いか', facts(F.ONE_METRIC_TSV, 'item_metric'));
    expect(noTables(r.candidates)).toEqual([{ recipe: 'COMP_RANK', reason: 'default_for_shape' }, { recipe: 'COMP_COLUMN', reason: 'short_items' }]);
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
    expect(noTables(candidatesFor('time_metric', '', f).candidates).map((c) => c.recipe)).toEqual(['TREND_LINE', 'TREND_COLUMN', 'TREND_STACKED']);
    expect(candidatesFor('time_metric', '全体の内訳を見たい', f).candidates[0]).toEqual({ recipe: 'TREND_STACKED', reason: 'question_fit' });
  });
  it('系列が多すぎる・足せない値の候補は除き、理由を返す', () => {
    const many = candidatesFor('time_metric', '', { rows: 12, cols: 10, unit: '' });
    expect(many.excluded).toContainEqual({ recipe: 'TREND_COLUMN', why: 'too_many_series' });
    expect(many.excluded).toContainEqual({ recipe: 'TREND_STACKED', why: 'too_many_series' });
    const pct = candidatesFor('time_metric', '', { rows: 5, cols: 3, unit: '%' });
    expect(pct.excluded).toContainEqual({ recipe: 'TREND_STACKED', why: 'not_additive' });
    expect(noTables(pct.candidates).map((c) => c.recipe)).toEqual(['TREND_LINE', 'TREND_COLUMN']);
  });
  it('正確な値が主目的なら wantsExactTable。同じ入力は同じ結果', () => {
    expect(candidatesFor('item_metric', '正確な数字がほしい', { rows: 1, cols: 3 }).wantsExactTable).toBe(true);
    const f = facts(F.LONG_TSV, 'time_metric');
    expect(candidatesFor('time_metric', 'q', f)).toEqual(candidatesFor('time_metric', 'q', f));
  });
});

describe('T-RESHAPE：実績と比較先の差・関係（1b）', () => {
  it('実績と予算 → 行＝［予算, 実績］（基準が先）、列＝項目。値は元のセルのまま', () => {
    const d = okData(run(F.ACTUAL_BUDGET_TSV, 'item_compare'));
    expect(d.rows).toEqual(['予算', '実績']);
    expect(d.cols).toEqual(['ZZ_PRODUCT_ALPHA', 'ZZ_PRODUCT_BETA', 'ZZ_PRODUCT_GAMMA']);
    expect(d.periods.current.values).toEqual([[1000, 900, 600], [1200, 800, 640]]);
    expect(DatasetSchema.safeParse(d).success).toBe(true);
  });
  it('比べる列が無ければ作らない（黙って別の形にしない）', () => {
    expect(run(F.ONE_METRIC_TSV, 'item_compare').res).toEqual({ ok: false, reason: 'no_compare_pair' });
  });
  it('実績・予算・差分の候補（差分バー・集合縦棒・順位と増減）が、実データのまま描ける', () => {
    const d = okData(run(F.ACTUAL_BUDGET_TSV, 'item_compare'));
    for (const id of ['COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA'] as const) {
      expect(proposalSvg({ recipe: id }, 'ja', d), id).toBeTruthy();
    }
  });
  it('7か国型 → 関係：X＝CY Value Share、Y＝次の指標（vs LY）、大きさ＝CY ASP。項目が行、値は元のセル', () => {
    const d = okData(run(F.SEVEN_TSV, 'relation'));
    expect(d.schema).toBe('BUBBLE');
    expect(d.rows).toHaveLength(7);
    expect(d.cols).toHaveLength(3);
    expect(d.cols[0]).toContain('CY Value Share');
    expect(d.periods.current.values[0]![0]).toBe(21.2);
    expect(DatasetSchema.safeParse(d).success).toBe(true);
    for (const id of ['REL_SCATTER', 'REL_BUBBLE'] as const) expect(proposalSvg({ recipe: id }, 'ja', d), id).toBeTruthy();
  });
  it('指標が2つだけなら大きさは無く、バブルは候補から外れて理由が出る', () => {
    const x = run('国\t売上\t利益率\nZZ_A\t10\t5\nZZ_B\t20\t8\nZZ_C\t30\t9', 'relation');
    const d = okData(x);
    expect(d.cols).toHaveLength(2);
    const c = candidatesFor('relation', '', { rows: d.rows.length, cols: d.cols.length, hasSize: false });
    expect(c.candidates.map((k) => k.recipe)).toEqual(['REL_SCATTER']);
    expect(c.excluded).toEqual([{ recipe: 'REL_BUBBLE', why: 'no_size' }, { recipe: 'REL_QUADRANT', why: 'too_few_rows' }]);
  });
});

describe('T-CAND：正確な数値の表（1c）', () => {
  it('時系列・実績と比較先の差には表の候補が付く。項目の大小・関係の基本表は exact_table の形が受け持つ（全部の数値の列）', () => {
    const d = okData(run(F.ONE_METRIC_TSV, 'item_metric'));
    const f = { rows: d.rows.length, cols: d.cols.length, unit: d.unit, itemNames: d.cols };
    expect(candidatesFor('item_metric', '', f).candidates.map((c) => c.recipe)).toEqual(['COMP_RANK', 'COMP_COLUMN']);
    expect(candidatesFor('exact_table', '', { rows: 3, cols: 2 }).candidates.map((c) => c.recipe)).toEqual(['TABLE_BASIC']);
    expect(candidatesFor('item_compare', '', { rows: 2, cols: 5 }).candidates.map((c) => c.recipe)).toEqual(['COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA', 'TABLE_DELTA']);
    expect(candidatesFor('relation', '', { rows: 6, cols: 3, hasSize: true }).candidates.map((c) => c.recipe)).toEqual(['REL_SCATTER', 'REL_BUBBLE', 'REL_QUADRANT']);
  });
  it('正確な値を聞く相談では、表が先頭になり、理由は exact_values_asked', () => {
    const c = candidatesFor('exact_table', '正確な数値をいくつか確認したい', { rows: 3, cols: 2 });
    expect(c.candidates[0]).toEqual({ recipe: 'TABLE_BASIC', reason: 'exact_values_asked' });
    const d = candidatesFor('item_compare', '正確な差を確認したい', { rows: 2, cols: 5 });
    expect(d.candidates.map((x) => x.recipe)).toEqual(['TABLE_DELTA', 'COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA']);
  });
  it('表の候補は実データで描ける（値は丸めない）', () => {
    const d = okData(run('商品\t実績\t予算\nZZ_A\t12.55\t10.25\nZZ_B\t1200.5\t900\nZZ_C\t640\t600', 'item_compare'));
    for (const id of ['TABLE_BASIC', 'TABLE_DELTA'] as const) {
      const svg = proposalSvg({ recipe: id }, 'ja', d)!;
      expect(svg, id).toBeTruthy();
      expect(svg).toContain('ZZ_A');
      expect(svg).toContain('12.55');
      expect(svg).toContain('1,200.5');
    }
  });
});


describe('1c-2：質問に合わせた並びと見出し', () => {
  it('規模も聞かれた関係の相談は、バブルが先頭（大きさの列があるとき）', () => {
    const c = candidatesFor('relation', '売上と利益の関係を、売上の規模つきで見たい', { rows: 6, cols: 3, hasSize: true });
    expect(c.candidates[0]).toEqual({ recipe: 'REL_BUBBLE', reason: 'question_fit' });
    const n = candidatesFor('relation', '売上と利益の関係を見たい', { rows: 6, cols: 3, hasSize: true });
    expect(n.candidates[0]!.recipe).toBe('REL_SCATTER');
    const none = candidatesFor('relation', '規模も見たい', { rows: 6, cols: 2, hasSize: false });
    expect(none.candidates.map((x) => x.recipe)).not.toContain('REL_BUBBLE');
  });
  it('系列が1つの積み上げは「足せない値」ではなく「系列が1つ」と理由を返す。率は足せない', () => {
    expect(candidatesFor('time_metric', '', { rows: 12, cols: 1, unit: '円' }).excluded).toContainEqual({ recipe: 'TREND_STACKED', why: 'one_series' });
    expect(candidatesFor('time_metric', '', { rows: 12, cols: 3, unit: '%' }).excluded).toContainEqual({ recipe: 'TREND_STACKED', why: 'not_additive' });
  });
  it('下書きのタイトルはデータの見出しから作る', async () => {
    const { draftTitle } = await import('./title');
    const { registry } = await import('@/registry');
    expect(draftTitle(registry.recipes.TREND_LINE, 'ja', { rows: ['1月', '2月'], cols: ['売上'] })).toBe('売上はどう推移したか');
    expect(draftTitle(registry.recipes.TREND_LINE, 'ja', { rows: ['1月', '2月'], cols: ['A', 'B'] })).toBe('各系列はどう推移したか');
    expect(draftTitle(registry.recipes.TABLE_BASIC, 'ja', { rows: ['x'], cols: ['客単価（円）', '粗利率（%）'] })).toBe('客単価・粗利率の数値');
    expect(draftTitle(registry.recipes.TABLE_DELTA, 'ja', { rows: ['予算', '実績'], cols: ['A'] })).toBe('予算と実績の差');
  });
});

describe('1c-4：貼った桁のまま', () => {
  it('基本表の元データは、セルごとの小数の桁数を持つ（1250.5→1、1500→なし、21.0→1）', () => {
    const d = okData(run('店\t客単価\nZZ_A\t1250.5\nZZ_B\t1500\nZZ_C\t21.0', 'exact_table')) as unknown as { cellDecimals?: Record<string, number> };
    expect(d.cellDecimals).toEqual({ 'ZZ_A\t客単価': 1, 'ZZ_C\t客単価': 1 });
  });
  it('表では貼った桁のまま出る：1,250.5／1,500／21.0（0を足さない）', () => {
    const d = okData(run('店\t客単価\nZZ_A\t1250.5\nZZ_B\t1500\nZZ_C\t21.0', 'exact_table'));
    const svg = proposalSvg({ recipe: 'TABLE_BASIC' }, 'ja', d)!;
    expect(svg).toContain('1,250.5');
    expect(svg).not.toContain('1,250.50');
    expect(svg).not.toContain('1,500.0');
    expect(svg).toContain('21.0');
  });
});
