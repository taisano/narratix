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
const COMBO: ChartTypeId[] = ['combo'];
const AXIS_CHARTS: ChartTypeId[] = [...TREND, ...COMPARISON, ...CONTRIBUTION, ...RELATIONSHIP, 'variable_width', 'small_multiples_bar'];

const o = (value: string, ja: string, en: string): ControlOption => ({ value, label: { ja, en } });
const L = (ja: string, en: string): LocalizedText => ({ ja, en });
const def = (d: ControlDef) => d;

/**
 * 詳細設定（registry-spec.md「Control：詳細設定」）。
 * 適用先はチャート単位で持ち、チャート側の設定一覧は controlsFor() で逆引きする。
 * defaultValue は NarratiX の DEFAULT_*（Code.gs 105〜121 行）に合わせる。docs/narratix-rules.md「4. 既定値」
 */
export const CONTROLS: Record<ControlId, ControlDef> = {
  title: def({ id: 'title', label: L('メッセージタイトル（結論）', 'Message title (takeaway)'), type: 'text', appliesTo: ALL, origin: 'existing' }),
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
    // 散布図・バブルは行＝項目、列＝指標で固定（入れ替えると項目と指標が逆になり意味をなさない）
    appliesTo: ALL.filter((c) => !CONTRIBUTION.includes(c) && !RELATIONSHIP.includes(c) && c !== 'variable_width' && c !== 'slope_pair'), origin: 'existing',
    options: [o('normal', '通常（行→横軸）', 'Normal (rows on the axis)'), o('swapped', '入れ替え（列→横軸）', 'Swapped (columns on the axis)')], defaultValue: 'normal',
  }),
  // 絞り込みは入力したデータの行・列に対して行う（軸の入れ替えの前）
  items: def({ id: 'items', label: L('表示する行', 'Rows to show'), type: 'data_multi_select', appliesTo: ALL, origin: 'existing' }),
  series: def({ id: 'series', label: L('表示する列', 'Columns to show'), type: 'data_multi_select', appliesTo: ALL, origin: 'existing' }),
  // スロープは複数を強調できる（highlights）。1つだけの強調はそれ以外のチャート
  highlight: def({ id: 'highlight', label: L('強調', 'Highlight'), type: 'data_select', dataSource: 'cols', appliesTo: ALL.filter((c) => c !== 'slope' && c !== 'slope_pair'), origin: 'existing' }),
  highlight_color: def({
    id: 'highlight_color', label: L('強調の色', 'Highlight color'), type: 'select', origin: 'existing',
    // 強調の色を描き分けるチャートだけ（差・寄与のチャートは増減の色を使うので対象外）
    appliesTo: ['mekko', 'stacked_100', 'stacked_column', 'line', 'column_trend', 'bar_trend', 'bar_rank', 'column_compare', 'clustered_column', 'bar_100', 'slope', 'slope_pair', 'share_pair', 'scatter', 'bubble', 'variable_width', 'combo'],
    // 1つだけ強調した時の、強調した項目の色（ほかは薄いグレー）。既定は紺。none は古い保存データ用（紺として描く）
    options: [o('navy', '紺', 'Navy'), o('red', '赤', 'Red'), o('orange', 'オレンジ', 'Orange'), o('teal', 'ティール', 'Teal'), o('purple', '紫', 'Purple'), o('gold', 'ゴールド', 'Gold'), o('none', '紺', 'Navy')],
    defaultValue: 'navy',
  }),
  highlights: def({ id: 'highlights', label: L('強調（いくつでも）', 'Highlight (any number)'), type: 'data_multi_select', dataSource: 'cols', appliesTo: ['slope', 'slope_pair'], origin: 'new' }),
  gridlines: def({
    id: 'gridlines', label: L('目盛線', 'Gridlines'), type: 'select', appliesTo: [...AXIS_CHARTS, ...COMBO], origin: 'existing',
    options: [o('off', 'なし', 'Off'), o('light', '薄く', 'Light'), o('on', 'あり', 'On')], defaultValue: 'off',
  }),
  data_labels: def({
    id: 'data_labels', label: L('値ラベル', 'Data labels'), type: 'select', appliesTo: AXIS_CHARTS, origin: 'existing',
    options: [o('off', 'なし', 'Off'), o('all', 'すべて', 'All'), o('ends', '最初と最後', 'First & last'), o('highlight', '強調だけ', 'Highlighted only')], defaultValue: 'off',
  }),
  // 横軸の項目が多い時の項目名：自動（入らなければ小さく）・小さく・縦書き・間引く
  x_labels: def({
    id: 'x_labels', label: L('横軸の項目名', 'X-axis labels'), type: 'select',
    appliesTo: ['line', 'column_trend', 'stacked_column', 'stacked_100', 'clustered_column', 'column_compare', 'waterfall', 'combo'], origin: 'new',
    options: [o('auto', '自動', 'Auto'), o('small', '小さく', 'Smaller'), o('vertical', '縦書き', 'Vertical'), o('thin', '間引く', 'Skip some')], defaultValue: 'auto',
  }),
  // CAGR の表（推移＋CAGR表などの右の表）に出す列。折れ線に値が出ているので、既定は開始・終了の値を出さず「増減＋CAGR」
  cagr_table_cols: def({
    id: 'cagr_table_cols', label: L('CAGR 表の列', 'CAGR table columns'), type: 'select',
    appliesTo: ['line', 'stacked_column'], origin: 'new',
    options: [o('delta_cagr', '増減＋CAGR', 'Change + CAGR'), o('cagr', 'CAGR だけ', 'CAGR only'), o('values_cagr', '開始・終了＋CAGR', 'Start, end + CAGR'), o('all', '開始・終了・増減＋CAGR', 'Start, end, change + CAGR')], defaultValue: 'delta_cagr',
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
    appliesTo: ['bar_rank', 'column_compare', 'stacked_column', 'stacked_100', 'mekko', 'bar_100', 'share_pair', 'line', 'column_trend', 'bar_trend', 'clustered_column', 'variance_bar', 'slope'],
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
  // 2期間の100%積み上げ（カテゴリ別）の下の行
  pair_growth: def({ id: 'pair_growth', label: L('市場の伸び率の行', 'Market growth row'), type: 'toggle', appliesTo: ['share_pair'], origin: 'new', defaultValue: true }),
  pair_delta: def({ id: 'pair_delta', label: L('強調した項目の増減の行', 'Change row for the highlighted item'), type: 'toggle', appliesTo: ['share_pair'], origin: 'new', defaultValue: true }),
  // 散布図・バブルの X と Y の入れ替え（1列目と2列目のどちらを横軸にするか）
  xy_swap: def({
    id: 'xy_swap', label: L('X と Y の入れ替え', 'Swap X and Y'), type: 'select', appliesTo: RELATIONSHIP, origin: 'new',
    options: [o('normal', '通常（1列目→横軸）', 'Normal (column 1 on X)'), o('swapped', '入れ替え（2列目→横軸）', 'Swapped (column 2 on X)')], defaultValue: 'normal',
  }),
  show_corr: def({ id: 'show_corr', label: L('相関係数を表示', 'Show correlation'), type: 'toggle', appliesTo: RELATIONSHIP, origin: 'new', defaultValue: false }),
  // 散布図・バブルの軸の名前（空なら列の名前）
  // 2期間の積み上げの高さ：100%（構成比を比べる）か、実数（合計の大きさの違いも見せる）
  pair_scale: def({
    id: 'pair_scale', label: L('棒の高さ', 'Bar height'), type: 'select', appliesTo: ['share_pair'], origin: 'new',
    options: [o('pct', '100%', '100%'), o('value', '実数', 'Actual values')], defaultValue: 'pct',
  }),
  pair_labels: def({
    id: 'pair_labels', label: L('棒の中のラベル', 'Labels in bars'), type: 'select', appliesTo: ['share_pair'], origin: 'new',
    options: [o('pct', '%', '%'), o('value', '実数', 'Values'), o('none', 'なし', 'None')], defaultValue: 'pct',
  }),
  // 幅が変わる縦棒：幅と高さに使う列、並び順
  vw_width: def({ id: 'vw_width', label: L('棒の幅（規模）', 'Bar width (size)'), type: 'data_select', dataSource: 'cols', appliesTo: ['variable_width'], origin: 'new' }),
  vw_height: def({ id: 'vw_height', label: L('棒の高さ（水準）', 'Bar height (level)'), type: 'data_select', dataSource: 'cols', appliesTo: ['variable_width'], origin: 'new' }),
  vw_sort: def({
    id: 'vw_sort', label: L('並び順', 'Sort'), type: 'select', appliesTo: ['variable_width'], origin: 'new',
    options: [o('height', '高さの順', 'By height'), o('width', '幅の順', 'By width'), o('data', '表の順', 'Table order')], defaultValue: 'height',
  }),
  // 基準線の値と名前（空なら平均）
  ref_value: def({ id: 'ref_value', label: L('基準線の値', 'Reference value'), type: 'text', appliesTo: ['variable_width', 'combo'], origin: 'new' }),
  ref_label: def({ id: 'ref_label', label: L('基準線の名前', 'Reference label'), type: 'text', appliesTo: ['variable_width', 'combo'], origin: 'new' }),
  ref_axis: def({
    id: 'ref_axis', label: L('基準線の軸', 'Reference axis'), type: 'select', appliesTo: COMBO, origin: 'new',
    options: [o('left', '左軸', 'Left axis'), o('right', '右軸', 'Right axis')], defaultValue: 'left',
  }),
  // ──── 縦棒＋折れ線（combo）。系列ごとの設定は画面の「系列の設定」で（combo_series） ────
  combo_series: def({ id: 'combo_series', label: L('系列の設定', 'Series settings'), type: 'series_config', appliesTo: COMBO, origin: 'new' }),
  combo_bar_mode: def({
    id: 'combo_bar_mode', label: L('棒の表示方法', 'Columns'), type: 'select', appliesTo: COMBO, origin: 'new',
    options: [o('clustered', '集合', 'Clustered'), o('stacked', '積み上げ', 'Stacked')], defaultValue: 'clustered',
  }),
  combo_gaps: def({
    id: 'combo_gaps', label: L('空欄の扱い（線）', 'Missing values (lines)'), type: 'select', appliesTo: COMBO, origin: 'new',
    options: [o('gap', '途切れさせる', 'Leave a gap'), o('connect', 'つなぐ', 'Connect')], defaultValue: 'gap',
  }),
  combo_change: def({
    id: 'combo_change', label: L('変化の出し方', 'Change shown'), type: 'select', appliesTo: COMBO, origin: 'new',
    options: [o('auto', '自動（増減と増減率／率はpt）', 'Auto (change and %, pt for rates)'), o('diff', '増減', 'Change'), o('rate', '増減率', '% change'), o('cagr', 'CAGR（年のみ）', 'CAGR (years only)')], defaultValue: 'auto',
  }),
  combo_left_title: def({ id: 'combo_left_title', label: L('左軸の名前', 'Left axis title'), type: 'text', appliesTo: COMBO, origin: 'new' }),
  combo_right_title: def({ id: 'combo_right_title', label: L('右軸の名前', 'Right axis title'), type: 'text', appliesTo: COMBO, origin: 'new' }),
  combo_left_min: def({ id: 'combo_left_min', label: L('左軸の最小', 'Left axis min'), type: 'text', appliesTo: COMBO, origin: 'new' }),
  combo_left_max: def({ id: 'combo_left_max', label: L('左軸の最大', 'Left axis max'), type: 'text', appliesTo: COMBO, origin: 'new' }),
  combo_right_min: def({ id: 'combo_right_min', label: L('右軸の最小', 'Right axis min'), type: 'text', appliesTo: COMBO, origin: 'new' }),
  combo_right_max: def({ id: 'combo_right_max', label: L('右軸の最大', 'Right axis max'), type: 'text', appliesTo: COMBO, origin: 'new' }),
  combo_left_zero: def({ id: 'combo_left_zero', label: L('左軸を0から', 'Left axis from 0'), type: 'toggle', appliesTo: COMBO, origin: 'new', defaultValue: true }),
  combo_right_zero: def({ id: 'combo_right_zero', label: L('右軸を0から', 'Right axis from 0'), type: 'toggle', appliesTo: COMBO, origin: 'new', defaultValue: true }),
  // スロープ：始点・終点の年（空なら最初と最後）、項目ごとの変化、数値の桁、合計の名前
  slope_from: def({ id: 'slope_from', label: L('始点', 'Start'), type: 'data_select', dataSource: 'rows', appliesTo: ['slope', 'slope_pair'], origin: 'new' }),
  slope_to: def({ id: 'slope_to', label: L('終点', 'End'), type: 'data_select', dataSource: 'rows', appliesTo: ['slope', 'slope_pair'], origin: 'new' }),
  slope_change: def({
    id: 'slope_change', label: L('項目ごとの変化', 'Change per item'), type: 'select', appliesTo: ['slope', 'slope_pair'], origin: 'new',
    options: [o('pct', '増減率', '% change'), o('diff', '増減', 'Change'), o('cagr', 'CAGR', 'CAGR'), o('none', 'なし', 'None')], defaultValue: 'pct',
  }),
  decimals: def({
    id: 'decimals', label: L('小数点以下の桁', 'Decimal places'), type: 'select', appliesTo: ['slope', 'slope_pair'], origin: 'new',
    options: [o('auto', '自動', 'Auto'), o('0', '0桁', '0'), o('1', '1桁', '1'), o('2', '2桁', '2')], defaultValue: 'auto',
  }),
  total_label: def({ id: 'total_label', label: L('合計の名前', 'Total label'), type: 'text', appliesTo: ['slope', 'slope_pair'], origin: 'new' }),
  source_left: def({ id: 'source_left', label: L('左の出典（任意）', 'Left source (optional)'), type: 'text', appliesTo: ['slope_pair'], origin: 'new' }),
  source_right: def({ id: 'source_right', label: L('右の出典（任意）', 'Right source (optional)'), type: 'text', appliesTo: ['slope_pair'], origin: 'new' }),
  pair_total_label: def({ id: 'pair_total_label', label: L('全体のペアの名前（例：Global）', 'Total pair name (e.g. Global)'), type: 'text', appliesTo: ['share_pair'], origin: 'new' }),
  x_title: def({ id: 'x_title', label: L('横軸（X）の名前', 'X-axis title'), type: 'text', appliesTo: RELATIONSHIP, origin: 'new' }),
  y_title: def({ id: 'y_title', label: L('縦軸（Y）の名前', 'Y-axis title'), type: 'text', appliesTo: RELATIONSHIP, origin: 'new' }),
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
    // 保存するのは ID だけ。色の値は engine/theme.ts が持つ（docs/decisions.md「配色のテーマ」）
    options: [o('default', 'マルチカラー', 'Multicolor'), o('quiet_steel_blue', 'Quiet Steel Blue', 'Quiet Steel Blue')],
    defaultValue: 'default',
  }),
};
