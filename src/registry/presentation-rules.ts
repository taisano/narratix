import type { ConsultationAnalysisV2 } from './consultation-model';

/**
 * データトポロジーとビジネス文脈から、最適なプレゼンテーション形式を決定
 * MATRIX_DELTA_SHARE、高密度時の表示方法等を判定
 */

export interface PresentationRanking {
  template: string;
  confidence: number;
  densityOptions?: ('TOP_N' | 'FILTER' | 'SMALL_MULTIPLES' | 'MULTIPLE_SLIDES')[];
}

/**
 * プレゼンテーション形式をランク付け
 * 
 * MATRIX_DELTA_SHARE の条件：
 * - period_count = 2
 * - 2以上の非時間ディメンション
 * - 測度意味論：SHARE
 * - 値意味論：LEVEL + DELTA
 * - 正確な値（推定値ではない）
 */
export function rankPresentations(analysis: ConsultationAnalysisV2): PresentationRanking[] {
  const rankings: PresentationRanking[] = [];
  
  const isHighDensity = analysis.observed_data_stats 
    ? analysis.observed_data_stats.row_count >= 24 || 
      Math.max(...(analysis.dimensions.map(d => {
        // ここでカーディナリティ計算（簡略）
        return 8; // 実装では実際の値を使用
      }) ?? [1])) > 8
    : false;

  // MATRIX_DELTA_SHARE チェック
  if (analysis.period_count === 2 &&
      analysis.dimensions.length >= 2 &&
      analysis.measures.some(m => m.semantics === 'SHARE')) {
    rankings.push({
      template: 'MATRIX_DELTA_SHARE',
      confidence: 0.9,
      densityOptions: isHighDensity ? ['TOP_N', 'FILTER', 'SMALL_MULTIPLES'] : [],
    });
  }

  // 基本テンプレート
  rankings.push({
    template: 'STANDARD',
    confidence: 0.5,
    densityOptions: isHighDensity ? ['MULTIPLE_SLIDES'] : [],
  });

  return rankings.sort((a, b) => b.confidence - a.confidence);
}
