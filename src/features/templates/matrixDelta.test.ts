import { describe, expect, it } from 'vitest';
import { buildMatrixDeltaShare } from './matrixDelta';

describe('MATRIX_DELTA_SHAREのセル生成', () => {
  const input = {
    rowDimension: 'カテゴリー', columnDimension: '価格帯',
    rows: ['A', 'B'], columns: ['低', '高'], baselineLabel: '前年', currentLabel: '今年',
    baseline: [[0.2, 0.3], [0.4, null]], current: [[0.23, 0.28], [0.4, 0.1]],
    shareBasis: '各カテゴリー内の販売数量', inputScale: 'ratio' as const, locale: 'ja' as const,
  };

  it('最新シェアと増減ptを同じセルに文字で残す', () => {
    const r = buildMatrixDeltaShare(input);
    expect(r.content.cells).toEqual([
      ['カテゴリー × 価格帯', '低', '高'],
      ['A', '23.0%\n（+3.0pt）', '28.0%\n（−2.0pt）'],
      ['B', '40.0%\n（±0.0pt）', '10.0%\n（—）'],
    ]);
    expect(r.content.note).toBe('シェアの分母：各カテゴリー内の販売数量');
  });

  it('行列を勝手に削除せず、高密度なら表示方法だけを提案する', () => {
    const rows = Array.from({ length: 9 }, (_, i) => `R${i + 1}`);
    const values = rows.map(() => [0.1, 0.2, 0.3]);
    const r = buildMatrixDeltaShare({ ...input, rows, columns: ['A', 'B', 'C'], baseline: values, current: values });
    expect(r.content.cells).toHaveLength(10);
    expect(r.density).toMatchObject({ cellCount: 27, dense: true });
    expect(r.density.options).toEqual(['TOP_N', 'FILTER', 'SMALL_MULTIPLES', 'MULTIPLE_SLIDES']);
  });

  it('share_basis不明と行列サイズ不一致を拒否する', () => {
    expect(() => buildMatrixDeltaShare({ ...input, shareBasis: ' ' })).toThrow('share_basis is required');
    expect(() => buildMatrixDeltaShare({ ...input, current: [[0.2]] })).toThrow('current shape does not match');
  });
});
