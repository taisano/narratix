import type { ChartTypeId } from '@/registry';
import { slopeEnds } from '@/engine/layout/charts/slope';
import { resolveComboSeries, type ComboSeriesConfig } from '@/engine/layout/charts/combo-config';
import { chartPalette } from '@/engine/theme';
import { vwColumns } from '@/engine/layout/charts/vwidth';
import { isTimeAxis } from '@/engine/transform/cagr';
import { hasBase, slideUsesBase, viewAxes, type BuilderState } from './state';

/**
 * チャートタイトル（何を・どの切り口で示すか）と、その行の右の期間・単位。
 * メッセージタイトル（結論）とは別。保存するのはこの形だけ（無い＝古いスライド＝出さない）
 */
export interface ChartHeader {
  /** チャートタイトルを出すか（期間・単位は showPeriod・showUnit で別に切り替える） */
  show: boolean;
  /** 自分で書いたタイトル。undefined なら自動（データ・チャートから決めた初期値。データを変えると追従する） */
  title?: string;
  /** 自分で書いた期間。undefined なら自動 */
  period?: string;
  /** 期間・単位を出すか（既定は出す） */
  showPeriod?: boolean;
  showUnit?: boolean;
  /** 読み方の注記（Mekko の「幅：…　高さ：…」など）を出典の下に出すか。既定は出さない（チャートタイトルで足りる） */
  showNote?: boolean;
}

/** 読み方の注記があるチャート（画面で「注記」の切り替えを出す） */
export const CHARTS_WITH_NOTE: ChartTypeId[] = ['mekko', 'variable_width', 'bubble'];

/** 新しく作るスライドの既定（古いスライドは chartHeader が無いので、今まで通り出さない） */
export const NEW_CHART_HEADER: ChartHeader = { show: true };

/** 何を示しているか（チャートごとの初期表現） */
const ANALYSIS: Partial<Record<ChartTypeId, { ja: string; en: string }>> = {
  line: { ja: '推移', en: 'trend' },
  column_trend: { ja: '推移', en: 'trend' },
  bar_trend: { ja: '推移', en: 'trend' },
  stacked_column: { ja: '推移と内訳', en: 'trend and breakdown' },
  stacked_100: { ja: '構成比の変化', en: 'change in mix' },
  slope: { ja: '2時点の変化', en: 'change between two points' },
  slope_pair: { ja: '2時点の変化', en: 'change between two points' },
  combo: { ja: '推移', en: 'trend' },
  bar_rank: { ja: '順位', en: 'ranking' },
  column_compare: { ja: '比較', en: 'comparison' },
  clustered_column: { ja: '2時点の比較', en: 'comparison of two periods' },
  variance_bar: { ja: '増減', en: 'change' },
  mekko: { ja: '規模と構成', en: 'size and mix' },
  bar_100: { ja: '構成比の比較', en: 'mix comparison' },
  share_pair: { ja: '構成比の変化', en: 'change in mix' },
  waterfall: { ja: '増減要因', en: 'drivers of change' },
  driver_bar: { ja: '増減要因', en: 'drivers of change' },
  posneg_bar: { ja: '増減', en: 'gains and losses' },
  scatter: { ja: '関係', en: 'relationship' },
  bubble: { ja: '関係', en: 'relationship' },
  variable_width: { ja: '規模と水準', en: 'size and level' },
};

/** 比較軸が行（項目）のチャート。ほかは列（系列）が比較軸 */
const AXIS_IS_ROWS: ChartTypeId[] = ['mekko', 'bar_100', 'share_pair', 'scatter', 'bubble', 'variable_width'];

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
/** 「販売数量（千台）」→「販売数量」。単位は右に出すので、タイトルには入れない */
const stripUnit = (s: string) => s.replace(/\s*[（(][^（）()]*[）)]\s*$/, '').trim();
/** 「2024年度 営業利益」→「営業利益」 */
const stripPeriod = (s: string) => s.replace(/^(?:[Ff][Yy]\s?)?\d{4}(?:\s*(?:年度|年|Q[1-4]))?\s+|^(?:[Ff][Yy]\s?)?\d{4}(?:年度|年)/, '').trim();
const isTimeWord = (s: string) => /^(年|年度|期間|四半期|月|year|years|period|quarter|month|date|fy)$/i.test(s);

/** 指標の名前（分かる時だけ。推測で補わない） */
function metricOf(s: BuilderState, rows: string[], cols: string[]): string {
  const d = s.dataset;
  const ja = s.slideLocale === 'ja';
  const vs = s.chart === 'scatter' || s.chart === 'bubble' || s.chart === 'variable_width';
  const and = (a: string, b: string) => (a && b ? (ja ? `${a}と${b}` : `${a} ${vs ? 'vs.' : 'and'} ${b}`) : '');
  if (s.chart === 'combo') {
    // 主な棒の系列と主な線の系列（例：売上実績と粗利率の推移）
    const list = resolveComboSeries(cols, s.controls.combo_series as ComboSeriesConfig[] | undefined, chartPalette('default', cols.length)).filter((x) => !x.hidden);
    const bar = list.find((x) => x.as === 'column'), line = list.find((x) => x.as === 'line');
    return bar && line ? and(stripUnit(bar.name), stripUnit(line.name)) : stripUnit((bar ?? line)?.name ?? '');
  }
  if (s.chart === 'slope_pair') return and(stripUnit(clean(d.periods.current.label)), stripUnit(clean(d.periods.base.label)));
  if (s.chart === 'scatter' || s.chart === 'bubble') {
    const sw = s.controls.xy_swap === 'swapped';
    return and(stripUnit(cols[sw ? 1 : 0] ?? ''), stripUnit(cols[sw ? 0 : 1] ?? ''));
  }
  if (s.chart === 'variable_width') {
    const v = vwColumns(cols, s.controls.vw_width as string | undefined, s.controls.vw_height as string | undefined);
    return v ? and(stripUnit(cols[v.w]!), stripUnit(cols[v.h]!)) : '';
  }
  if (s.chart === 'waterfall') {
    const first = stripUnit(stripPeriod(clean(rows[0])));
    const last = stripUnit(stripPeriod(clean(rows[rows.length - 1])));
    return first && first === last ? first : '';
  }
  // 縦長の表から切り出した時の指標（例：指標＝販売数量（千台））
  const L = d.long;
  if (L) {
    const f = L.pivot.filters.find((x) => x.value != null && x.col !== L.pivot.share);
    if (f?.value) return stripUnit(String(f.value));
  }
  return '';
}

/**
 * チャートタイトルの初期値（ルールで作る。AI は使わない）：{比較軸}別・{指標}の{分析内容}。
 * 分からない部分は省く。比較軸も指標も分からなければ空（出さない）。メッセージタイトルと同じなら空
 */
export function autoChartTitle(s: BuilderState): string {
  const analysis = ANALYSIS[s.chart];
  if (!analysis) return '';
  const ja = s.slideLocale === 'ja';
  const axes = viewAxes(s);
  const swapped = s.controls.axis_swap === 'swapped';
  const dims = s.dataset.dimensions ?? {};
  const rowsDim = clean(swapped ? dims.cols : dims.rows), colsDim = clean(swapped ? dims.rows : dims.cols);
  let axis = AXIS_IS_ROWS.includes(s.chart) ? rowsDim : colsDim;
  if (s.chart === 'waterfall' || s.chart === 'driver_bar' || s.chart === 'posneg_bar' || s.chart === 'combo') axis = '';
  if (isTimeWord(axis)) axis = '';
  let metric = metricOf(s, axes.rows, axes.cols);
  // 同じ語を重ねない（「地域別・地域別売上の推移」にしない）
  if (axis && metric && (metric.includes(axis) || axis.includes(metric))) axis = '';
  if (metric === axis) metric = '';
  if (!axis && !metric) return '';
  const out: string = ja
    ? `${axis ? `${axis}別` : ''}${axis && metric ? '・' : ''}${metric}${axis && !metric ? 'の' : metric ? 'の' : ''}${analysis.ja}`
    // 英語：Sales by Region: trend ／ Trend by Region ／ Operating profit: drivers of change
    : metric ? `${metric}${axis ? ` by ${axis}` : ''}: ${analysis.en}` : `${analysis.en.charAt(0).toUpperCase()}${analysis.en.slice(1)} by ${axis}`;
  const final = ja ? out : out.charAt(0).toUpperCase() + out.slice(1);
  return final.trim() === clean(s.title) ? '' : final;
}

/** 期間の初期値：時間の行なら最初–最後（スロープは選んだ2時点）。そうでなければ期間の名前（比較期間を使うなら 比較–現在） */
export function autoPeriod(s: BuilderState): string {
  const { rows } = viewAxes(s);
  if (s.chart === 'slope' || s.chart === 'slope_pair') {
    const e = slopeEnds(rows, s.controls.slope_from as string | undefined, s.controls.slope_to as string | undefined);
    return e && isTimeAxis(rows) ? `${rows[e.a]}–${rows[e.b]}` : '';
  }
  const pick = (id: 'compare_target' | 'base_target' | 'compare_target2', fallback: number) => {
    const v = s.controls[id];
    return typeof v === 'string' && rows.includes(v) ? v : rows[fallback] ?? '';
  };
  // ランキング・比較：比べている時点（チャートの中の「2025時点」の代わり）
  if (s.chart === 'bar_rank' || s.chart === 'column_compare') return pick('compare_target', rows.length - 1);
  // 集合縦棒・差分バー：基準–比較先（「2021 → 2025 の差」の代わり）
  if (s.chart === 'clustered_column' || s.chart === 'variance_bar') {
    if (rows.length < 2) return '';
    let a = pick('base_target', 0), b = pick('compare_target2', rows.length - 1);
    if (a === b) { a = rows[0]!; b = rows[rows.length - 1]!; }
    return `${a}–${b}`;
  }
  if (rows.length >= 2 && isTimeAxis(rows)) return `${rows[0]}–${rows[rows.length - 1]}`;
  // 要因・関係のチャートと、行が時間でない表：期間の名前（例：2025年）
  const cur = clean(s.dataset.periods.current.label), base = clean(s.dataset.periods.base.label);
  if (hasBase(s) && slideUsesBase(s) && base && cur) return `${base}–${cur}`;
  return cur;
}

/** ViewSpec の slide に入れる3つ（出さないものは入れない） */
export function chartHeaderOf(s: BuilderState): { chartTitle?: string; chartPeriod?: string; chartUnit?: string; chartNote?: 'footer' | 'off' } {
  const h = s.chartHeader;
  // 古いスライド（chartHeader が無い）は今まで通り何も出さない
  if (!h) return {};
  const title = !h.show ? '' : h.title !== undefined ? h.title.trim() : autoChartTitle(s);
  const period = h.showPeriod === false ? '' : (h.period !== undefined ? h.period.trim() : autoPeriod(s));
  // 縦棒＋折れ線は左右の軸の名前に単位を出すので、ここには出さない
  const unit = h.showUnit === false || s.chart === 'combo' ? '' : clean(s.dataset.unit);
  // チャートタイトルを出している時は、読み方の注記はチャートの中に出さない（出典の下か、出さない）
  const note = title ? { chartNote: h.showNote ? 'footer' as const : 'off' as const } : {};
  return { ...(title ? { chartTitle: title } : {}), ...(period ? { chartPeriod: period } : {}), ...(unit ? { chartUnit: unit } : {}), ...note };
}

