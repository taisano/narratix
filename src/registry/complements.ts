import type { ComplementId } from './ids';
import type { ComplementDef } from './types';

const L = (ja: string, en: string) => ({ ja, en });

/**
 * 補完パーツ12種（registry-spec.md「ComplementPart：補完パーツ」）。
 * appliesTo は設計書の「主な適用チャート」と、各チャートの「推奨補完」の和集合。
 */
export const COMPLEMENTS: Record<ComplementId, ComplementDef> = {
  aligned_table: {
    id: 'aligned_table', label: L('揃えた表', 'Aligned table'),
    covers: ['growth', 'size'], placement: 'panel',
    appliesTo: ['mekko', 'stacked_column', 'bar_rank', 'heatmap', 'slope', 'column_compare', 'variance_bar', 'bar_100', 'waterfall'],
    requiresBase: 'when_growth',
    panel: {
      kind: 'table', table: 'growth_table',
      default: { layout: 'p02_top_bottom', hostSlot: 'top', slot: 'bottom', ratios: [0.75], align: 'columns' },
      byChart: {
        mekko: { layout: 'p05_left_main_bottom', hostSlot: 'main', slot: 'bottom', ratios: [0.17, 0.75], align: 'columns' },
        bar_rank: { layout: 'p03_left_right', hostSlot: 'left', slot: 'right', ratios: [0.65], align: 'rows' },
        heatmap: { layout: 'p03_left_right', hostSlot: 'left', slot: 'right', ratios: [0.65], align: 'rows' },
      },
    },
    suggestText: L('{gap}が見えません。列幅を揃えた表を足すと解決します。', '{gap} is not visible. Add an aligned table to show it.'),
  },
  delta_labels: {
    id: 'delta_labels', label: L('増減ラベル', 'Change labels'),
    covers: ['growth', 'mix_change'], placement: 'in_chart',
    appliesTo: ['mekko', 'stacked_100', 'clustered_column', 'column_trend', 'bar_trend'],
    requiresBase: 'always',
    suggestText: L('変化の大きさが見えません。増減ラベル（+18pt、+12%）を足せます。', 'The size of the change is not visible. Add change labels (+18pt, +12%).'),
  },
  cagr_note: {
    id: 'cagr_note', label: L('CAGR注記', 'CAGR note'),
    covers: ['growth'], placement: 'in_chart',
    appliesTo: ['line', 'stacked_column', 'mekko', 'column_trend'],
    // 横軸が年（1900〜2100 の整数が2つ以上）なら、最初の年→最後の年で計算する（NarratiX の buildCalc と同じ）。
    // 比較期間のデータは使わない
    requiresBase: 'never',
    suggestText: L('期間の成長率が見えません。系列の端にCAGRを添えられます。', 'Period growth is not visible. Add a CAGR note at the end of the series.'),
  },
  total_labels: {
    id: 'total_labels', label: L('合計ラベル', 'Total labels'),
    covers: ['size'], placement: 'in_chart',
    appliesTo: ['stacked_100', 'bar_100', 'stacked_column'],
    requiresBase: 'never',
    suggestText: L('規模が見えません。棒の上に合計値を表示できます。', 'Size is not visible. Show totals above the bars.'),
  },
  reference_line: {
    id: 'reference_line', label: L('参照線', 'Reference line'),
    covers: ['benchmark'], placement: 'in_chart',
    appliesTo: ['line', 'bar_rank', 'scatter', 'column_compare', 'posneg_bar', 'small_multiples_bar'],
    requiresBase: 'when_previous_year',
    suggestText: L('良し悪しの基準が見えません。平均・目標・前年の線を引けます。', 'There is no benchmark. Add an average, target or prior-year line.'),
  },
  insight_box: {
    id: 'insight_box', label: L('示唆ボックス', 'Insight box'),
    covers: ['interpretation'], placement: 'panel',
    appliesTo: ['waterfall', 'driver_bar', 'posneg_bar', 'clustered_column', 'small_multiples_bar'],
    requiresBase: 'never',
    panel: {
      kind: 'text',
      default: { layout: 'p03_left_right', hostSlot: 'left', slot: 'right', ratios: [0.75], align: null },
    },
    suggestText: L('解釈や次のアクションが見えません。右側に示唆ボックスを置けます。', 'The implication is not stated. Add an insight box on the right.'),
  },
  callout: {
    id: 'callout', label: L('吹き出し注釈', 'Callout'),
    covers: ['reason'], placement: 'in_chart',
    appliesTo: ['line', 'waterfall'],
    requiresBase: 'never',
    suggestText: L('変化の理由が見えません。出来事を吹き出しで添えられます。', 'The reason for the change is not visible. Add a callout.'),
  },
  sparkline: {
    id: 'sparkline', label: L('スパークライン', 'Sparkline'),
    covers: ['time_change'], placement: 'in_chart',
    appliesTo: ['heatmap', 'leaderboard'],
    // TODO: 3時点以上のデータは現在の Dataset（current / base の2時点）では表せない。Dataset の拡張が必要
    requiresBase: 'always', minPeriods: 3,
    suggestText: L('時間の変化が見えません。表の中にミニ推移線を入れられます。', 'Change over time is not visible. Add sparklines in the table.'),
  },
  rank_change: {
    id: 'rank_change', label: L('順位変化', 'Rank change'),
    covers: ['rank_change'], placement: 'in_chart',
    appliesTo: ['bar_rank', 'leaderboard'],
    requiresBase: 'always',
    suggestText: L('順位の変化が見えません。↑2、↓1 の記号を添えられます。', 'Rank movement is not visible. Add ↑2 / ↓1 markers.'),
  },
  quadrants: {
    id: 'quadrants', label: L('象限', 'Quadrants'),
    covers: ['position'], placement: 'in_chart',
    appliesTo: ['scatter', 'bubble'],
    requiresBase: 'never',
    suggestText: L('位置の意味が見えません。中央値・平均・手入力で象限に分けられます。', 'Positions have no meaning yet. Split into quadrants by median, average or a manual value.'),
  },
  trajectory: {
    id: 'trajectory', label: L('軌跡矢印', 'Trajectory'),
    covers: ['time_change'], placement: 'in_chart',
    appliesTo: ['scatter', 'bubble'],
    requiresBase: 'always',
    suggestText: L('ポジションの変化が見えません。比較期間からの矢印を描けます。', 'Movement is not visible. Draw arrows from the comparison period.'),
  },
  small_multiples: {
    id: 'small_multiples', label: L('小さなチャートに分割', 'Small multiples'),
    covers: ['readability'], placement: 'in_chart',
    appliesTo: ['line', 'stacked_100'],
    requiresBase: 'never',
    suggestText: L('系列が多すぎて読めません。同じ軸の小さなチャートに分けられます。', 'Too many series to read. Split into small charts on the same axis.'),
  },
};
