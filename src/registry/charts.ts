import type { ChartTypeId, ExportId } from './ids';
import type { ChartTypeDef } from './types';

const SHAPES_NATIVE: ExportId[] = ['shapes', 'native', 'svg', 'png'];
const SHAPES_ONLY: ExportId[] = ['shapes', 'svg', 'png'];
const TABLE_OUT: ExportId[] = ['table', 'svg', 'png'];

type ChartInput = Omit<ChartTypeDef, 'renderer' | 'defaultExport' | 'messageExamples' | 'requires'> &
  Partial<Pick<ChartTypeDef, 'defaultExport' | 'messageExamples' | 'requires'>>;

function chart(c: ChartInput): ChartTypeDef {
  return {
    renderer: c.id,
    defaultExport: c.exports[0]!,
    messageExamples: {},
    requires: { base: false },
    ...c,
  };
}

/** ローンチ対象20種（registry-spec.md「ChartType：チャート型」）。Scatter＋Quadrants は補完パーツ quadrants に統合。 */
export const CHART_TYPES: Record<ChartTypeId, ChartTypeDef> = {
  // ---- trend ----
  line: chart({
    id: 'line', purpose: 'trend', origin: 'existing',
    label: { ja: '折れ線', en: 'Line' },
    shows: ['trend'], cannotShow: ['mix', 'reason'],
    complements: ['cagr_note', 'callout', 'reference_line'],
    exports: SHAPES_NATIVE,
  }),
  column_trend: chart({
    id: 'column_trend', purpose: 'trend', origin: 'existing',
    label: { ja: '縦棒', en: 'Column' },
    shows: ['size'], cannotShow: ['growth'],
    complements: ['delta_labels', 'cagr_note'],
    exports: SHAPES_NATIVE,
  }),
  bar_trend: chart({
    id: 'bar_trend', purpose: 'trend', origin: 'existing',
    label: { ja: '横棒', en: 'Bar' },
    shows: ['size'], cannotShow: ['growth'],
    complements: ['delta_labels'],
    exports: SHAPES_NATIVE,
  }),
  stacked_column: chart({
    id: 'stacked_column', purpose: 'trend', origin: 'new',
    label: { ja: '積み上げ縦棒', en: 'Stacked column' },
    shows: ['trend', 'mix'], cannotShow: ['growth'],
    complements: ['total_labels', 'cagr_note', 'aligned_table'],
    exports: SHAPES_NATIVE,
  }),
  stacked_100: chart({
    id: 'stacked_100', purpose: 'trend', origin: 'new',
    label: { ja: '100%積み上げ縦棒', en: '100% stacked column' },
    shows: ['mix_change'], cannotShow: ['size'],
    complements: ['total_labels', 'delta_labels'],
    exports: SHAPES_NATIVE,
  }),
  slope: chart({
    id: 'slope', purpose: 'trend', origin: 'new',
    label: { ja: 'スロープ', en: 'Slope' },
    shows: ['difference', 'rank_change'], cannotShow: ['trend', 'size'],
    complements: ['aligned_table'],
    exports: SHAPES_NATIVE,
  }),
  // ---- comparison ----
  bar_rank: chart({
    id: 'bar_rank', purpose: 'comparison', origin: 'existing',
    label: { ja: '横棒ランキング', en: 'Ranked bar' },
    shows: ['rank', 'size'], cannotShow: ['time_change', 'growth'],
    complements: ['aligned_table', 'reference_line', 'rank_change'],
    exports: SHAPES_NATIVE,
  }),
  column_compare: chart({
    id: 'column_compare', purpose: 'comparison', origin: 'existing',
    label: { ja: '縦棒比較', en: 'Column comparison' },
    shows: ['size'], cannotShow: ['time_change'],
    complements: ['reference_line', 'aligned_table'],
    exports: SHAPES_NATIVE,
  }),
  clustered_column: chart({
    id: 'clustered_column', purpose: 'comparison', origin: 'existing',
    label: { ja: '集合縦棒', en: 'Clustered column' },
    shows: ['difference'], cannotShow: ['interpretation'],
    complements: ['delta_labels', 'insight_box'],
    exports: SHAPES_NATIVE,
  }),
  variance_bar: chart({
    id: 'variance_bar', purpose: 'comparison', origin: 'existing',
    label: { ja: '差分バー', en: 'Variance bar' },
    shows: ['difference'], cannotShow: ['level'],
    complements: ['aligned_table'],
    // TODO(narratix): 要確認 — native 出力の可否（registry-spec.md「出力方式」）
    exports: SHAPES_NATIVE,
  }),
  // ---- composition ----
  mekko: chart({
    id: 'mekko', purpose: 'composition', origin: 'existing',
    label: { ja: 'Mekko', en: 'Mekko' },
    shows: ['size', 'mix', 'difference'], cannotShow: ['growth', 'time_change'],
    complements: ['aligned_table', 'delta_labels', 'cagr_note'],
    exports: SHAPES_ONLY,
    messageExamples: {
      ja: ['大きい市場でどの形状が取れているか見せたい', '市場規模とシェアを一枚で'],
      en: ['Show which segments win in the largest markets', 'Market size and share on one slide'],
    },
  }),
  bar_100: chart({
    id: 'bar_100', purpose: 'composition', origin: 'new',
    label: { ja: '100%横棒', en: '100% bar' },
    shows: ['mix', 'difference'], cannotShow: ['size'],
    complements: ['aligned_table', 'total_labels'],
    alsoAccepts: ['MATRIX_TIME_SERIES'],
    exports: SHAPES_NATIVE,
  }),
  // カテゴリごとに、比較期間と現在の100%積み上げを並べる（市場ごとのシェアの変化を1枚で）
  share_pair: chart({
    id: 'share_pair', purpose: 'composition', origin: 'new',
    label: { ja: '2期間の100%積み上げ（カテゴリ別）', en: 'Paired 100% columns by category' },
    shows: ['mix', 'mix_change', 'size', 'growth'], cannotShow: ['time_change'],
    complements: [],
    requires: { base: true },
    exports: SHAPES_NATIVE,
  }),
  // ---- contribution ----
  waterfall: chart({
    id: 'waterfall', purpose: 'contribution', origin: 'existing',
    label: { ja: 'ウォーターフォール', en: 'Waterfall' },
    shows: ['contribution'], cannotShow: ['growth', 'reason'],
    complements: ['aligned_table', 'callout', 'insight_box'],
    exports: SHAPES_NATIVE,
  }),
  driver_bar: chart({
    id: 'driver_bar', purpose: 'contribution', origin: 'existing',
    label: { ja: '要因バー', en: 'Driver bar' },
    shows: ['contribution'], cannotShow: ['level'],
    complements: ['insight_box'],
    exports: SHAPES_NATIVE,
  }),
  posneg_bar: chart({
    id: 'posneg_bar', purpose: 'contribution', origin: 'existing',
    label: { ja: 'プラス・マイナスバー', en: 'Positive / negative bar' },
    shows: ['contribution'], cannotShow: ['net_change'],
    complements: ['reference_line', 'insight_box'],
    exports: SHAPES_NATIVE,
  }),
  // ---- relationship ----
  scatter: chart({
    id: 'scatter', purpose: 'relationship', origin: 'existing',
    label: { ja: '散布図', en: 'Scatter' },
    shows: ['correlation'], cannotShow: ['size', 'time_change'],
    complements: ['quadrants', 'reference_line', 'trajectory'],
    exports: SHAPES_NATIVE,
  }),
  bubble: chart({
    id: 'bubble', purpose: 'relationship', origin: 'existing',
    label: { ja: 'バブル', en: 'Bubble' },
    shows: ['position', 'size'], cannotShow: ['time_change'],
    complements: ['quadrants', 'trajectory'],
    exports: SHAPES_NATIVE,
  }),
  // ---- evaluate ----
  heatmap: chart({
    id: 'heatmap', purpose: 'evaluate', origin: 'existing_hidden',
    label: { ja: 'ヒートマップ表', en: 'Heatmap' },
    shows: ['overview'], cannotShow: ['size'],
    complements: ['aligned_table', 'sparkline'],
    exports: TABLE_OUT,
  }),
  small_multiples_bar: chart({
    id: 'small_multiples_bar', purpose: 'evaluate', origin: 'existing_hidden',
    label: { ja: '小さな棒の並び', en: 'Small multiple bars' },
    shows: ['rank'], cannotShow: ['overall'],
    complements: ['reference_line', 'insight_box'],
    exports: SHAPES_ONLY,
  }),
  leaderboard: chart({
    id: 'leaderboard', purpose: 'evaluate', origin: 'existing_hidden',
    label: { ja: '指標別ランキング', en: 'Metric leaderboard' },
    shows: ['rank'], cannotShow: ['difference'],
    complements: ['sparkline', 'rank_change'],
    exports: TABLE_OUT,
  }),
};
