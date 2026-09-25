/**
 * レジストリの ID 一覧（言語に依存しない英字で固定）。
 * zod の enum と TypeScript の型は、すべてここから作る。
 */

export const DATA_SCHEMA_IDS = ['MATRIX_TIME_SERIES', 'MEKKO', 'DRIVER_BRIDGE', 'BUBBLE', 'EVALUATION'] as const;
export type DataSchemaId = (typeof DATA_SCHEMA_IDS)[number];

export const PURPOSE_IDS = ['trend', 'comparison', 'composition', 'contribution', 'relationship', 'evaluate'] as const;
export type PurposeId = (typeof PURPOSE_IDS)[number];

export const CHART_TYPE_IDS = [
  'line', 'column_trend', 'bar_trend', 'stacked_column', 'stacked_100', 'slope',
  'bar_rank', 'column_compare', 'clustered_column', 'variance_bar',
  'mekko', 'bar_100', 'share_pair',
  'waterfall', 'driver_bar', 'posneg_bar',
  'scatter', 'bubble',
  'heatmap', 'small_multiples_bar', 'leaderboard',
] as const;
export type ChartTypeId = (typeof CHART_TYPE_IDS)[number];

export const CONTROL_IDS = [
  'title', 'subtitle', 'source', 'unit', 'number_format', 'axis_swap', 'items', 'series',
  'highlight', 'gridlines', 'data_labels', 'line_markers', 'compare_target', 'rank_sort',
  'base_target', 'compare_target2', 'variance_sort', 'mekko_labels', 'sort_by_size',
  'driver_sort', 'show_zero', 'mismatch', 'connectors', 'posneg_color', 'bubble_size',
  'color_scale', 'direction', 'item_sort', 'metric_sort', 'orientation', 'palette', 'top_n', 'xy_swap', 'x_title', 'y_title', 'show_corr', 'pair_growth', 'pair_delta',
] as const;
export type ControlId = (typeof CONTROL_IDS)[number];

export const COMPLEMENT_IDS = [
  'aligned_table', 'delta_labels', 'cagr_note', 'total_labels', 'reference_line', 'insight_box',
  'callout', 'sparkline', 'rank_change', 'quadrants', 'trajectory', 'small_multiples',
] as const;
export type ComplementId = (typeof COMPLEMENT_IDS)[number];

export const LAYOUT_IDS = [
  'p01_single', 'p02_top_bottom', 'p03_left_right', 'p04_three_columns',
  'p05_left_main_bottom', 'p06_main_top_two_bottom', 'p07_two_top_conclusion', 'p08_grid_2x2',
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const TRANSFORM_IDS = ['transpose', 'aggregate_rows', 'select_periods', 'growth', 'share', 'delta_share', 'filter', 'sort', 'endpoints', 'latest', 'top_n'] as const;
export type TransformId = (typeof TRANSFORM_IDS)[number];

export const TABLE_IDS = ['growth_table', 'data_table', 'cagr_table'] as const;
export type TableId = (typeof TABLE_IDS)[number];

export const EXPORT_IDS = ['shapes', 'native', 'table', 'svg', 'png', 'thinkcell'] as const;
export type ExportId = (typeof EXPORT_IDS)[number];

export const ALIGN_AXES = ['columns', 'rows', 'y_scale', 'x_scale', 'palette'] as const;
export type AlignAxis = (typeof ALIGN_AXES)[number];

export const PANEL_KINDS = ['chart', 'table', 'text'] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

/** チャートが「見せられる／見せられない」要素。補完パーツの推薦で突き合わせる語彙。 */
export const ASPECT_IDS = [
  'trend', 'size', 'growth', 'mix', 'mix_change', 'rank', 'rank_change', 'difference', 'level',
  'contribution', 'net_change', 'reason', 'correlation', 'position', 'time_change', 'overview',
  'overall', 'benchmark', 'interpretation', 'readability',
] as const;
export type AspectId = (typeof ASPECT_IDS)[number];

/**
 * 推薦レシピ（伝え方の切り口）。3つの入り口（相談・目的・チャート）で共通の単位。
 * 相談から入った時の AI の出力（recipe_id）もこの ID を使う（docs/consultation-flow.md）。
 */
export const RECIPE_IDS = [
  // 推移
  'TREND_LINE', 'TREND_LINE_AVG', 'TREND_CAGR_TABLE', 'TREND_COLUMN', 'TREND_BAR', 'TREND_STACKED', 'TREND_SHARE', 'TREND_SLOPE',
  // 比較
  'COMP_RANK', 'COMP_RANK_AVG', 'COMP_COLUMN', 'START_END_CAGR', 'COMP_TWO_DELTA', 'COMP_VARIANCE',
  // 構成
  'SIZE_MIX_CAGR', 'MIX_SNAPSHOT', 'MIX_BAR100', 'MIX_MEKKO', 'MIX_MEKKO_GROWTH', 'MIX_PAIR_SHARE',
  // 要因
  'CONTRIB_WATERFALL', 'CONTRIB_DRIVERS', 'CONTRIB_POSNEG',
  // 関係
  'REL_SCATTER', 'REL_QUADRANT', 'REL_BUBBLE',
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

/** 1枚の組み立て方 */
export const COMPOSITION_TYPES = ['SINGLE_CHART', 'CHART_TABLE', 'TWO_CHARTS'] as const;
export type CompositionType = (typeof COMPOSITION_TYPES)[number];

/** アプリが固定の式で計算する値（AI には計算させない） */
export const DERIVED_METRIC_IDS = ['cagr', 'difference', 'change_rate', 'share', 'total', 'rank', 'average'] as const;
export type DerivedMetricId = (typeof DERIVED_METRIC_IDS)[number];

/** 利用場面 */
export const AUDIENCE_IDS = ['EXECUTIVE_MEETING', 'SALES_MEETING', 'REPORT', 'OTHER'] as const;
export type AudienceId = (typeof AUDIENCE_IDS)[number];

export const RECIPE_STATUSES = ['ACTIVE', 'DRAFT', 'DISABLED'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];
