import { describe, expect, it } from 'vitest';
import { analyzeTable, buildDraft, exactPick, exactQuestion, leadPick, loadDraft, manualRoles, resolveRoles, setFor, tabsFor } from './session';
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
    expect(b.sets.map((s) => s.shape)).toEqual(['item_compare', 'item_metric', 'exact_table']);
    expect(b.sets[0]!.candidates.candidates.map((c) => c.recipe)).toEqual(['COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA', 'TABLE_DELTA']);
    expect(setFor(b.sets, 'TABLE_BASIC')!.dataset.cols).toEqual(['実績', '予算']);
    expect(b.sets[0]!.candidates.candidates[0]!.reason).toBe('compare_pair');
    expect(setFor(b.sets, 'COMP_VARIANCE')!.dataset.rows).toEqual(['予算', '実績']);
    expect(setFor(b.sets, 'COMP_RANK')!.dataset.rows).toEqual(['実績']);
  });
  it('7か国型：項目の大小 → 関係（関係は最後）。切り替えても列対応は同じで AI は要らない', () => {
    const a = analyzeTable(F.SEVEN_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, '');
    if (!b.ok) throw new Error();
    expect(b.sets.map((s) => s.shape)).toEqual(['item_metric', 'relation', 'exact_table']);
    expect(setFor(b.sets, 'REL_BUBBLE')!.dataset.schema).toBe('BUBBLE');
  });
});

describe('正確な数値を聞かれた時の最初の表（1c-2）', () => {
  const build = (q: string) => {
    const a = analyzeTable(F.ACTUAL_BUDGET_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, q); if (!b.ok) throw new Error();
    return b.sets;
  };
  it('「差」と「正確」が一緒：増減表が最初。棒グラフなどは同じ場所のタブ、基本表は表の並びの中', () => {
    const q = '商品ごとの実績と予算の差を、正確な数値で確認したい';
    const sets = build(q);
    expect(exactPick(sets, q)).toBe('TABLE_DELTA');
    expect(tabsFor(sets, 'TABLE_DELTA').map((c) => c.recipe)).toEqual(['TABLE_DELTA', 'TABLE_BASIC', 'TABLE_HEAT', 'COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA', 'EVAL_SMALL_BARS']);
  });
  it('「差」が無い一覧の質問：基本表（全部の数値）が最初', () => {
    const q = '商品ごとの実績と予算を一覧で確認したい';
    expect(exactPick(build(q), q)).toBe('TABLE_BASIC');
  });
  it('正確さを聞かれていない質問：最初は決めず、基本表はタブの最後', () => {
    const sets = build('どの商品が予算を下回っているか');
    expect(exactPick(sets, '')).toBeNull();
    const tabs = tabsFor(sets, 'COMP_TWO_DELTA').map((c) => c.recipe);
    expect(tabs.slice(-2)).toEqual(['TABLE_BASIC', 'TABLE_HEAT']);
  });
});

describe('一覧・正確な数値を聞かれた相談の「答える問い」', () => {
  it('聞かれた内容そのものを問いにする（全体の裏の差・例外のような一般文にしない）', () => {
    expect(exactQuestion('商品ごとの実績と予算の差を、正確な数値で確認したい')).toBe('商品ごとの実績と予算の差は、いくらか。');
    expect(exactQuestion('商品ごとの客単価と粗利率を一覧で見たい')).toBe('商品ごとの客単価と粗利率は、いくらか。');
  });
  it('取り出せない文は null（今までの問いのまま）', () => {
    expect(exactQuestion('伸びている商品を教えて')).toBeNull();
    expect(exactQuestion('英語', 'en')).toBeNull();
  });
});

describe('1c-3：タブの置き場と先頭', () => {
  const sevenSets = () => {
    const a = analyzeTable(F.SEVEN_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    return (q: string) => { const b = buildDraft(a.table, r.map, q); if (!b.ok) throw new Error(); return b.sets; };
  };
  it('関係のタブに基本表は付かない。基本表は項目の大小の並びの末尾', () => {
    const sets = sevenSets()('');
    expect(tabsFor(sets, 'REL_SCATTER').map((c) => c.recipe)).not.toContain('TABLE_BASIC');
    const t = tabsFor(sets, 'COMP_RANK').map((c) => c.recipe);
    expect(t.slice(-2)).toEqual(['TABLE_BASIC', 'TABLE_HEAT']);
  });
  it('規模を聞かれたら、バブルが先頭で最初に見せる形（leadPick）', () => {
    const sets = sevenSets()('指標の関係を、規模つきで見たい');
    expect(leadPick(sets, 'REL_SCATTER')).toBe('REL_BUBBLE');
    expect(leadPick(sevenSets()('指標の関係を見たい'), 'REL_SCATTER')).toBeNull();
  });
});

describe('exactQuestion の言い回し', () => {
  it('小数まで正確に確認したい／一覧で見たい、などを落として「〜は、いくらか。」', () => {
    expect(exactQuestion('各店舗の客単価と粗利率を、小数まで正確に確認したい')).toBe('各店舗の客単価と粗利率は、いくらか。');
    expect(exactQuestion('各店舗の客単価と粗利率を、小数まで正確に確認したいです')).toBe('各店舗の客単価と粗利率は、いくらか。');
    expect(exactQuestion('各店舗の客単価と粗利率の一覧が見たい')).not.toContain('いくつか');
  });
});

describe('量と率（売上と粗利率）の表：2軸の縦棒＋折れ線（COMP_COMBO）', () => {
  const TSV = '店舗\t売上(万円)\t粗利率\n渋谷店\t1200\t31.5%\n新宿店\t980\t28.1%\n池袋店\t760\t26.4%\n横浜店\t640\t29.8%';
  const sets = (q = '') => {
    const a = analyzeTable(TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const b = buildDraft(a.table, r.map, q); if (!b.ok) throw new Error();
    return b.sets;
  };
  it('候補に出る。元データは行＝店舗、列＝売上と粗利率の両方', () => {
    const s = sets();
    expect(setFor(s, 'COMP_COMBO')!.dataset.cols.length).toBe(2);
    expect(setFor(s, 'COMP_COMBO')!.dataset.rows).toEqual(['渋谷店', '新宿店', '池袋店', '横浜店']);
    expect(setFor(s, 'COMP_COMBO')!.candidates.candidates[0]).toEqual({ recipe: 'COMP_COMBO', reason: 'two_kinds' });
  });
  it('最初に見せるのは量と率。タブの先頭にも置く', () => {
    const s = sets('店舗ごとの売上と粗利率を比べたい');
    expect(leadPick(s, 'COMP_RANK')).toBe('COMP_COMBO');
    expect(tabsFor(s, 'COMP_COMBO')[0]!.recipe).toBe('COMP_COMBO');
  });
  it('関係を聞かれて推奨が散布図の時は、決めつけない', () => {
    expect(leadPick(sets('売上と粗利率の関係を見たい'), 'REL_SCATTER')).toBeNull();
  });
  it('正確な数値を聞かれたら、表が先頭のまま', () => {
    const s = sets('売上と粗利率を正確な数値で確認したい');
    expect(exactPick(s, '売上と粗利率を正確な数値で確認したい')).toBe('TABLE_BASIC');
  });
});
