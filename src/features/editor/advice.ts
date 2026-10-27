import { isTimeAxis } from '@/engine/transform/cagr';
import { registry, type ChartTypeId } from '@/registry';
import { isRateName } from '@/engine/layout/charts/combo-config';
import { isSwapped, nonAdditiveUnit, toDataset, viewAxes, type BuilderState } from './state';
export { nonAdditiveUnit };

/**
 * チャートとデータの相性（決まった規則。AI は使わない）。
 * 向かない組み合わせなら、理由と、向いているチャート（あれば）を返す。プレビューの上と左の欄に出す。
 */
export type FitCode = 'mekko_time' | 'line_not_time' | 'non_additive_stack' | 'many_columns' | 'many_lines' | 'negative_share' | 'bridge_one_col' | 'relation_cols' | 'relation_years';

export interface FitAdvice {
  code: FitCode;
  suggest?: ChartTypeId;
  vars?: Record<string, string | number>;
}


const STACKED: ChartTypeId[] = ['stacked_column', 'stacked_100', 'mekko', 'bar_100'];
const SHARE: ChartTypeId[] = ['stacked_100', 'mekko', 'bar_100'];
const LINE_LIMIT = 8;
const COLUMN_LIMIT = 12;

export function chartAdvice(s: BuilderState): FitAdvice[] {
  const out: FitAdvice[] = [];
  const { rows, cols } = viewAxes(s);
  const rowsTime = isTimeAxis(rows);
  const chart = s.chart;
  const d = toDataset(s);
  if (chart === 'mekko' && rowsTime) out.push({ code: 'mekko_time', suggest: 'stacked_column' });
  if (chart === 'line' && !rowsTime && rows.length >= 2) out.push({ code: 'line_not_time', suggest: 'column_trend' });
  if (STACKED.includes(chart) && nonAdditiveUnit(d.unit)) out.push({ code: 'non_additive_stack', suggest: rowsTime ? 'line' : 'column_compare', vars: { unit: d.unit ?? '' } });
  if (chart === 'column_compare' && cols.length > COLUMN_LIMIT) out.push({ code: 'many_columns', suggest: 'bar_rank', vars: { n: cols.length } });
  if (chart === 'line' && cols.length > LINE_LIMIT) out.push({ code: 'many_lines', vars: { n: cols.length } });
  if (SHARE.includes(chart) && d.periods.current.values.some((r) => r.some((v) => v != null && v < 0))) out.push({ code: 'negative_share', suggest: rowsTime ? 'line' : 'column_compare' });
  const purpose = registry.charts[chart].purpose;
  if (purpose === 'contribution' && cols.length > 1) out.push({ code: 'bridge_one_col', vars: { col: cols[0] ?? '' } });
  if (purpose === 'relationship' && cols.length < 2) out.push({ code: 'relation_cols' });
  // 列が年（推移の表）なのに散布図・バブル：指標ではなく年を X・Y にしてしまう
  if (purpose === 'relationship' && isTimeAxis(cols)) out.push({ code: 'relation_years', suggest: 'line' });
  return out;
}

export const chartName = (c: ChartTypeId, L: (x: { en: string; ja?: string }) => string) => L(registry.charts[c].label);

/**
 * データの形から「こんな見せ方もできます」（決まった規則。今のチャートと目的が違う時だけ）。
 * 注意（chartAdvice）ではなく、提案が外れた時にエディタで立て直すための案内
 */
export type SuggestCode = 'items_two_metrics' | 'items_three_metrics' | 'single_col_changes' | 'years_rows' | 'hidden_columns';
export interface DataSuggestion { code: SuggestCode; suggest?: ChartTypeId; vars?: Record<string, string | number>; /** 全部の指標を出して見せられる別の形（押すと、列の絞り込みを外してその形にする） */ showAll?: ChartTypeId[] }

export function dataSuggestions(s: BuilderState): DataSuggestion[] {
  const d = s.dataset;
  const rowsTime = isTimeAxis(d.rows);
  const purpose = registry.charts[s.chart].purpose;
  const vals = d.periods.current.values;
  // 表示している列だけで見る（外した列を数えて「指標が2つ」と勧めない）
  const shownCols = viewAxes(s).cols;
  const numericCols = d.cols.filter((c, k) => shownCols.includes(c) && vals.filter((r) => r[k] != null).length >= Math.min(3, d.rows.length));
  const out: DataSuggestion[] = [];
  // データには指標がもっとあるのに、グラフには一部しか出していない：見せ方・表示する列を変えられると知らせる（列の絞り込みを使っている時だけ）
  const hidden = hiddenNames(s);
  if (hidden.length) out.push({ code: 'hidden_columns', vars: { n: hidden.length, names: hidden.slice(0, 4).join('、') + (hidden.length > 4 ? '…' : '') }, showAll: showAllForms(s) });
  // 行が項目（年でない）で、数値の列が2〜3つ：関係（散布図・バブル）
  if (!rowsTime && d.rows.length >= 3 && purpose !== 'relationship') {
    if (numericCols.length === 2) out.push({ code: 'items_two_metrics', suggest: 'scatter' });
    else if (numericCols.length === 3) out.push({ code: 'items_three_metrics', suggest: 'bubble' });
  }
  // 1列だけで、プラスとマイナスが混ざる（始点・増減・終点のよう）：要因
  if (d.cols.length === 1 && d.rows.length >= 4 && purpose !== 'contribution') {
    const v = vals.map((r) => r[0]).filter((x): x is number => x != null);
    if (v.some((x) => x < 0) && v.some((x) => x > 0)) out.push({ code: 'single_col_changes', suggest: 'waterfall' });
  }
  // 行が年なのに、関係・要因のチャート：推移
  // 要因（始点・要因・終点）は、すべての行が時間の時だけ（始点と終点だけ年らしい表に、折れ線を勧めない）
  if (d.rows.length >= 3 && (purpose === 'relationship' ? rowsTime : purpose === 'contribution' && isTimeAxis(d.rows, 1))) out.push({ code: 'years_rows', suggest: 'line' });
  return out;
}

/** グラフに出していない列（行）の名前。「表示する列」の絞り込みで外れているもの */
export function hiddenNames(s: BuilderState): string[] {
  const swapped = isSwapped(s);
  const picked = swapped ? s.controls.items : s.controls.series;
  if (!Array.isArray(picked)) return [];
  const all = swapped ? s.dataset.rows : s.dataset.cols;
  const keep = all.filter((n) => picked.includes(n));
  return keep.length ? all.filter((n) => !keep.includes(n)) : [];
}

/** 全部の指標を出して見せられる形：行が期間なら、量と率があれば組み合わせ・表。行が項目なら、小さな棒・表（見せられない形は、押した時に理由が出る） */
function showAllForms(s: BuilderState): ChartTypeId[] {
  const d = s.dataset;
  const forms: ChartTypeId[] = [];
  const time = isTimeAxis(d.rows);
  if (time && d.cols.some((c) => isRateName(c)) && d.cols.some((c) => !isRateName(c))) forms.push('combo');
  if (!time && d.rows.length >= 3 && d.rows.length <= 12 && d.cols.length >= 2 && d.cols.length <= 6) forms.push('small_multiples_bar');
  forms.push('table_basic');
  return forms.filter((c) => c !== s.chart).slice(0, 2);
}
