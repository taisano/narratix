import { describe, expect, it } from 'vitest';
import { pearson, readingOf } from './readings';
import { analyzeTable, resolveRoles, buildDraft, setFor } from './session';
import * as F from './fixtures';

const sets = (tsv: string) => {
  const a = analyzeTable(tsv); if (!a.ok) throw new Error();
  const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
  const b = buildDraft(a.table, r.map, ''); if (!b.ok) throw new Error();
  return b.sets;
};

describe('読み取り（コードが計算する事実）', () => {
  it('相関係数：完全な正・負・一定の列', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });
  it('バブル用の表：X（市場成長率）と Y（営業利益率）の相関が強い正。件数は6', () => {
    const s = sets('製品\t市場成長率(%)\t営業利益率(%)\t売上(億円)\n製品A\t12.5\t18.2\t240\n製品B\t8.1\t11.5\t420\n製品C\t3.2\t6.8\t610\n製品D\t15.8\t21.0\t90\n製品E\t5.5\t9.1\t180\n製品F\t1.2\t4.3\t350');
    const rel = setFor(s, 'REL_SCATTER')!;
    const x = readingOf(rel.shape, 'REL_SCATTER', rel.dataset);
    expect(x).toMatchObject({ kind: 'correlation', n: 6, strength: 'strong', sign: 'positive' });
    expect(x && x.kind === 'correlation' && x.r).toBeGreaterThan(0.9);
    expect(readingOf(rel.shape, 'REL_BUBBLE', rel.dataset)).toMatchObject({ kind: 'correlation' });
  });
  it('店舗表：客数が多いほど客単価は低い方向（負）。欠損は除いて数える', () => {
    const s = sets('店舗\t客数\t客単価\n店舗A\t1200\t850\n店舗B\t900\t1100\n店舗C\t1500\t780\n店舗D\t700\t1300');
    const rel = setFor(s, 'REL_SCATTER')!;
    expect(readingOf(rel.shape, 'REL_SCATTER', rel.dataset)).toMatchObject({ kind: 'correlation', n: 4, strength: 'strong', sign: 'negative' });
  });
  it('実績と予算：増減の数と最大の増減（予算→実績）', () => {
    const s = sets(F.ACTUAL_BUDGET_TSV);
    const c = setFor(s, 'COMP_VARIANCE')!;
    expect(readingOf(c.shape, 'COMP_VARIANCE', c.dataset)).toMatchObject({ kind: 'moves', up: 2, down: 1, from: '予算', to: '実績', biggestUp: { name: 'ZZ_PRODUCT_ALPHA', diff: 200 }, biggestDown: { name: 'ZZ_PRODUCT_BETA', diff: -100 } });
  });
  it('国別売上：最大の項目と値', () => {
    const s = sets(F.ONE_METRIC_TSV);
    const k = setFor(s, 'COMP_RANK')!;
    expect(readingOf(k.shape, 'COMP_RANK', k.dataset)).toMatchObject({ kind: 'top', name: 'ZZ_BORDURIA', value: 340, n: 4 });
  });
  it('時系列は読み取りを出さない', () => {
    const s = sets(F.LONG_TSV);
    expect(readingOf(s[0]!.shape, 'TREND_LINE', s[0]!.dataset)).toBeNull();
  });
});
