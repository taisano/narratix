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
  'mekko', 'bar_100',
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
  'color_scale', 'direction', 'item_sort', 'metric_sort', 'orientation', 'palette',
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

export const TRANSFORM_IDS = ['aggregate_rows', 'select_periods', 'growth', 'share', 'delta_share', 'filter', 'sort'] as const;
export type TransformId = (typeof TRANSFORM_IDS)[number];

export const TABLE_IDS = ['growth_table', 'data_table'] as const;
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
