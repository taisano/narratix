import type { StoryTemplateId } from '@/registry';
import type { TemplateContent, TemplateLook } from '@/engine/layout/templates/types';
import {
  CHART_TYPE_IDS, RECIPE_DB_VERSION, complementNeedsBase, complementPlacement, controlsFor, primaryChart, registry, validateViewSpec,
  type ChartTypeId, type RecipeDef, type RecipeId, type Transform, type ComplementId, type ControlId, type Dataset, type Locale, type Panel, type PurposeId,
  type ValidationResult, type ViewSpec,
} from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { growthSpan } from '@/engine/transform/cagr';
import { nonAdditiveUnit } from '@/engine/format';
import { themeIdOf } from '@/engine/theme';
import { NEW_CHART_HEADER, chartHeaderOf, type ChartHeader } from './chartHeader';
import type { TextMeta } from '../data/text';
import { sourceMetaOf, type SourceMeta } from '../data/source';
import type { SlideCoach } from '../start/coach';
import { slideText } from '@/i18n/slide';
import {
  BRIDGE_SAMPLE, BRIDGE_TITLE, BRIDGE_TITLE_EN, RELATION_SAMPLE, RELATION_TITLE, RELATION_TITLE_EN, SAMPLE_DATASET, SAMPLE_SOURCE, SAMPLE_SOURCE_EN,
  SAMPLE_TITLE, SAMPLE_TITLE_EN, TREND_SAMPLE, TREND_SOURCE, TREND_TITLE, TREND_TITLE_EN, sampleDatasetEn, sampleNameEn,
  PAIR_TITLE, PAIR_TITLE_EN, pairSampleDataset, COMBO_TITLE, COMBO_TITLE_EN, comboSampleDataset,
  PLACEHOLDER_TITLE, PLACEHOLDER_TITLE_EN, neutralDataset,
} from './sample';

type Period = NonNullable<Dataset['periods']['base']>;

/**
 * エディタの画面の状態（保存形式 v2）。保存・出力の単位は ViewSpec なので、
 * 描画・検証・保存のたびに toViewSpec() で ViewSpec に変換する。
 */
export interface BuilderState {
  version: 2;
  /** 比較期間は画面上は常に持ち、全セルが空なら「なし」として扱う */
  dataset: Dataset & { periods: { base: Period } };
  chart: ChartTypeId;
  title: string;
  /** メッセージタイトルを誰が書き、どのデータを根拠にしたか */
  titleMeta?: TextMeta;
  source: string;
  /** 保存用の構造化した出典。source はスライドに表示する citationText */
  sourceMeta?: SourceMeta;
  slideLocale: Locale;
  /** 詳細設定。チャートを切り替えても残し、描く時にそのチャートに効くものだけを使う */
  controls: Partial<Record<ControlId, unknown>>;
  /** 補完パーツのオン・オフ（チャートを切り替えても残す） */
  complements: Partial<Record<ComplementId, boolean>>;
  /** Mekko の複合構成：左の全体の構成、揃えた成長率表の中身 */
  mekko: { showTotal: boolean; growthMode: 'cagr' | 'period'; growthRows: string[] };
  /** どのレシピ（切り口）から作ったか。あれば、レシピのレイアウト・表・変換のとおりに描く */
  recipe?: RecipeId | null;
  /** レシピの標準構成のうち、外した表のパネル（id） */
  hiddenParts?: string[];
  /** チャートタイトルと期間・単位（chartHeader.ts）。無い＝古いスライド＝出さない */
  chartHeader?: ChartHeader;
  /** Coach の推薦（同じ問いの別の見せ方など。start/coach.ts）。無ければエディターで規則から作る */
  coach?: SlideCoach;
  /** このスライドでデータを決めた（ストーリー：ほかのスライドのデータを使うかを聞かない） */
  dataDecided?: boolean;
  /** 色の使い方（ストーリーの編集画面だけ。スライドには保存しない） */
  tone?: 'story';
  /** 見せ方：表・言葉の型（無い＝グラフ）。グラフの設定は残すので、グラフに戻すと元どおり */
  view?: StoryTemplateId;
  /** 表・言葉の型の中身（型ごと。データとは別） */
  content?: TemplateContent;
  /** 表・言葉の型の見せ方（型ごと） */
  look?: TemplateLook;
  /** ほかのスライド（参照の選択肢と番号。プロジェクトから描く時に入れる。保存しない） */
  others?: {
    id: string; n: number; title: string;
    /** 課題→示唆→アクションのアクション（次のアクションに取り込む） */
    actions?: { text: string; owner: string; due: string }[];
    /** KPI スコアカードの数字の行と対象期間（Executive Summary の下書き） */
    kpi?: { lines: string[]; periods: string[] };
  }[];
}

const emptyBase = (d: Dataset): Period => ({ label: '', values: d.rows.map(() => d.cols.map(() => null)) });

const placeholderTitle = (l: Locale) => (l === 'en' ? PLACEHOLDER_TITLE_EN : PLACEHOLDER_TITLE);

/**
 * 目的ごとのサンプル（構成は Mekko の見本、推移・比較は年×項目、要因は利益の増減、関係は項目の指標）。
 * 編集画面では中立の名前（AAA・BBB…）と「ここにタイトル」の案内。showcase は紹介ページ・一覧の絵用の本物らしい見本
 */
export function sampleFor(purpose: PurposeId, slideLocale: Locale = 'ja', showcase = false): Pick<BuilderState, 'dataset' | 'title' | 'titleMeta' | 'source' | 'sourceMeta'> {
  const en = slideLocale === 'en';
  const pick = purpose === 'composition' ? { d: SAMPLE_DATASET, title: en ? SAMPLE_TITLE_EN : SAMPLE_TITLE }
    : purpose === 'contribution' ? { d: BRIDGE_SAMPLE, title: en ? BRIDGE_TITLE_EN : BRIDGE_TITLE }
    : purpose === 'relationship' ? { d: RELATION_SAMPLE, title: en ? RELATION_TITLE_EN : RELATION_TITLE }
    : { d: TREND_SAMPLE, title: en ? TREND_TITLE_EN : TREND_TITLE };
  const named = showcase ? pick.d : neutralDataset(pick.d);
  // 英語のスライドは、見本の項目名・単位も英語にする（数字は同じ）
  const d = structuredClone(en ? sampleDatasetEn(named) : named);
  const dataset = { ...d, periods: { ...d.periods, base: d.periods.base ?? emptyBase(d) } } as BuilderState['dataset'];
  const source = en ? SAMPLE_SOURCE_EN : purpose === 'composition' ? SAMPLE_SOURCE : TREND_SOURCE;
  return {
    dataset,
    title: showcase ? pick.title : placeholderTitle(slideLocale),
    titleMeta: { author: 'sample' },
    source, sourceMeta: sourceMetaOf(source, undefined, slideLocale, true),
  };
}

/** 2指標スロープの見本（左右の指標の表が2つ） */
export function pairSample(slideLocale: Locale = 'ja', showcase = false): Pick<BuilderState, 'dataset' | 'title' | 'titleMeta' | 'source' | 'sourceMeta'> {
  const dataset = pairSampleDataset(slideLocale, showcase) as BuilderState['dataset'];
  const source = slideLocale === 'en' ? SAMPLE_SOURCE_EN : TREND_SOURCE;
  return {
    dataset,
    title: !showcase ? placeholderTitle(slideLocale) : slideLocale === 'en' ? PAIR_TITLE_EN : PAIR_TITLE,
    titleMeta: { author: 'sample' },
    source, sourceMeta: sourceMetaOf(source, undefined, slideLocale, true),
  };
}

/** 縦棒＋折れ線の見本（量と率の列がある） */
export function comboSample(slideLocale: Locale = 'ja', showcase = false): Pick<BuilderState, 'dataset' | 'title' | 'titleMeta' | 'source' | 'sourceMeta'> {
  const dataset = comboSampleDataset(slideLocale) as BuilderState['dataset'];
  const source = slideLocale === 'en' ? SAMPLE_SOURCE_EN : TREND_SOURCE;
  return {
    dataset,
    title: !showcase ? placeholderTitle(slideLocale) : slideLocale === 'en' ? COMBO_TITLE_EN : COMBO_TITLE,
    titleMeta: { author: 'sample' },
    source, sourceMeta: sourceMetaOf(source, undefined, slideLocale, true),
  };
}

/** 2つの指標（左の表・右の表）で描くチャート：2指標スロープ、指標間の順位スロープ */
export const TWO_METRIC_CHARTS: readonly ChartTypeId[] = ['slope_pair', 'rank_slope'];
export const isTwoMetricChart = (c: ChartTypeId): boolean => TWO_METRIC_CHARTS.includes(c);

/** 専用の見本があるチャート（見本のまま出入りする時に見本を替える） */
export const SPECIAL_SAMPLE: Partial<Record<ChartTypeId, (l: Locale) => Pick<BuilderState, 'dataset' | 'title' | 'titleMeta' | 'source' | 'sourceMeta'>>> = {
  slope_pair: pairSample,
  rank_slope: pairSample,
  combo: comboSample,
};

/**
 * データ（行・列の名前や中身）に結びついた設定。表を貼り替えた・見本に替えた時は外す
 * （前のデータの軸の名前・出典・合計の名前などが、新しいデータのスライドに残らないように）
 */
export const DATA_BOUND_CONTROLS = [
  'items', 'series', 'highlight', 'highlights', 'base_target', 'compare_target', 'compare_target2',
  'x_title', 'y_title', 'source_left', 'source_right', 'total_label', 'pair_total_label', 'ref_label', 'ref_value',
  'vw_width', 'vw_height', 'slope_from', 'slope_to',
] as const;
export function dropDataBound(controls: BuilderState['controls']): BuilderState['controls'] {
  const out = { ...controls };
  for (const k of DATA_BOUND_CONTROLS) delete out[k];
  return out;
}

/** データの形 → そのサンプルの目的 */
export const SCHEMA_SAMPLE: Record<string, PurposeId> = { MEKKO: 'composition', DRIVER_BRIDGE: 'contribution', BUBBLE: 'relationship', MATRIX_TIME_SERIES: 'trend', EVALUATION: 'trend' };

export function initialState(slideLocale: Locale = 'ja'): BuilderState {
  return {
    version: 2,
    ...sampleFor('composition', slideLocale),
    chart: 'mekko',
    slideLocale,
    controls: { mekko_labels: 'pct', sort_by_size: true },
    complements: { aligned_table: true, delta_labels: true },
    mekko: { showTotal: true, growthMode: 'cagr', growthRows: ['market', `series:${slideLocale === 'en' ? sampleNameEn('タイプ2') : 'タイプ2'}`] },
    // 新しいスライドはチャートタイトルを出す（古いスライドは chartHeader が無く、出さない）
    chartHeader: { ...NEW_CHART_HEADER },
  };
}

type SampleKit = Pick<BuilderState, 'dataset' | 'title' | 'titleMeta' | 'source' | 'sourceMeta'>;
const SAMPLE_PURPOSES = ['composition', 'trend', 'contribution', 'relationship'] as const;
/** 見本の組（編集画面の中立の見本 ⇄ 紹介用の本物らしい見本）。言語ごと */
let PAIRS: { neutral: SampleKit; showcase: SampleKit; n: string; s: string }[] | null = null;
function samplePairs() {
  return PAIRS ??= (['ja', 'en'] as const).flatMap((l) => [
    ...SAMPLE_PURPOSES.map((p) => ({ neutral: sampleFor(p, l), showcase: sampleFor(p, l, true) })),
    { neutral: pairSample(l), showcase: pairSample(l, true) },
    { neutral: comboSample(l), showcase: comboSample(l, true) },
  ]).map((x) => ({ ...x, n: JSON.stringify(x.neutral.dataset), s: JSON.stringify(x.showcase.dataset) }));
}

/** 見本（中立・本物らしいもの・日本語・英語のどれでも）のデータか。前に保存した資料の本物らしい見本も見本とみなす */
export function isAnySample(d: Dataset): boolean {
  const now = JSON.stringify(d);
  return samplePairs().some((x) => x.n === now || x.s === now);
}

/**
 * 見本のデータを別の見本に替え、見本の中の名前を指す設定（強調・表に出す行・成長率の行）を、同じ位置の新しい名前に置き換える
 * （言語の切り替え・紹介用の絵で使う）
 */
export function relabelSample(s: BuilderState, sample: SampleKit): BuilderState {
  const map = new Map<string, string>();
  s.dataset.rows.forEach((r, i) => { const n = sample.dataset.rows[i]; if (n) map.set(r, n); });
  s.dataset.cols.forEach((c, i) => { const n = sample.dataset.cols[i]; if (n) map.set(c, n); });
  const re = (v: unknown): unknown => (typeof v === 'string' ? map.get(v) ?? v : Array.isArray(v) ? v.map(re) : v);
  const controls = Object.fromEntries(Object.entries(s.controls).map(([k, v]) => [k, re(v)]));
  const growthRows = s.mekko.growthRows.map((k) => (k.startsWith('series:') ? `series:${map.get(k.slice(7)) ?? k.slice(7)}` : k));
  return { ...s, dataset: structuredClone(sample.dataset), controls, mekko: { ...s.mekko, growthRows } };
}

/** 紹介ページ・チャートの一覧の絵：編集画面の中立の見本を、本物らしい見本（名前とタイトル）に替える。見本でなければそのまま */
export function toShowcase(s: BuilderState): BuilderState {
  const now = JSON.stringify(s.dataset);
  const hit = samplePairs().find((x) => x.n === now);
  if (!hit) return s;
  const next = relabelSample(s, hit.showcase);
  return s.title === hit.neutral.title ? { ...next, title: hit.showcase.title } : next;
}

const hasValues = (vals: (number | null)[][]) => vals.some((r) => r.some((v) => v != null));
export const hasBase = (s: BuilderState) => hasValues(s.dataset.periods.base.values);
export const purposeOf = (s: BuilderState): PurposeId => registry.charts[s.chart].purpose;

/** 描画に渡す Dataset。形の種類は選んだチャートの目的に合わせ、比較期間が空なら取り除く */
export function toDataset(s: BuilderState): Dataset {
  const { base, current } = s.dataset.periods;
  return {
    ...s.dataset,
    schema: registry.purposes[purposeOf(s)].schema,
    periods: hasValues(base.values) ? { current, base } : { current },
  };
}

/** 行と列を入れ替えているか（そのチャートで入れ替えが使える場合のみ） */
export function isSwapped(s: BuilderState): boolean {
  return s.controls.axis_swap === 'swapped' && registry.controls.axis_swap.appliesTo.includes(s.chart);
}

/** 表示する行・列（絞り込みの後、入れ替えの前）。すべてなら undefined */
/**
 * データの確認（CAGR・前年比が出せるか）に使う2つの行。
 * 基準と比較先を選べるチャートはその2つ、それ以外は表示している行の最初の年→最後の年。入れ替え中は使わない
 */
export function checkEndpoints(s: BuilderState): { from: string; to: string } | undefined {
  if (isSwapped(s)) return undefined;
  const rows = shownNames(s.dataset.rows, s.controls.items) ?? s.dataset.rows;
  if (rows.length < 2) return undefined;
  if (registry.controls.base_target.appliesTo.includes(s.chart)) {
    let from = String(s.controls.base_target ?? ''), to = String(s.controls.compare_target2 ?? '');
    if (!rows.includes(from)) from = rows[0]!;
    if (!rows.includes(to)) to = rows[rows.length - 1]!;
    if (from === to) { from = rows[0]!; to = rows[rows.length - 1]!; }
    return { from, to };
  }
  const t = growthSpan(rows);
  return t ? { from: rows[t.fromIndex]!, to: rows[t.toIndex]! } : undefined;
}

function shownNames(all: string[], picked: unknown): string[] | undefined {
  if (!Array.isArray(picked)) return undefined;
  const keep = all.filter((n) => picked.includes(n));
  return keep.length && keep.length < all.length ? keep : undefined;
}

/** チャートから見た行（横軸の項目）と列（系列）の名前。入れ替え・絞り込みの後 */
export function viewAxes(s: BuilderState): { rows: string[]; cols: string[] } {
  const d = s.dataset;
  const rows = shownNames(d.rows, s.controls.items) ?? d.rows;
  const cols = shownNames(d.cols, s.controls.series) ?? d.cols;
  return isSwapped(s) ? { rows: cols, cols: rows } : { rows, cols };
}

/** 設定の選択肢を行から取るか列から取るか。散布図・バブルの強調は点（＝行）から選ぶ */
export function controlSource(id: ControlId, source: 'rows' | 'cols' | undefined, chart: ChartTypeId): 'rows' | 'cols' | undefined {
  if (id === 'highlight' && registry.charts[chart].purpose === 'relationship') return 'rows';
  return source;
}

/** そのチャートに効く設定だけを、正しい値のものに絞って ViewSpec に入れる */
function chartControls(s: BuilderState): Record<string, unknown> {
  const axes = viewAxes(s);
  const out: Record<string, unknown> = {};
  for (const def of controlsFor(s.chart)) {
    const v = s.controls[def.id];
    if (v === undefined || ['title', 'subtitle', 'source', 'unit', 'palette'].includes(def.id)) continue;
    if (def.id === 'items') { const x = shownNames(s.dataset.rows, v); if (x) out.items = x; continue; }
    if (def.id === 'series') { const x = shownNames(s.dataset.cols, v); if (x) out.series = x; continue; }
    if (def.type === 'select' && !def.options?.some((o) => o.value === v)) continue;
    if (def.type === 'toggle' && typeof v !== 'boolean') continue;
    if (def.type === 'data_select' && !(typeof v === 'string' && (controlSource(def.id, def.dataSource, s.chart) === 'rows' ? axes.rows : axes.cols).includes(v))) continue;
    if (def.type === 'data_multi_select') {
      const pool = controlSource(def.id, def.dataSource, s.chart) === 'rows' ? axes.rows : axes.cols;
      const x = Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && pool.includes(n)) : [];
      if (x.length) out[def.id] = x;
      continue;
    }
    out[def.id] = v;
  }
  // スロープの強調は複数に変えた。前に1つだけ強調して保存したものは、その1つを強調として読む
  if ((s.chart === 'slope' || s.chart === 'slope_pair') && !out.highlights && typeof s.controls.highlight === 'string' && axes.cols.includes(s.controls.highlight)) out.highlights = [s.controls.highlight];
  return out;
}

/** 補完パーツがオンか。選んでいなければ、既定でオンのもの（合計の増減など）はオン */
export function isComplementOn(s: BuilderState, id: ComplementId): boolean {
  return s.complements[id] ?? !!registry.complements[id].defaultOn;
}

/** オンになっていて、そのチャートで描ける（チャート内の）補完パーツ */
export function activeComplements(s: BuilderState, placement: 'in_chart' | 'panel'): ComplementId[] {
  const ok = IMPLEMENTED_COMPLEMENTS[s.chart] ?? [];
  return (Object.keys(registry.complements) as ComplementId[]).filter((id) =>
    isComplementOn(s, id) && ok.includes(id) && registry.complements[id].placement === placement && registry.complements[id].appliesTo.includes(s.chart));
}

/**
 * レシピの構成で描くスライドなら、そのレシピ。チャートをレシピの主チャートから替えたら使わない。
 * Mekko はエディタの複合構成（全体の構成・揃えた表）で描くので対象外
 */
export function recipeOf(s: BuilderState): RecipeDef | null {
  const r = s.recipe ? registry.recipes[s.recipe] : undefined;
  return r && s.chart !== 'mekko' && primaryChart(r) === s.chart ? r : null;
}

/** レシピの標準構成に含まれる表のパネル（Settings でオン・オフする） */
export function recipeTablePanels(s: BuilderState): Panel[] {
  return recipeOf(s)?.view.panels.filter((p) => p.kind === 'table' && p.table) ?? [];
}

/** 足せない指標の単位（率・平均・指数など）。合計・構成比・「その他」へのまとめに意味がない */
export { nonAdditiveUnit };

/** 残りを「その他」にまとめるチャート（合計や構成比が全体を表すもの）。それ以外は上位だけ表示 */
export const OTHER_CHARTS: ChartTypeId[] = ['stacked_column', 'stacked_100', 'mekko', 'bar_100', 'bar_rank', 'column_compare'];

/** 「上位だけ表示」の設定 → 主チャートにかける変換 */
function topTransform(s: BuilderState): Transform[] {
  const v = s.controls.top_n;
  if (!registry.controls.top_n.appliesTo.includes(s.chart) || typeof v !== 'string' || !/^\d+$/.test(v)) return [];
  const other = OTHER_CHARTS.includes(s.chart) && !nonAdditiveUnit(s.dataset.unit);
  return [{ type: 'top_n', n: Number(v), other, label: slideText(s.slideLocale, 'others') }];
}

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/**
 * 左右の幅（お皿の構成）：利用者・料理が選んだもの ＞ 表の列が多い時（開始・終了も出す CAGR の表）は 1/2 ＞ レシピの既定
 */
export function sideRatioOf(s: BuilderState, recipeRatio: number | undefined): number | undefined {
  const v = s.controls.side_ratio;
  if (v === 'half') return 0.5;
  if (v === 'two_thirds') return 0.67;
  // 行をそろえた「数値だけ」の列は狭くてよい（主役を広く：左 4/5）
  if (s.controls.side_form === 'numbers' && recipeOf(s)?.view.panels.some((p) => p.align?.some((x) => x.axis === 'rows'))) return 0.8;
  const hasCagrTable = !!recipeOf(s)?.view.panels.some((p) => p.table === 'cagr_table');
  const wide = hasCagrTable && s.controls.side_form !== 'bars' && (s.controls.cagr_table_cols === 'values_cagr' || s.controls.cagr_table_cols === 'all');
  return wide && recipeRatio != null ? 0.5 : recipeRatio;
}

function layoutWithRatio(s: BuilderState, layout: ViewSpec['layout']): ViewSpec['layout'] {
  if (layout.id !== 'p03_left_right') return structuredClone(layout);
  const r = sideRatioOf(s, layout.ratios?.[0]);
  return { ...structuredClone(layout), ...(r != null ? { ratios: [r] } : {}) };
}

/** 画面の状態 → ViewSpec。レイアウトと置き場所はレジストリから決める */
export function toViewSpec(s: BuilderState): ViewSpec {
  const controls = chartControls(s);
  const inChart = activeComplements(s, 'in_chart').map((id) => ({ id }));
  const top = topTransform(s);
  // 配色のテーマは ID だけ持つ。古い保存データ・知らない ID は default（ViewSpec にも書かない＝今まで通り）
  const theme = themeIdOf(s.controls.palette);
  const base: Omit<ViewSpec, 'layout' | 'panels'> = { datasetId: 'local', slide: { title: s.title, source: s.chartHeader?.showSource === false ? '' : s.source, ...chartHeaderOf(s) }, slideLocale: s.slideLocale, ...(theme !== 'default' ? { palette: theme } : {}), ...(s.tone ? { tone: s.tone } : {}) };

  const r = recipeOf(s);
  if (r) {
    // レシピのとおり（表・変換・レイアウト）。主チャートにはスライドの設定と補完パーツを載せる
    const hidden = new Set(s.hiddenParts ?? []);
    const panels = structuredClone(r.view.panels)
      .filter((p) => !(p.kind === 'table' && hidden.has(p.id)))
      .map((p): Panel => (p.id === 'main' ? { ...p, controls: { ...(p.controls ?? {}), ...controls }, inChartComplements: inChart, ...(top.length ? { transform: [...(p.transform ?? []), ...top] } : {}) }
        // 2つ目のチャート（例：右の増減額）にも、強調と数値の形式、「上位だけ表示」をそろえる（左右で同じ項目を出す）
        : p.kind === 'chart' && p.chart ? { ...p, controls: { ...(p.controls ?? {}), ...pick(controls, ['highlight', 'highlight_color', 'number_format'].filter((id) => registry.controls[id as 'highlight'].appliesTo.includes(p.chart!))) }, ...(top.length ? { transform: [...(p.transform ?? []), ...top] } : {}) }
        : p));
    const recipe = { id: r.id, version: RECIPE_DB_VERSION };
    // 付け合わせの形（中身はそのまま、形だけ）：増加額＝差分バー／増減表／ウォーターフォール、伸び率＝表／横棒
    const form = s.controls.side_form;
    const shared = { ...pick(controls, ['highlight', 'highlight_color', 'number_format']) };
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i]!;
      if (p.id === 'main') continue;
      // 行をそろえた付け合わせ（順位の横棒の右）：棒か、数値だけ
      if (p.align?.length) { if (form === 'numbers') panels[i] = { ...p, controls: { ...(p.controls ?? {}), side_form: 'numbers' } }; continue; }
      if (p.kind === 'chart' && p.chart === 'variance_bar' && form === 'table') panels[i] = { id: p.id, slot: p.slot, kind: 'table', table: 'delta_table' };
      else if (p.kind === 'chart' && p.chart === 'variance_bar' && form === 'waterfall') panels[i] = { ...p, controls: { ...(p.controls ?? {}), side_measure: 'bridge' } };
      else if (p.kind === 'table' && p.table === 'cagr_table' && form === 'bars' && !hidden.has(p.id)) {
        panels[i] = { id: p.id, slot: p.slot, kind: 'chart', chart: 'variance_bar', controls: { ...shared, side_measure: 'cagr' }, ...(top.length ? { transform: top } : {}) };
      }
    }
    if (panels.length === 1) return { ...base, recipe, layout: { id: 'p01_single' }, panels: [{ ...panels[0]!, slot: 'main' }] };
    // 上下構成（右 1/3 に収まらない時）：主役が上、付け合わせが下。下は項目を横に並べる（棒は縦、表は横向き）。行をそろえる構成は除く
    if (s.controls.side_ratio === 'stacked' && r.view.layout.id === 'p03_left_right' && !panels.some((p) => p.align?.length)) {
      const stackedPanels = panels.map((p): Panel => (p.id === 'main' ? { ...p, slot: 'top' }
        : { ...p, slot: 'bottom', ...(p.kind === 'chart' ? { controls: { ...(p.controls ?? {}), orientation: 'vertical' } } : {}) }));
      return { ...base, recipe, layout: { id: 'p02_top_bottom', ratios: [0.62] }, panels: stackedPanels };
    }
    return { ...base, recipe, layout: layoutWithRatio(s, r.view.layout), panels };
  }
  if (s.chart !== 'mekko') {
    return { ...base, layout: { id: 'p01_single' }, panels: [{ id: 'main', slot: 'main', kind: 'chart', chart: s.chart, controls, inChartComplements: inChart, ...(top.length ? { transform: top } : {}) }] };
  }

  // Mekko の複合構成（左の全体の構成＋ Mekko ＋ 揃えた成長率表）
  const place = complementPlacement('aligned_table', 'mekko')!;
  const withBase = hasBase(s);
  const cols = viewAxes(s).cols;
  const growthRows = s.mekko.growthRows.filter((r) => r === 'market' || cols.includes(r.replace(/^series:/, '')));
  const panels: Panel[] = [];
  if (s.mekko.showTotal) {
    panels.push({
      id: 'total', slot: 'left', kind: 'chart', chart: 'stacked_100',
      transform: [{ type: 'aggregate_rows' }, { type: 'select_periods', periods: withBase ? ['base', 'current'] : ['current'] }],
      ...(typeof controls.highlight === 'string' ? { controls: pick(controls, ['highlight', 'highlight_color']) } : {}),
      align: [{ to: 'main', axis: 'y_scale' }],
    });
  }
  panels.push({ id: 'main', slot: place.hostSlot, kind: 'chart', chart: 'mekko', controls, inChartComplements: inChart, ...(top.length ? { transform: top } : {}) });
  if (s.complements.aligned_table && growthRows.length) {
    panels.push({
      id: 'growth', slot: place.slot, kind: 'table', table: 'growth_table',
      transform: [{ type: 'growth', mode: s.mekko.growthMode, rows: growthRows }],
      align: [{ to: 'main', axis: 'columns' }],
    });
  }
  return { ...base, layout: { id: place.layout, ...(place.ratios ? { ratios: place.ratios } : {}) }, panels };
}

/**
 * このスライドが比較期間のデータを使うか（データ欄に「比較」の表を出すかの判断）。
 * レシピが比較期間を要る／オンの補完パーツが比較期間を要る／Mekko の揃えた表を「期間の伸び」で出す
 */
export function slideUsesBase(s: BuilderState): boolean {
  const r = s.recipe ? registry.recipes[s.recipe] : null;
  if (r?.requirements.base && s.chart === primaryChart(r)) return true;
  if (registry.charts[s.chart]?.requires?.base) return true;
  const on = [...activeComplements(s, 'in_chart'), ...activeComplements(s, 'panel')];
  if (on.some((id) => complementNeedsBase(id, s.chart))) return true;
  return s.chart === 'mekko' && !!s.complements.aligned_table && s.mekko.growthMode === 'period';
}

export function validateState(s: BuilderState): ValidationResult {
  return validateViewSpec(toViewSpec(s), toDataset(s));
}

/** 保存形式 v1（Mekko 専用だった頃）の状態 */
interface BuilderStateV1 {
  version: 1;
  dataset: BuilderState['dataset'];
  title: string; source: string;
  showTotal: boolean; alignedTable: boolean; growthMode: 'cagr' | 'period'; growthRows: string[];
  deltaLabels: boolean; labels: string; sortBySize: boolean; highlight: string | null; slideLocale: Locale;
}

/**
 * ブラウザ保存や DB から読み戻した値を、今の保存形式に直す。
 * v1（Mekko 専用）は v2 に変換する。壊れていれば null
 */
export function normalizeState(v: unknown): BuilderState | null {
  const o = v as Partial<BuilderState> & Partial<BuilderStateV1> | null;
  if (!o || typeof o !== 'object' || !o.dataset || !Array.isArray(o.dataset.rows) || !Array.isArray(o.dataset.cols) || !o.dataset.periods?.base) return null;
  if (o.version === 2) {
    if (!CHART_TYPE_IDS.includes(o.chart as ChartTypeId) || !o.controls || !o.complements || !o.mekko) return null;
    return o as BuilderState;
  }
  if (o.version === 1) {
    const v1 = o as BuilderStateV1;
    return {
      version: 2,
      dataset: v1.dataset,
      chart: 'mekko',
      title: v1.title, source: v1.source, slideLocale: v1.slideLocale,
      controls: { mekko_labels: v1.labels, sort_by_size: v1.sortBySize, ...(v1.highlight ? { highlight: v1.highlight } : {}) },
      complements: { aligned_table: v1.alignedTable, delta_labels: v1.deltaLabels },
      mekko: { showTotal: v1.showTotal, growthMode: v1.growthMode, growthRows: v1.growthRows },
    };
  }
  return null;
}

/** 正しい保存形式か（今の形式に直せるものも含む） */
export const isBuilderState = (v: unknown): boolean => normalizeState(v) != null;
