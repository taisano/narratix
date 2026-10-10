import { describe, expect, it } from 'vitest';
import { averageRating, reviewerName } from './reviews';

describe('レビューの表示', () => {
  it('星の平均は全件から計算する', () => {
    expect(averageRating([])).toBe(0);
    expect(averageRating([{ rating: 5 }, { rating: 3 }, { rating: 4 }])).toBe(4);
  });
  it('表示名は空白だけなら使わない（職種の方にする）', () => {
    expect(reviewerName('  たろう ')).toBe('たろう');
    expect(reviewerName('   ')).toBeNull();
    expect(reviewerName(null)).toBeNull();
  });
});
