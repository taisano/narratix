import { sharePair } from './pair';
import { driverBar, posnegBar, waterfall } from './contribution';
import { bubble, scatter } from './relationship';
import { bar100, slope, varianceBar } from './twopoint';
import { clusteredColumn } from './clustered';
import type { ChartTypeId } from '@/registry';
import { mekkoModel } from '../../model/mekko';
import { textWidth } from '../../text';
import { groupedBars, ranking } from './bars';
import type { ChartLayout } from './context';
import { layoutLine } from './line';
import { layoutMekko, MEKKO, type MekkoLabelMode } from './mekko';
import { stackedColumns } from './stacked';
import { layoutStacked100 } from './stacked100';

/** 表の行ラベル列の余白（セル左右の余白と、PowerPoint の太字・代替フォントでの幅の増え分） */
export const TABLE_LABEL_PAD = 0.4;

const mekko: ChartLayout = (ctx) => {
  const m = ctx.matrix;
  const model = mekkoModel(m, { sortBySize: ctx.control<boolean>('sort_by_size') ?? true });
  if (!model.columns.length) ctx.warn({ code: 'no_data' });
  if (m.base && model.missingBase.length) ctx.warn({ code: 'base_missing_rows', params: { rows: model.missingBase.join(', ') } });
  // 左に y_scale で揃える合計棒があるときは、左の余白を「下の表の行ラベル」が入る幅まで詰める
  const leftPartner = ctx.alignedFrom('y_scale');
  const gutter = !leftPartner
    ? MEKKO.defaultGutter
    : Math.max(0.6, ...ctx.alignedTableLabels().map((l) => textWidth(l, 10) + TABLE_LABEL_PAD));
  const hl = ctx.control<string>('highlight');
  return layoutMekko({
    rect: ctx.rect, model, locale: ctx.locale,
    unit: ctx.unit,
    colsLabel: ctx.colsLabel,
    periodLabel: m.current.label,
    labels: ctx.control<MekkoLabelMode>('mekko_labels') ?? 'pct',
    deltaLabels: ctx.complement('delta_labels'),
    highlight: hl ? m.cols.indexOf(hl) : -1,
    palette: ctx.palette,
    gutter,
    axisTitle: !leftPartner,
  });
};

/** 100% 積み上げ：Mekko の左に揃える小さな合計棒か、単独のチャートか */
const stacked100: ChartLayout = (ctx) => {
  const y = ctx.alignTarget('y_scale')?.yScale;
  if (y) {
    const hl = ctx.control<string>('highlight');
    return layoutStacked100({ rect: ctx.rect, matrix: ctx.matrix, locale: ctx.locale, palette: ctx.palette, highlight: hl ? ctx.matrix.cols.indexOf(hl) : -1, yScale: y });
  }
  return stackedColumns('share')(ctx);
};

/** チャートの配置関数。ここにないチャートは「準備中」 */
export const CHART_LAYOUTS: Partial<Record<ChartTypeId, ChartLayout>> = {
  mekko,
  stacked_100: stacked100,
  stacked_column: stackedColumns('value'),
  line: layoutLine,
  column_trend: groupedBars('vertical'),
  bar_trend: groupedBars('horizontal'),
  bar_rank: ranking('horizontal'),
  column_compare: ranking('vertical'),
  clustered_column: clusteredColumn,
  bar_100: bar100,
  variance_bar: varianceBar,
  slope,
  waterfall,
  driver_bar: driverBar,
  posneg_bar: posnegBar,
  scatter,
  bubble,
  share_pair: sharePair,
};

/** 描画を実装済みの補完パーツ（チャートごと）。画面で選べるのはこれだけ */
export const IMPLEMENTED_COMPLEMENTS: Partial<Record<ChartTypeId, readonly string[]>> = {
  mekko: ['aligned_table', 'delta_labels'],
  line: ['cagr_note', 'reference_line'],
  stacked_column: ['cagr_note', 'total_labels'],
  stacked_100: ['total_labels'],
  bar_rank: ['reference_line'],
  column_compare: ['reference_line'],
  clustered_column: ['delta_labels', 'cagr_note', 'total_change'],
  variance_bar: ['total_change'],
  slope: ['total_change'],
  bar_100: ['total_labels'],
  scatter: ['quadrants'],
  bubble: ['quadrants'],
};
