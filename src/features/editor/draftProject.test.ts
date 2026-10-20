import { describe, expect, it } from 'vitest';
import { planFromPurpose } from '../start/plan';
import { projectFromDraft, rebuildProjectFromDraft, normalizeProject, viewOf } from './project';
import { projectFromCanonical, projectToCanonical } from '../data/canonical';
import * as F from '../data/draft/fixtures';
import { proposalSvg } from '../start/dishView';
import { analyzeTable, loadDraft, resolveRoles, type DraftSource } from '../data/draft/session';

function draftOf(tsv: string, question = ''): DraftSource {
  const a = analyzeTable(tsv); if (!a.ok) throw new Error();
  const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
  return { tsv, map: r.map, shape: null, question };
}

describe('実データ下書き → 編集画面', () => {
  it('選んだ候補（pick）から作ると、そのレシピ1枚で、データは貼った表のまま', () => {
    const plan = { ...planFromPurpose('comparison'), draft: { ...draftOf(F.ONE_METRIC_TSV), pick: 'COMP_RANK' as const } };
    const p = projectFromDraft(plan, 'ja')!;
    expect(p.slides).toHaveLength(1);
    expect(p.slides[0]!.recipe).toBe('COMP_RANK');
    expect(p.dataset.cols).toEqual(['ZZ_ALAND', 'ZZ_BORDURIA', 'ZZ_CASCADIA', 'ZZ_DORNE']);
    expect(p.dataset.periods.current.values).toEqual([[120, 340, 210, 55]]);
    expect(viewOf(p, 0).dataset.cols).toContain('ZZ_CASCADIA');
  });
  it('どの候補から作っても、元データと列対応は同じ（Dataset は同じ表と列対応から作る）', () => {
    const base = draftOf(F.LONG_TSV);
    const a = projectFromDraft({ ...planFromPurpose('trend'), draft: { ...base, pick: 'TREND_LINE' } }, 'ja')!;
    const b = projectFromDraft({ ...planFromPurpose('trend'), draft: { ...base, pick: 'TREND_COLUMN' } }, 'ja')!;
    expect(a.dataset).toEqual(b.dataset);
    expect(a.slides[0]!.recipe).toBe('TREND_LINE');
    expect(b.slides[0]!.recipe).toBe('TREND_COLUMN');
  });
  it('pick が無ければ ② の案を、貼った表のデータで作る（見本に置き換えない）', () => {
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: draftOf(F.ONE_METRIC_TSV) }, 'ja')!;
    expect(p.dataset.cols).toContain('ZZ_ALAND');
    expect(p.slides.length).toBeGreaterThan(0);
  });
  it('列対応が無い（手動指定の前）下書きでは作らない', () => {
    expect(projectFromDraft({ ...planFromPurpose('comparison'), draft: { tsv: F.ONE_METRIC_TSV, map: null, shape: null, question: '' } }, 'ja')).toBeNull();
  });
  it('実績と予算の候補（差分バー）から作ると、データは［予算, 実績］の表で入る。項目の大小の候補からなら実績だけ', () => {
    const base = draftOf(F.ACTUAL_BUDGET_TSV);
    const v = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...base, pick: 'COMP_VARIANCE' } }, 'ja')!;
    expect(v.slides[0]!.recipe).toBe('COMP_VARIANCE');
    expect(v.dataset.rows).toEqual(['予算', '実績']);
    expect(v.dataset.periods.current.values).toEqual([[1000, 900, 600], [1200, 800, 640]]);
    const k = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...base, pick: 'COMP_RANK' } }, 'ja')!;
    expect(k.dataset.rows).toEqual(['実績']);
  });
  const BUBBLE_TSV = '製品\t市場成長率(%)\t営業利益率(%)\t売上(億円)\n製品A\t12.5\t18.2\t240\n製品B\t8.1\t11.5\t420\n製品C\t3.2\t6.8\t610\n製品D\t15.8\t21.0\t90\n製品E\t5.5\t9.1\t180\n製品F\t1.2\t4.3\t350';
  const STORE_TSV = '店舗\t客数\t客単価\n店舗A\t1200\t850\n店舗B\t900\t1100\n店舗C\t1500\t780\n店舗D\t700\t1300';
  it('関係の候補（バブル）から作ると、関係のデータ（datasets.relation）に貼った表の6件が入る。見本の行・グループは混ざらない', () => {
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...draftOf(BUBBLE_TSV), pick: 'REL_BUBBLE' } }, 'ja')!;
    expect(p.slides[0]!.recipe).toBe('REL_BUBBLE');
    const d = viewOf(p, 0).dataset;
    expect(d.schema).toBe('BUBBLE');
    expect(d.rows).toEqual(['製品A', '製品B', '製品C', '製品D', '製品E', '製品F']);
    expect(d.groups).toBeUndefined();
    expect(d.cols).toHaveLength(3);
    expect(d.periods.current.values).toEqual([[12.5, 18.2, 240], [8.1, 11.5, 420], [3.2, 6.8, 610], [15.8, 21, 90], [5.5, 9.1, 180], [1.2, 4.3, 350]]);
    expect(p.source).toBe('出典：貼り付けたデータ');
  });
  it('関係のプロジェクトも、保存用の正規形に変換できる（下書き保存で projection が undefined にならない）', () => {
    for (const pick of ['REL_BUBBLE', 'REL_SCATTER'] as const) {
      const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...draftOf(BUBBLE_TSV), pick } }, 'ja')!;
      const c = projectToCanonical(p);
      const key = c.content.slides[0]!.data[0]!.datasetVersionId;
      expect(c.datasetVersions[key]?.projection).toBeDefined();
      expect(projectFromCanonical(c).datasets?.relation?.rows).toEqual(['製品A', '製品B', '製品C', '製品D', '製品E', '製品F']);
    }
  });
  it('店舗表（客数・客単価）：AI が客単価を使わないとしても両方が指標になり、散布図で店舗A〜Dがエディタに入る', () => {
    const a = analyzeTable(STORE_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, { version: 1, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }, { col: 2, role: 'unused' }] });
    if (r.status !== 'ready') throw new Error();
    expect(r.map.assignments.filter((x) => x.role === 'metric').map((x) => x.col)).toEqual([1, 2]);
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { tsv: STORE_TSV, map: r.map, shape: null, question: '', pick: 'REL_SCATTER' } }, 'ja')!;
    const d = viewOf(p, 0).dataset;
    expect(d.rows).toEqual(['店舗A', '店舗B', '店舗C', '店舗D']);
    expect(d.periods.current.values).toEqual([[1200, 850], [900, 1100], [1500, 780], [700, 1300]]);
  });
  it('pick が無くても、関係だけが当てはまる表では見本に置き換えない', () => {
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: draftOf(STORE_TSV) }, 'ja')!;
    expect(p.slides.length).toBeGreaterThan(0);
    expect(p.dataset.cols).not.toContain('市場成長率（%）');
  });
  it('表の候補（基本表・増減表）から作ると、そのレシピ1枚で、データは貼った表のまま', () => {
    const base = draftOf(F.ACTUAL_BUDGET_TSV);
    const d = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...base, pick: 'TABLE_DELTA' } }, 'ja')!;
    expect(d.slides[0]!.recipe).toBe('TABLE_DELTA');
    expect(d.slides[0]!.chart).toBe('table_delta');
    expect(d.dataset.rows).toEqual(['予算', '実績']);
    expect(d.dataset.periods.current.values).toEqual([[1000, 900, 600], [1200, 800, 640]]);
    const b = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...base, pick: 'TABLE_BASIC' } }, 'ja')!;
    expect(b.slides[0]!.chart).toBe('table_basic');
    expect(projectToCanonical(b).content.slides).toHaveLength(1);
  });
  it('量と率（売上と粗利率）：縦棒＋折れ線で作る。元データは項目×2つの指標、合計は出さない。保存の形にも戻せる', () => {
    const tsv = '店舗\t売上(万円)\t粗利率\n渋谷店\t1200\t31.5%\n新宿店\t980\t28.1%\n池袋店\t760\t26.4%\n横浜店\t640\t29.8%';
    const base = draftOf(tsv);
    const d = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...base, pick: 'COMP_COMBO' } }, 'ja')!;
    expect(d.slides[0]!.chart).toBe('combo');
    expect(d.dataset.rows).toEqual(['渋谷店', '新宿店', '池袋店', '横浜店']);
    expect(d.dataset.cols).toHaveLength(2);
    expect(d.dataset.periods.current.values[0]).toEqual([1200, 31.5]);
    expect(d.dataset.showTotals).toBe(false);
    expect(projectToCanonical(d).content.slides).toHaveLength(1);
  });
});


describe('2b：貼った表と列対応の保存・作り直し', () => {
  const make = () => projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...draftOf(F.ONE_METRIC_TSV, '店舗別の売上は、いくらか。'), pick: 'COMP_RANK' as const } }, 'ja')!;
  it('作った時に貼った表・列対応・問いを持ち、保存して開き直しても残る', () => {
    const p = make();
    expect(p.draft?.tsv).toBe(F.ONE_METRIC_TSV);
    expect(p.draft?.question).toBe('店舗別の売上は、いくらか。');
    const back = projectFromCanonical(projectToCanonical(p));
    expect(back.draft).toEqual(p.draft);
    expect(normalizeProject(JSON.parse(JSON.stringify(p)))?.draft).toEqual(p.draft);
  });
  it('壊れた draft は読み込み時に捨てる', () => {
    const raw = JSON.parse(JSON.stringify(make())); raw.draft = { tsv: 5 };
    expect(normalizeProject(raw)?.draft).toBeUndefined();
  });
  it('列対応を渡すとデータを貼った表から作り直し、スライドは残す（名前を指す設定は外す）', () => {
    const p = make();
    p.dataset.cols = ['手で直した'];
    p.slides[0]!.controls = { ...p.slides[0]!.controls, highlight: 'ZZ_ALAND' } as never;
    const r = rebuildProjectFromDraft(p, p.draft!.map);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.dataset.cols).toEqual(['ZZ_ALAND', 'ZZ_BORDURIA', 'ZZ_CASCADIA', 'ZZ_DORNE']);
    expect(r.project.slides[0]!.recipe).toBe('COMP_RANK');
    expect((r.project.slides[0]!.controls as Record<string, unknown>).highlight).toBeUndefined();
  });
  it('作れない列対応なら何も変えずに理由を返す／元が無ければ no_draft', () => {
    const p = make();
    const bad = { ...p.draft!.map, assignments: p.draft!.map.assignments.filter((a) => a.role === 'item') };
    const r = rebuildProjectFromDraft(p, bad);
    expect(r).toEqual({ ok: false, reason: 'unbuildable' });
    expect(rebuildProjectFromDraft({ ...p, draft: undefined }, p.draft!.map)).toEqual({ ok: false, reason: 'no_draft' });
  });
});

describe('2b+：関係の X・Y・大きさの入れ替え', () => {
  const TSV = '製品\t市場成長率(%)\t営業利益率(%)\t売上(億円)\n製品A\t12.5\t18.2\t240\n製品B\t8.1\t11.5\t420\n製品C\t3.2\t6.8\t610\n製品D\t15.8\t21.0\t90\n製品E\t5.5\t9.1\t180\n製品F\t1.2\t4.3\t350';
  it('入れ替えた割り当てで関係のデータを作り直し、スライドは残す', () => {
    const d = draftOf(TSV);
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...d, pick: 'REL_BUBBLE' as const } }, 'ja')!;
    const rel = p.datasets!.relation!;
    expect(rel.cols[0]).toContain('市場成長率');
    const r = rebuildProjectFromDraft(p, { ...p.draft!.map, relation: { x: 2, y: 1, size: 3 }, source: 'user' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.datasets!.relation!.cols[0]).toContain('営業利益率');
    expect(r.project.datasets!.relation!.cols[1]).toContain('市場成長率');
    expect(r.project.slides[0]!.recipe).toBe('REL_BUBBLE');
    // 大きさを外すとバブルは作れない（元のまま）
    expect(rebuildProjectFromDraft(p, { ...p.draft!.map, relation: { x: 2, y: 1 }, source: 'user' })).toEqual({ ok: false, reason: 'unbuildable' });
  });
});

describe('ヒートマップ表（TABLE_HEAT）', () => {
  it('実データの表から作れて、列対応を直して作り直せる', () => {
    const d = draftOf(F.SEVEN_TSV);
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...d, pick: 'TABLE_HEAT' as const } }, 'ja')!;
    expect(p.slides[0]!.recipe).toBe('TABLE_HEAT');
    expect(p.slides[0]!.chart).toBe('table_heat');
    expect(p.dataset.cols.length).toBeGreaterThanOrEqual(2);
    expect(rebuildProjectFromDraft(p, p.draft!.map).ok).toBe(true);
  });
});

describe('KPI カード（TABLE_KPI）', () => {
  const TS = '月\t売上\t粗利\n2025年1月\t100\t30\n2025年2月\t110\t33\n2025年3月\t130\t39';
  it('時系列の表の候補に付き、最新の値と前の期間との比較を、表の数値からそのまま作る', () => {
    const d = draftOf(TS);
    const loaded = loadDraft({ ...d, pick: undefined });
    expect(loaded.ok && loaded.sets.some((x) => x.candidates.candidates.some((c) => c.recipe === 'TABLE_KPI'))).toBe(true);
    const p = projectFromDraft({ ...planFromPurpose('trend'), draft: { ...d, pick: 'TABLE_KPI' as const } }, 'ja')!;
    const sl = p.slides[0]!;
    expect(sl.recipe).toBe('TABLE_KPI');
    expect(sl.view).toBe('STORY_TABLE_KPI');
    const k = sl.content!.kpi!.kpis;
    expect(k.map((x) => [x.name, x.value, x.compare])).toEqual([['売上', '130', '110'], ['粗利', '39', '33']]);
    expect(proposalSvg({ recipe: 'TABLE_KPI' }, 'ja', p.dataset)).toBeTruthy();
  });
  it('列対応を直して作り直すと、カードの数字も新しいデータから取り直す', () => {
    const d = draftOf(TS);
    const p = projectFromDraft({ ...planFromPurpose('trend'), draft: { ...d, pick: 'TABLE_KPI' as const } }, 'ja')!;
    p.slides[0]!.content!.kpi!.kpis[0]!.value = '999';
    const r = rebuildProjectFromDraft(p, p.draft!.map);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.slides[0]!.content!.kpi!.kpis[0]!.value).toBe('130');
  });
  it('期間でない表・指標が多すぎる表には付かない', () => {
    const d = draftOf(F.ONE_METRIC_TSV);
    const loaded = loadDraft(d);
    expect(loaded.ok && loaded.sets.flatMap((x) => x.candidates.candidates).some((c) => c.recipe === 'TABLE_KPI')).toBe(false);
  });
});
