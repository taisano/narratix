import { carrySide } from './sides';
import { registry, type ChartTypeId, type ControlId } from '@/registry';
import { isSampleData } from './fromRecipe';
import { SCHEMA_SAMPLE, SPECIAL_SAMPLE, dropDataBound, hasBase, isTwoMetricChart, purposeOf, sampleFor, type BuilderState } from './state';

/**
 * チャートを替えた時に持っていかない設定（そのチャートだけの文字や選択）。
 * 行き先のチャートに効かないものは外す。共通の設定（タイトル・出典・単位・数値の表記など）は残す
 */
const CHART_BOUND: readonly ControlId[] = [
  'x_title', 'y_title', 'source_left', 'source_right', 'total_label', 'pair_total_label', 'ref_label', 'ref_value',
  'vw_width', 'vw_height', 'slope_from', 'slope_to',
];

function keepFor(controls: BuilderState['controls'], chart: ChartTypeId): BuilderState['controls'] {
  const out = { ...controls };
  for (const k of CHART_BOUND) if (!registry.controls[k].appliesTo.includes(chart)) delete out[k];
  return out;
}

export interface SwitchResult {
  state: BuilderState;
  /** 2指標スロープから出た時に外した右の指標の名前（画面に「外しました・元に戻す」を出す）。外していなければ null */
  removedPair: string | null;
}

/**
 * チャートの切り替え（必ず切り替わる。確認で止めない）。
 * - 見本のデータのままで、データの形が違うチャートへ → そのチャートの見本に替える（前のデータの設定は外す）
 * - 2指標スロープから自分のデータのまま出る → 右の指標の表と左右の指標名を外す（ほかのチャートでは前の期間として読まれるため）。
 *   外したことは画面に出し、「元に戻す」で戻せる
 * - 行き先のチャートに効かない、そのチャートだけの設定（軸の名前・左右の出典・合計の名前など）は持っていかない
 */
/** チャートを替える。付け合わせ（右の差分バー・CAGR の表）は、新しいチャートでも使えれば引き継ぐ */
export function switchChart(s: BuilderState, chart: ChartTypeId): SwitchResult {
  const r = switchChartOnly(s, chart);
  return { ...r, state: carrySide(s, r.state) };
}

function switchChartOnly(s: BuilderState, chart: ChartTypeId): SwitchResult {
  if (chart === s.chart) return { state: s, removedPair: null };
  const want = registry.purposes[registry.charts[chart].purpose].schema;
  const have = registry.purposes[purposeOf(s)].schema;
  const sample = isSampleData(s);
  // 専用の見本があるチャート（2指標スロープ・縦棒＋折れ線）に出入りする時は、見本を替える
  if (sample && (SPECIAL_SAMPLE[chart] || SPECIAL_SAMPLE[s.chart])) {
    const special = SPECIAL_SAMPLE[chart];
    return { state: { ...s, chart, controls: dropDataBound(s.controls), ...(special ? special(s.slideLocale) : sampleFor(SCHEMA_SAMPLE[want] ?? 'trend', s.slideLocale)) }, removedPair: null };
  }
  if (sample && want !== have && SCHEMA_SAMPLE[want] !== SCHEMA_SAMPLE[have]) {
    return { state: { ...s, chart, controls: dropDataBound(s.controls), ...sampleFor(SCHEMA_SAMPLE[want] ?? 'trend', s.slideLocale) }, removedPair: null };
  }
  const controls = keepFor(s.controls, chart);
  // 2つの指標のチャートどうし（2指標スロープ ⇄ 指標間の順位スロープ）なら、左右の指標はそのまま使う
  if (isTwoMetricChart(s.chart) && !isTwoMetricChart(chart)) {
    // 左右の指標の名前（期間の名前の欄に入っている）は、ほかのチャートでは意味が違うので必ず外す
    const d = s.dataset;
    const removed = hasBase(s) ? d.periods.base.label || '—' : null;
    return {
      state: { ...s, chart, controls, dataset: { ...d, periods: { current: { ...d.periods.current, label: '' }, base: { label: '', values: d.rows.map(() => d.cols.map(() => null)) } } } },
      removedPair: removed,
    };
  }
  return { state: { ...s, chart, controls }, removedPair: null };
}
