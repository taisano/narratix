import { timeRange } from '@/engine/transform/cagr';
import { FEW_SERIES_MAX, type Conditions, type DataCondition } from '../start/dishes';
import { metricOf, sumGroups } from './meaning';
import { viewAxes, type BuilderState } from './state';

/**
 * 一品料理の表の「データの条件」を、入れたデータから判定する（docs/dish-matrix.md v0.3 3章）。
 * 推移の表（行＝時点、列＝項目）を前提にする。決まった規則だけ（AI は使わない）。
 * 判定できないものは 'unknown'。理由（どの列・どの時点か）も返す
 */

/** 合計・小計・「うち」の項目（内訳と混ざると、足し合わせが二重になる） */
const TOTAL_NAME = /^(合計|総計|計|全体|トータル|total|grand total|all)$|合計|総計|total/i;
const SUBSET_NAME = /小計|うち|内数|of which|subtotal/i;
/** 丸めの差として許す幅（合計の 0.5%、または 0.5） */
const tolerance = (total: number) => Math.max(Math.abs(total) * 0.005, 0.5);

export interface ConditionDetail {
  /** 合計の列（あれば） */
  totalCol?: string;
  /** 合計と項目の和が合わない時点（時点・差） */
  mismatch?: { row: string; diff: number }[];
  /** CAGR を計算できない項目 */
  noCagr?: string[];
}

export function dataConditions(s: BuilderState): { conditions: Conditions; detail: ConditionDetail } {
  const { rows, cols } = viewAxes(s);
  const d = s.dataset;
  const vals = d.periods.current.values;
  const at = (r: string, c: string): number | null => {
    const i = d.rows.indexOf(r), j = d.cols.indexOf(c);
    return i >= 0 && j >= 0 ? vals[i]?.[j] ?? null : null;
  };
  const numbers = rows.flatMap((r) => cols.map((c) => at(r, c))).filter((v): v is number => v != null);
  const c: Conditions = {};
  const detail: ConditionDetail = {};
  const set = (k: DataCondition, v: boolean | null) => { c[k] = v == null ? 'unknown' : v ? 'yes' : 'no'; };

  // 期間の数・系列の数
  set('PERIODS_2', rows.length === 2);
  set('PERIODS_3PLUS', rows.length >= 3);
  set('PERIODS_2PLUS', rows.length >= 2);
  const totalCol = cols.find((x) => TOTAL_NAME.test(x.trim()));
  const parts = cols.filter((x) => x !== totalCol);
  if (totalCol) detail.totalCol = totalCol;
  set('MULTI_SERIES', parts.length >= 2);
  set('FEW_SERIES', parts.length <= FEW_SERIES_MAX);

  // 足し合わせられるか：指標の種類（名前で分からなければ表の単位）。率・指数は足せない
  const metrics = parts.map((x) => {
    const m = metricOf(x, d.unit);
    return m.kind === 'unknown' && d.unit ? { ...metricOf(`${x}（${d.unit}）`, d.unit), name: x } : m;
  });
  const kinds = new Set(metrics.map((m) => m.kind));
  const additive = kinds.has('rate') || kinds.has('index') ? false
    : metrics.every((m) => m.kind === 'unknown') ? null
      : sumGroups(metrics).length === 1;
  set('ADDITIVE', additive);

  // 比率ではなく絶対値のデータか（単位が % ／各時点の和がどれも 100 か 1）
  const pctUnit = /%|％|percent|構成比|シェア/i.test(d.unit ?? '');
  const sums = rows.map((r) => parts.reduce((a, x) => a + (at(r, x) ?? 0), 0));
  const looksShare = rows.length > 0 && sums.every((t) => Math.abs(t - 100) <= 0.6 || Math.abs(t - 1) <= 0.006);
  set('ABSOLUTE_BASE_AVAILABLE', numbers.length ? !(pctUnit || looksShare) : null);

  // 内訳である：足し合わせられ、項目に小計・「うち」が混ざらず、比率ではない
  const subset = parts.some((x) => SUBSET_NAME.test(x));
  set('PARTS_FORM_WHOLE', additive == null ? null : additive && !subset && parts.length >= 2);

  // 合計と一致する：合計の列があり、各時点で項目の和と一致する。合計が無い時は成立しない
  if (!totalCol) c.RECONCILES_TO_TOTAL = 'no';
  else {
    const mismatch = rows.map((r, i) => ({ row: r, total: at(r, totalCol), sum: sums[i]! }))
      .filter((x) => x.total != null && Math.abs(x.total - x.sum) > tolerance(x.total))
      .map((x) => ({ row: x.row, diff: Math.round((x.total! - x.sum) * 100) / 100 }));
    if (mismatch.length) detail.mismatch = mismatch;
    set('RECONCILES_TO_TOTAL', mismatch.length === 0);
  }

  // CAGR：年の期間があり、率ではなく、各項目の始点・終点が正
  const span = timeRange(rows);
  if (!span) set('CAGR_CALCULABLE', false);
  else {
    const from = rows[span.fromIndex]!, to = rows[span.toIndex]!;
    const noCagr = parts.filter((x) => { const a = at(from, x), b = at(to, x); return a == null || b == null || a <= 0 || b <= 0; });
    if (noCagr.length) detail.noCagr = noCagr;
    set('CAGR_CALCULABLE', !kinds.has('rate') && !(pctUnit || looksShare) && noCagr.length === 0);
  }
  return { conditions: c, detail };
}
