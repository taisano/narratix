import { timeRange } from '@/engine/transform/cagr';
import { registry, type ChartTypeId } from '@/registry';
import { nonAdditiveUnit, toDataset, viewAxes, type BuilderState } from './state';
export { nonAdditiveUnit };

/**
 * チャートとデータの相性（決まった規則。AI は使わない）。
 * 向かない組み合わせなら、理由と、向いているチャート（あれば）を返す。プレビューの上と左の欄に出す。
 */
export type FitCode = 'mekko_time' | 'line_not_time' | 'non_additive_stack' | 'many_columns' | 'many_lines' | 'negative_share';

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
  const rowsTime = !!timeRange(rows);
  const chart = s.chart;
  const d = toDataset(s);
  if (chart === 'mekko' && rowsTime) out.push({ code: 'mekko_time', suggest: 'stacked_column' });
  if (chart === 'line' && !rowsTime && rows.length >= 2) out.push({ code: 'line_not_time', suggest: 'column_trend' });
  if (STACKED.includes(chart) && nonAdditiveUnit(d.unit)) out.push({ code: 'non_additive_stack', suggest: rowsTime ? 'line' : 'column_compare', vars: { unit: d.unit ?? '' } });
  if (chart === 'column_compare' && cols.length > COLUMN_LIMIT) out.push({ code: 'many_columns', suggest: 'bar_rank', vars: { n: cols.length } });
  if (chart === 'line' && cols.length > LINE_LIMIT) out.push({ code: 'many_lines', vars: { n: cols.length } });
  if (SHARE.includes(chart) && d.periods.current.values.some((r) => r.some((v) => v != null && v < 0))) out.push({ code: 'negative_share', suggest: rowsTime ? 'line' : 'column_compare' });
  return out;
}

export const chartName = (c: ChartTypeId, L: (x: { en: string; ja?: string }) => string) => L(registry.charts[c].label);
