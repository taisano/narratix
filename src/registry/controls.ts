import { CHART_TYPE_IDS, type ChartTypeId, type ControlId } from './ids';
import type { ControlDef, ControlOption } from './types';
import type { LocalizedText } from './locale';

const ALL = CHART_TYPE_IDS;
const TREND: ChartTypeId[] = ['line', 'column_trend', 'bar_trend', 'stacked_column', 'stacked_100', 'slope'];
const COMPARISON: ChartTypeId[] = ['bar_rank', 'column_compare', 'clustered_column', 'variance_bar'];
const CONTRIBUTION: ChartTypeId[] = ['waterfall', 'driver_bar', 'posneg_bar'];
const RELATIONSHIP: ChartTypeId[] = ['scatter', 'bubble'];
const EVALUATE: ChartTypeId[] = ['heatmap', 'small_multiples_bar', 'leaderboard'];
/** 「棒・折れ線・散布図系」。構成比チャート（mekko、bar_100）と表形式（heatmap、leaderboard）を除く */
const AXIS_CHARTS: ChartTypeId[] = [...TREND, ...COMPARISON, ...CONTRIBUTION, ...RELATIONSHIP, 'small_multiples_bar'];

const o = (value: string, ja: string, en: string): ControlOption => ({ value, label: { ja, en } });
const L = (ja: string, en: string): LocalizedText => ({ ja, en });
const def = (d: ControlDef) => d;

/**
 * 詳細設定（registry-spec.md「Control：詳細設定」）。
 * 適用先はチャート単位で持ち、チャート側の設定一覧は controlsFor() で逆引きする。
 * defaultValue は NarratiX の DEFAULT_*（Code.gs 105〜121 行）に合わせる。docs/narratix-rules.md「4. 既定値」
 */
export const CONTROLS: Record<ControlId, ControlDef> = {
  title: def({ id: 'title', label: L('タイトル（メッセージ）', 'Title (message)'), type: 'text', appliesTo: ALL, origin: 'existing' }),
  subtitle: def({ id: 'subtitle', label: L('サブタイトル', 'Subtitle'), type: 'text', appliesTo: ALL, origin: 'existing' }),
  source: def({ id: 'source', label: L('出典', 'Source'), type: 'text', appliesTo: ALL, origin: 'existing' }),
  unit: def({ id: 'unit', label: L('単位', 'Unit'), type: 'text', appliesTo: ALL, origin: 'existing' }),
  number_format: def({
    id: 'number_format', label: L('数値の表記', 'Number format'), type: 'select', appliesTo: ALL, origin: 'existing',
    options: [o('raw', 'そのまま', 'Raw'), o('auto', '自動（K・M）', 'Auto (K / M)'), o('K', 'K', 'K'), o('M', 'M', 'M'), o('%', '%', '%')],
    defaultValue: 'raw',
  }),
  // 行と列の入れ替え。データは変えずに見え方だけを変える（NarratiX の AXIS_ORIENTATION と同じ意味）。
  // Mekko・Evaluate でも使えるように広げた（NarratiX では固定だった）。Relationship は X/Y の指標の入れ替え
  axis_swap: def({
    id: 'axis_swap', label: L('行と列の入れ替え', 'Swap rows and columns'), type: 'select',
    appliesTo: ALL.filter((c) => !CONTRIBUTION.includes(c)), origin: 'existing',
    options: [o('normal', '通常（行→横軸）', 'Normal (rows on the axis)'), o('swapped', '入れ替え（列→横軸）', 'Swapped (columns on the axis)')], defaultValue: 'normal',
  }),
  // 絞り込みは入力したデータの行・列に対して行う（軸の入れ替えの前）
  items: def({ id: 'items', label: L('表示する行', 'Rows to show'), type: 'data_multi_select', appliesTo: ALL, origin: 'existing' }),
  series: def({ id: 'series', label: L('表示する列', 'Columns to show'), type: 'data_multi_select', appliesTo: ALL, origin: 'existing' }),
  highlight: def({ id: 'highlight', label: L('強調', 'Highlight'), type: 'data_select', dataSource: 'cols', appliesTo: ALL, origin: 'existing' }),
  gridlines: def({
    id: 'gridlines', label: L('目盛線', 'Gridlines'), type: 'select', appliesTo: AXIS_CHARTS, origin: 'existing',
    options: [o('off', 'なし', 'Off'), o('light', '薄く', 'Light'), o('on', 'あり', 'On')], defaultValue: 'off',
  }),
  data_labels: def({
    id: 'data_labels', label: L('値ラベル', 'Data labels'), type: 'select', appliesTo: AXIS_CHARTS, origin: 'existing',
    options: [o('off', 'なし', 'Off'), o('all', 'すべて', 'All')], defaultValue: 'off',
  }),
  line_markers: def({ id: 'line_markers', label: L('マーカー', 'Markers'), type: 'toggle', appliesTo: ['line'], origin: 'existing', defaultValue: true }),
  // 行（横軸の項目。多くは年）を1つ選び、その行の値で列（系列）を比べる。既定は最後の行（NarratiX と同じ）
  compare_target: def({ id: 'compare_target', label: L('比較の対象', 'Comparison target'), type: 'data_select', dataSource: 'rows', appliesTo: ['bar_rank', 'column_compare'], origin: 'existing' }),
  rank_sort: def({
    id: 'rank_sort', label: L('並び順', 'Sort'), type: 'select', appliesTo: ['bar_rank', 'column_compare'], origin: 'existing',
    options: [o('desc', '降順', 'Descending'), o('asc', '昇順', 'Ascending'), o('input', '入力順', 'Input order')], defaultValue: 'desc',
  }),
  // 基準・比較先も行。既定は最初の行と最後の行。差＝比較先 − 基準（NarratiX と同じ）
  base_target: def({ id: 'base_target', label: L('差分の基準', 'Base'), type: 'data_select', dataSource: 'rows', appliesTo: ['clustered_column', 'variance_bar'], origin: 'existing' }),
  compare_target2: def({ id: 'compare_target2', label: L('比較先', 'Compare to'), type: 'data_select', dataSource: 'rows', appliesTo: ['clustered_column', 'variance_bar'], origin: 'existing' }),
  variance_sort: def({
    id: 'variance_sort', label: L('差の並び順', 'Variance sort'), type: 'select', appliesTo: ['clustered_column', 'variance_bar'], origin: 'existing',
    options: [o('desc', '降順', 'Descending'), o('asc', '昇順', 'Ascending')], defaultValue: 'desc',
  }),
  // 上位 N 件だけ表示（列＝系列・項目のうち）。足せる指標で積み上げ・構成・Mekko なら残りを「その他」にまとめる
  top_n: def({
    id: 'top_n', label: L('上位だけ表示', 'Show top only'), type: 'select',
    appliesTo: ['bar_rank', 'column_compare', 'stacked_column', 'stacked_100', 'mekko', 'bar_100', 'line', 'column_trend', 'bar_trend', 'clustered_column', 'variance_bar', 'slope'],
    origin: 'new', options: [o('all', 'すべて', 'All'), o('3', '上位3', 'Top 3'), o('5', '上位5', 'Top 5'), o('10', '上位10', 'Top 10')], defaultValue: 'all',
  }),
  mekko_labels: def({
    id: 'mekko_labels', label: L('ラベル表示', 'Labels'), type: 'select', appliesTo: ['mekko'], origin: 'existing',
    options: [o('pct', '%のみ', '% only'), o('abs_pct', '実数（%）', 'Absolute (%)'), o('abs', '実数のみ', 'Absolute only'), o('none', 'なし', 'None')],
    defaultValue: 'pct',
  }),
  sort_by_size: def({ id: 'sort_by_size', label: L('規模の大きい順に並べる', 'Sort by size'), type: 'toggle', appliesTo: ['mekko', 'bar_100'], origin: 'new', defaultValue: true }),
  driver_sort: def({
    id: 'driver_sort', label: L('要因の並び順', 'Driver sort'), type: 'select', appliesTo: CONTRIBUTION, origin: 'existing',
    options: [
      o('impact_desc', '影響の大きい順', 'Impact (desc)'), o('impact_asc', '影響の小さい順', 'Impact (asc)'),
      o('input', '入力順', 'Input order'), o('positive_first', 'プラス優先', 'Positive first'),
      o('negative_first', 'マイナス優先', 'Negative first'), o('custom', '任意', 'Custom'),
    ],
    defaultValue: 'impact_desc',
  }),
  show_zero: def({ id: 'show_zero', label: L('値0の要因を表示', 'Show zero drivers'), type: 'toggle', appliesTo: CONTRIBUTION, origin: 'existing', defaultValue: false }),
  mismatch: def({
    id: 'mismatch', label: L('合計が終点と合わない時', 'When drivers do not add up'), type: 'select', appliesTo: CONTRIBUTION, origin: 'existing',
    options: [o('adjustment', '調整項目を追加', 'Add adjustment'), o('autofix_end', '終点を自動補正', 'Auto-fix end')],
    defaultValue: 'adjustment',
  }),
  connectors: def({ id: 'connectors', label: L('連結線', 'Connectors'), type: 'toggle', appliesTo: ['waterfall'], origin: 'existing', defaultValue: true }),
  posneg_color: def({
    id: 'posneg_color', label: L('プラス・マイナスの色', 'Positive / negative colors'), type: 'select', appliesTo: CONTRIBUTION, origin: 'existing',
    options: [o('default', '標準', 'Default'), o('mono', 'モノクロ', 'Monochrome'), o('high_contrast', '高コントラスト', 'High contrast')],
    defaultValue: 'default',
  }),
  bubble_size: def({
    id: 'bubble_size', label: L('バブルの大きさ', 'Bubble size'), type: 'select', appliesTo: ['bubble'], origin: 'existing',
    options: [o('auto', '自動', 'Auto'), o('fixed', '固定スケール', 'Fixed scale')], defaultValue: 'auto',
  }),
  color_scale: def({
    id: 'color_scale', label: L('色の濃淡の基準', 'Color scale'), type: 'select', appliesTo: ['heatmap'], origin: 'existing_hidden',
    options: [o('column', '列ごと', 'By column'), o('row', '行ごと', 'By row'), o('table', '表全体', 'Whole table')],
    defaultValue: 'column',
  }),
  direction: def({
    id: 'direction', label: L('指標の向き', 'Direction'), type: 'select', appliesTo: EVALUATE, origin: 'existing_hidden',
    options: [o('higher', '高い方が良い', 'Higher is better'), o('lower', '低い方が良い', 'Lower is better')],
    defaultValue: 'higher',
  }),
  item_sort: def({
    id: 'item_sort', label: L('項目の並び順', 'Item sort'), type: 'select', appliesTo: EVALUATE, origin: 'existing_hidden',
    options: [o('input', '入力順', 'Input order'), o('avg_desc', '平均の高い順', 'Highest average'), o('avg_asc', '平均の低い順', 'Lowest average')],
    defaultValue: 'input',
  }),
  metric_sort: def({
    id: 'metric_sort', label: L('指標内の並び順', 'Sort within metric'), type: 'select', appliesTo: EVALUATE, origin: 'existing_hidden',
    options: [o('input', '入力順', 'Input order'), o('desc', '降順', 'Descending'), o('asc', '昇順', 'Ascending')],
    defaultValue: 'input',
  }),
  orientation: def({
    id: 'orientation', label: L('棒の向き', 'Orientation'), type: 'select', appliesTo: ['small_multiples_bar'], origin: 'existing_hidden',
    options: [o('horizontal', '横', 'Horizontal'), o('vertical', '縦', 'Vertical')], defaultValue: 'horizontal',
  }),
  palette: def({
    id: 'palette', label: L('配色', 'Palette'), type: 'select', appliesTo: ALL, origin: 'existing',
    options: [o('default', '標準', 'Default'), o('mono', 'モノクロ', 'Monochrome'), o('high_contrast', '高コントラスト', 'High contrast'), o('brand', '会社のブランド色', 'Brand colors')],
    defaultValue: 'default',
  }),
};
