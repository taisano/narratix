import { describe, expect, it } from 'vitest';
import { indexOf, maxRankShift, rankSlopeAt, rankSlopeItems, ranksOf } from './rankSlope';

describe('指標間の順位スロープの計算', () => {
  it('順位は大きい順、同じ値は同じ順位、空は null', () => {
    expect(ranksOf([10, 30, 30, null, 5])).toEqual([3, 1, 1, null, 4]);
  });
  it('指数は項目の平均＝100。平均が 0 以下なら出さない', () => {
    expect(indexOf([50, 150, null])).toEqual([50, 150, null]);
    expect(indexOf([0, 0])).toEqual([null, null]);
  });
  it('時点：選んだ行、無ければ時間の順で最後', () => {
    expect(rankSlopeAt(['2019', '2024', '2022'])).toBe(1);
    expect(rankSlopeAt(['2019', '2024'], '2019')).toBe(0);
    expect(rankSlopeAt(['東', '西'])).toBe(1);
  });
  it('順位・指数は両方の指標がある項目だけで出す', () => {
    const it2 = rankSlopeItems(['A', 'B', 'C'], [[3, 2, 1]], [[1, null, 3]], 0);
    expect(it2.map((x) => [x.rankA, x.rankB])).toEqual([[1, 2], [null, null], [2, 1]]);
  });
  it('順位が最も動いた項目。同じ動きなら左の順位が上の項目、動かなければ null', () => {
    const items = rankSlopeItems(['A', 'B', 'C', 'D'], [[40, 30, 20, 10]], [[20, 40, 10, 30]], 0);
    // A 1→3, B 2→1, C 3→4, D 4→2：A と D が 2 動く → 左で上の A
    expect(maxRankShift(items)).toBe('A');
    expect(maxRankShift(rankSlopeItems(['A', 'B'], [[2, 1]], [[20, 10]], 0))).toBeNull();
  });
});
