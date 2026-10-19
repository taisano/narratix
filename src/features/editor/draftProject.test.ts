import { describe, expect, it } from 'vitest';
import { planFromPurpose } from '../start/plan';
import { projectFromDraft, viewOf } from './project';
import * as F from '../data/draft/fixtures';
import { analyzeTable, resolveRoles, type DraftSource } from '../data/draft/session';

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
  it('関係の候補（バブル）から作ると、項目が行の BUBBLE の表で入る', () => {
    const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...draftOf(F.SEVEN_TSV), pick: 'REL_BUBBLE' } }, 'ja')!;
    expect(p.slides[0]!.recipe).toBe('REL_BUBBLE');
    expect(p.dataset.schema).toBe('BUBBLE');
    expect(p.dataset.rows).toHaveLength(7);
  });
});
