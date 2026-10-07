import type { LongPivot } from '@/registry';
import {
  CHART_TYPE_IDS, RECIPE_IDS, isStoryTemplateId, localize, primaryChart, registry, validateViewSpec,
  type ChartTypeId, type Locale, type RecipeId, type RecommendationState, type ValidationResult, type ViewSpec, type SlideFontId,
} from '@/registry';
import { THEME_IDS, type ThemeId } from '@/engine/theme';
import { SLIDE_FONT_IDS } from '@/registry';
import { applyRecipe, resolveAutoControls, isSampleData } from './fromRecipe';
import { isTimeAxis, timeRange } from '@/engine/transform/cagr';
import { SCHEMA_SAMPLE, SPECIAL_SAMPLE, initialState, normalizeState, pairSample, sampleFor, slideUsesBase, toDataset, toViewSpec, type BuilderState } from './state';
import { derivedUnit, longDataset, normalizePivot } from './long';
import { chosenRecipes, recommendationState, type Plan } from '../start/plan';
import { defaultKpiLook, kpiSummaryLines, normalizeContent, normalizeLook } from '../templates/content';
import type { TextMeta } from '../data/text';
import type { SourceMeta } from '../data/source';

/**
 * プロジェクト（保存形式 v3）＝ データ1つ ＋ スライド N 枚。
 * データ・出典・スライドの言語は全スライド共通、チャート・見出し・設定・補完パーツはスライドごと。
 * 画面の部品は今までどおり「1枚分の状態（BuilderState）」を受け取り、viewOf / withView で行き来する。
 */

export interface SlideState {
  id: string;
  /** どのレシピ（切り口）から作ったか。自分で足したスライドは null */
  recipe: RecipeId | null;
  chart: ChartTypeId;
  title: string;
  /** メッセージタイトルの書き手と根拠 */
  titleMeta?: TextMeta;
  controls: BuilderState['controls'];
  complements: BuilderState['complements'];
  mekko: BuilderState['mekko'];
  /** レシピの標準構成のうち、外した表のパネル（id） */
  hiddenParts?: string[];
  /** 縦長の表から切り出している時の、このスライドの切り出し方（Vol と Val を別のスライドにできる） */
  longPivot?: LongPivot;
  /** チャートタイトルと期間・単位。無い＝古いスライド＝出さない */
  chartHeader?: BuilderState['chartHeader'];
  /** Coach の推薦（同じ問いの別の見せ方など） */
  coach?: BuilderState['coach'];
  /** このスライドでデータを決めた（データを入れた・「このまま使う」を押した）。ほかのスライドのデータを使うかを聞かない */
  dataDecided?: boolean;
  /** このスライドだけのデータ（ProjectState.extra の id）。無い＝その形の共通のデータ */
  dataRef?: string;
  /** 見せ方：表・言葉の型（無い＝グラフ）。中身・見せ方は型ごとに持ち、グラフの設定も残す */
  view?: BuilderState['view'];
  content?: BuilderState['content'];
  look?: BuilderState['look'];
}

/** 共通のデータとは別に持つデータ（「このスライドだけ別のデータにする」）。形の種類と出典もデータごと */
export interface ExtraData {
  label: string;
  family: DataFamily;
  dataset: BuilderState['dataset'];
  source: string;
  sourceMeta?: SourceMeta;
}

/**
 * データの形の種類。形が違うチャート（表・要因・関係）は同じ表を共有できないので、種類ごとに1つずつ持つ。
 * 表＝推移・比較・構成（Mekko を含む）、要因＝始点・要因・終点、関係＝項目ごとの X・Y・大きさ
 */
export type DataFamily = 'table' | 'bridge' | 'relation';
export const familyOf = (chart: ChartTypeId): DataFamily => {
  const p = registry.charts[chart].purpose;
  return p === 'contribution' ? 'bridge' : p === 'relationship' ? 'relation' : 'table';
};
export const FAMILY_SAMPLE: Record<DataFamily, 'trend' | 'contribution' | 'relationship'> = { table: 'trend', bridge: 'contribution', relation: 'relationship' };

export interface ProjectState {
  version: 3;
  /** 表の形のデータ（推移・比較・構成のスライドで共通） */
  dataset: BuilderState['dataset'];
  /** 要因・関係のデータ（そのスライドがある時だけ） */
  datasets?: Partial<Record<'bridge' | 'relation', BuilderState['dataset']>>;
  source: string;
  sourceMeta?: SourceMeta;
  slideLocale: Locale;
  slides: SlideState[];
  /** 編集中のスライドの位置 */
  current: number;
  /** ② で選んだ推薦の状態（相談から作った時など） */
  recommendation?: RecommendationState;
  /** Library の見本を複製して作った時の元（左側に「Library から」と出す。相談文の代わり） */
  origin?: { kind: 'library'; id: string; title: string };
  /** 色の使い方（ストーリーから開いた時は story。全スライドで色の意味をそろえる） */
  tone?: 'story';
  /** デッキ全体の見た目。palette はスライド側 controls.palette で個別上書きできる。 */
  design?: { palette?: ThemeId; font?: SlideFontId };
  /** 共通のデータとは別のデータ（id → データ）。スライドの dataRef から指す */
  extra?: Record<string, ExtraData>;
}

let seq = 0;
export const newSlideId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

export const slideOf = (s: BuilderState, id: string, recipe: RecipeId | null): SlideState => ({
  id, recipe, chart: s.chart, title: s.title,
  ...(s.titleMeta ? { titleMeta: structuredClone(s.titleMeta) } : {}),
  controls: structuredClone(s.controls), complements: structuredClone(s.complements), mekko: structuredClone(s.mekko),
  ...(s.hiddenParts?.length ? { hiddenParts: [...s.hiddenParts] } : {}),
  ...(s.chartHeader ? { chartHeader: { ...s.chartHeader } } : {}),
  ...(s.coach ? { coach: structuredClone(s.coach) } : {}),
  ...(s.dataDecided ? { dataDecided: true } : {}),
  ...(s.dataset.long && familyOf(s.chart) === 'table' ? { longPivot: structuredClone(s.dataset.long.pivot) } : {}),
  ...(s.view ? { view: s.view } : {}),
  ...(s.content ? { content: structuredClone(s.content) } : {}),
  ...(s.look ? { look: structuredClone(s.look) } : {}),
});

/** 1枚分の状態（v2）→ 1枚のプロジェクト */
export function fromBuilder(s: BuilderState, recipe: RecipeId | null = null): ProjectState {
  const fam = familyOf(s.chart);
  const base = { version: 3 as const, source: s.source, ...(s.sourceMeta ? { sourceMeta: structuredClone(s.sourceMeta) } : {}), slideLocale: s.slideLocale, slides: [slideOf(s, 's1', recipe)], current: 0 };
  return fam === 'table' ? { ...base, dataset: s.dataset } : { ...base, dataset: sampleFor('trend', s.slideLocale).dataset, datasets: { [fam]: s.dataset } };
}

/** そのチャートが使うデータ（無ければ見本） */
export function datasetFor(p: ProjectState, chart: ChartTypeId): BuilderState['dataset'] {
  const fam = familyOf(chart);
  if (fam === 'table') return p.dataset;
  return p.datasets?.[fam] ?? sampleFor(FAMILY_SAMPLE[fam], p.slideLocale).dataset;
}

/** データを種類の場所に書き戻す */
function setFamilyData(p: ProjectState, fam: DataFamily, d: BuilderState['dataset']): Pick<ProjectState, 'dataset' | 'datasets'> {
  return fam === 'table' ? { dataset: d, datasets: p.datasets } : { dataset: p.dataset, datasets: { ...(p.datasets ?? {}), [fam]: d } };
}

/** スライドが別のデータを使っていれば、その id（形が合わない・無いデータは使わない） */
export function ownDataRef(p: ProjectState, s: SlideState): string | null {
  const x = s.dataRef ? p.extra?.[s.dataRef] : undefined;
  return x && x.family === familyOf(s.chart) ? s.dataRef! : null;
}

/** スライドが使うデータの目印：別のデータなら id、共通なら「@形」。同じ目印のスライドは同じデータを使う */
export const dataKey = (p: ProjectState, s: SlideState): string => ownDataRef(p, s) ?? `@${familyOf(s.chart)}`;

/** 同じデータを使うスライドの数（データ欄の見出し用） */
export const sharedCount = (p: ProjectState, i: number = p.current): number => {
  const key = dataKey(p, p.slides[clampIndex(p, i)]!);
  // 表・言葉の型のスライドは、データを使わないので数えない
  return p.slides.filter((s) => !s.view && dataKey(p, s) === key).length;
};

/**
 * 別のデータ（ids）を、どのスライドからも指されていなければ消す。
 * 消すのは今の操作で外れたものだけ（ストーリーで外した問いのデータなど、編集画面に出ていないスライドのデータは残す）
 */
export function dropUnused(p: ProjectState, ids: (string | null | undefined)[]): ProjectState {
  if (!p.extra) return p;
  const used = new Set(p.slides.map((s) => s.dataRef).filter((x): x is string => !!x));
  const gone = ids.filter((id): id is string => !!id && !used.has(id) && !!p.extra![id]);
  if (!gone.length) return p;
  const extra = Object.fromEntries(Object.entries(p.extra).filter(([id]) => !gone.includes(id)));
  if (!Object.keys(extra).length) { const { extra: _e, ...rest } = p; void _e; return rest; }
  return { ...p, extra };
}

/** 次の「データ n」の名前（共通のデータを 1 と数える） */
function nextLabel(p: ProjectState, locale: Locale): string {
  const used = new Set(Object.values(p.extra ?? {}).map((x) => x.label));
  for (let n = 2; ; n++) { const l = locale === 'en' ? `Data ${n}` : `データ ${n}`; if (!used.has(l)) return l; }
}

/**
 * このスライドだけ別のデータにする：今のデータと出典を複製して、このスライドだけがそれを使う（そのまま貼り替えられる）。
 * ほかのスライドのデータは変わらない
 */
export function detachData(p: ProjectState, i: number = p.current, label?: string, start: 'copy' | 'sample' = 'copy'): ProjectState {
  const at = clampIndex(p, i);
  const v = viewOf(p, at);
  const s = p.slides[at]!;
  // sample＝見本から始める（別のデータを入れる時。前の表を写さないので、貼り替えても元のスライドに影響しない）
  const fam = familyOf(s.chart);
  const raw = start === 'sample'
    ? sampleFor(fam === 'table' ? (SCHEMA_SAMPLE[s.recipe ? registry.recipes[s.recipe].schema : 'MATRIX_TIME_SERIES'] ?? 'trend') : FAMILY_SAMPLE[fam], p.slideLocale).dataset
    : ownDataRef(p, s) ? p.extra![s.dataRef!]!.dataset : datasetFor(p, s.chart);
  const id = `d${newSlideId().slice(1)}`;
  const extra = { ...(p.extra ?? {}), [id]: { label: label ?? nextLabel(p, p.slideLocale), family: familyOf(s.chart), dataset: structuredClone(raw), source: v.source, ...(v.sourceMeta ? { sourceMeta: structuredClone(v.sourceMeta) } : {}) } };
  return dropUnused({ ...p, extra, slides: p.slides.map((x, k) => (k === at ? { ...x, dataRef: id } : x)) }, [s.dataRef]);
}

/**
 * ストーリー：次のグラフのスライドを開いた時に「n枚目で入れたデータを使いますか？」と聞くか。
 * 聞くのは、共通のデータを使っていて、このスライドではまだ決めておらず、ほかのスライドでそのデータを入れた時だけ。
 * from＝データを入れたスライドの番号（並びの順）、cols・years＝データのあらまし
 */
export function dataAsk(p: ProjectState, i: number = p.current): { from: number[]; cols: string[]; years: [string, string] | null } | null {
  const at = clampIndex(p, i);
  const cur = p.slides[at]!;
  if (cur.view || cur.dataDecided || ownDataRef(p, cur)) return null;
  const key = dataKey(p, cur);
  const from = p.slides.map((x, k) => (k !== at && !x.view && x.dataDecided && dataKey(p, x) === key ? k + 1 : 0)).filter(Boolean);
  if (!from.length) return null;
  const d = datasetFor(p, cur.chart);
  return { from, cols: d.cols, years: isTimeAxis(d.rows) && d.rows.length > 1 ? [d.rows[0]!, d.rows[d.rows.length - 1]!] : null };
}

/** このスライドは、今の（共通の）データをこのまま使う（もう聞かない） */
export const keepSharedData = (p: ProjectState, i: number = p.current): ProjectState =>
  ({ ...p, slides: p.slides.map((x, k) => (k === clampIndex(p, i) ? { ...x, dataDecided: true } : x)) });

/** 共通のデータに戻す（このスライド用に入れたデータは、ほかのスライドが使っていなければ消える） */
export function attachShared(p: ProjectState, i: number = p.current): ProjectState {
  const at = clampIndex(p, i);
  const slides = p.slides.map((x, k) => { if (k !== at || !x.dataRef) return x; const { dataRef: _d, ...rest } = x; void _d; return rest; });
  return dropUnused({ ...p, slides }, [p.slides[at]!.dataRef]);
}

/** 別のデータの名前を変える */
export function renameData(p: ProjectState, id: string, label: string): ProjectState {
  const x = p.extra?.[id];
  const l = label.trim().slice(0, 60);
  return x && l ? { ...p, extra: { ...p.extra, [id]: { ...x, label: l } } } : p;
}

export const initialProject = (locale: Locale = 'ja'): ProjectState => fromBuilder(initialState(locale));

/** 新しく始めるプロジェクト：スライドの言語と見本の出典を画面の言語に合わせる */
export const newProject = (locale: Locale): ProjectState => initialProject(locale);

const clampIndex = (p: ProjectState, i: number) => Math.min(Math.max(0, i), p.slides.length - 1);

/** 課題→示唆→アクションのスライドなら、入っているアクション（文・担当・期限） */
function iiaActions(x: SlideState): { actions?: { text: string; owner: string; due: string }[] } {
  if (x.view !== 'STORY_TEXT_ISSUE_INSIGHT_ACTION') return {};
  const acts = (x.content?.iia?.cols.find((c) => c.id === 'action')?.items ?? []).filter((it) => it.text.trim()).map(({ text, owner, due }) => ({ text, owner, due }));
  return acts.length ? { actions: acts } : {};
}

/** KPI スコアカードのスライドなら、数字の行と対象期間（Executive Summary の下書きに使う） */
function kpiLines(x: SlideState, locale: Locale): { kpi?: { lines: string[]; periods: string[] } } {
  if (x.view !== 'STORY_TABLE_KPI' || !x.content?.kpi) return {};
  const lines = kpiSummaryLines(x.content.kpi, x.look?.kpi ?? defaultKpiLook(), locale);
  const periods = [...new Set(x.content.kpi.kpis.map((k) => k.period.trim()).filter(Boolean))];
  return lines.length ? { kpi: { lines, periods } } : {};
}

/** i 枚目のスライドを、画面の部品が使う1枚分の状態にする */
export function viewOf(p: ProjectState, i: number = p.current): BuilderState {
  const s = p.slides[clampIndex(p, i)]!;
  const own = ownDataRef(p, s);
  const d = own ? p.extra![own]!.dataset : datasetFor(p, s.chart);
  // 縦長の表から切り出している時は、このスライドの切り出し方で表を作る
  const dataset = d.long && s.longPivot ? longDataset(d, d.long, normalizePivot(d.long, s.longPivot)) : d;
  return {
    version: 2, dataset, source: own ? p.extra![own]!.source : p.source,
    ...((own ? p.extra![own]!.sourceMeta : p.sourceMeta) ? { sourceMeta: structuredClone((own ? p.extra![own]!.sourceMeta : p.sourceMeta)!) } : {}),
    slideLocale: p.slideLocale,
    chart: s.chart, title: s.title, controls: s.controls, complements: s.complements, mekko: s.mekko,
    ...(s.titleMeta ? { titleMeta: structuredClone(s.titleMeta) } : {}),
    recipe: s.recipe, hiddenParts: s.hiddenParts ?? [],
    ...(s.chartHeader ? { chartHeader: s.chartHeader } : {}),
    ...(s.coach ? { coach: s.coach } : {}),
    ...(p.tone ? { tone: p.tone } : {}),
    ...(p.design ? { deckStyle: p.design } : {}),
    ...(s.view ? { view: s.view } : {}),
    ...(s.content ? { content: s.content } : {}),
    ...(s.look ? { look: s.look } : {}),
    // 言葉の型は、ほかのスライドを参照する（番号はスライドの並び）
    // 次のアクションには、課題→示唆→アクションのスライドのアクションも渡す（取り込むため）
    ...(s.view ? { others: p.slides.map((x, k) => ({ id: x.id, n: k + 1, title: x.title, ...iiaActions(x), ...kpiLines(x, p.slideLocale) })).filter((x) => x.id !== s.id) } : {}),
  };
}

/** 設定の中の行・列の名前を、データの変更に合わせる（名前の変更は位置で対応、消えた名前は外す） */
function remapNames(controls: SlideState['controls'], before: string[], after: string[]): SlideState['controls'] {
  if (before.join('\u0000') === after.join('\u0000')) return controls;
  const map = new Map<string, string | null>();
  if (before.length === after.length) before.forEach((n, i) => map.set(n, after[i]!));
  else before.forEach((n) => map.set(n, after.includes(n) ? n : null));
  const out: SlideState['controls'] = {};
  for (const [k, v] of Object.entries(controls) as [keyof SlideState['controls'], unknown][]) {
    if (typeof v === 'string' && map.has(v)) { const m = map.get(v); if (m != null) out[k] = m; continue; }
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) { out[k] = (v as string[]).map((x) => (map.has(x) ? map.get(x) : x)).filter((x): x is string => x != null); continue; }
    out[k] = v;
  }
  return out;
}

/** 画面で変えた1枚分の状態を、プロジェクトに戻す（共通の項目は全スライドに効く） */
export function withView(p: ProjectState, i: number, next0: BuilderState): ProjectState {
  let next = next0;
  const at = clampIndex(p, i);
  const famBefore = familyOf(p.slides[at]!.chart);
  const famNext = familyOf(next.chart);
  // 形の違うチャートに替えた時は、画面のデータ（前の形）は書き戻さない。替えた先は、その形のデータ（無ければ見本）を使う
  if (famBefore !== famNext) {
    // 別のデータを使っていたスライドは、形が変わったら共通のデータへ（別のデータは、ほかに使っていなければ消える）
    if (ownDataRef(p, p.slides[at]!)) return withView(attachShared(p, at), at, next0);
    const slides = p.slides.map((s, k) => (k === at ? slideOf(next, s.id, null) : s));
    // その形のデータがまだ無い時：自分で入れたデータなら持っていく（見本に置き換えない）。見本のままなら、その形の見本
    const carry = !isSampleData(next);
    const data = p.datasets?.[famNext as 'bridge'] || famNext === 'table' ? {}
      : { datasets: { ...(p.datasets ?? {}), [famNext]: carry ? structuredClone(next.dataset) : sampleFor(FAMILY_SAMPLE[famNext], next.slideLocale).dataset } };
    return { ...p, ...data, source: next.source, ...(next.sourceMeta ? { sourceMeta: structuredClone(next.sourceMeta) } : { sourceMeta: undefined }), slideLocale: next.slideLocale, slides };
  }
  const own = ownDataRef(p, p.slides[at]!);
  const key = dataKey(p, p.slides[at]!);
  const before = own ? p.extra![own]!.dataset : datasetFor(p, next.chart);
  const dataChanged = JSON.stringify(before) !== JSON.stringify(next.dataset);
  // 切り出し中で、割合でなければ、画面で入れた単位を元の値の単位として残す
  const L = next.dataset.long;
  if (L && L.pivot.share == null && (next.dataset.unit ?? '') !== derivedUnit(L, L.pivot)) next = { ...next, dataset: { ...next.dataset, long: { ...L, unit: next.dataset.unit ?? '' } } };
  const slides = p.slides.map((s, k) => {
    // レシピを変えた（付け合わせを付けた・外した、チャートを替えて付け合わせを引き継いだ）ならそのレシピ。
    // それ以外でチャートを替えたら、もうそのレシピではない
    // このスライドでデータを変えたら「データを決めた」（ほかのスライドで、このデータを使うかを聞く元になる）
    if (k === at) return { ...slideOf(next, s.id, next.recipe !== undefined && next.recipe !== s.recipe ? next.recipe : next.chart === s.chart ? s.recipe : null), ...(own ? { dataRef: own } : {}), ...(dataChanged ? { dataDecided: true } : {}) };
    // 同じデータを使うほかのスライドの設定も、行・列の名前の変更に合わせる
    if (dataKey(p, s) !== key) return s;
    // 切り出しをやめたら、ほかのスライドの切り出し方も外す。自分の切り出し方があるスライドは名前をそのまま
    if (s.longPivot && !next.dataset.long) { const { longPivot: _lp, ...rest } = s; void _lp; return rest; }
    if (s.longPivot) return s;
    const c1 = remapNames(s.controls, before.rows, next.dataset.rows);
    return { ...s, controls: remapNames(c1, before.cols, next.dataset.cols) };
  });
  if (own) return { ...p, extra: { ...p.extra, [own]: { ...p.extra![own]!, dataset: next.dataset, source: next.source, ...(next.sourceMeta ? { sourceMeta: structuredClone(next.sourceMeta) } : { sourceMeta: undefined }) } }, slideLocale: next.slideLocale, slides };
  return { ...p, ...setFamilyData(p, famNext, next.dataset), source: next.source, ...(next.sourceMeta ? { sourceMeta: structuredClone(next.sourceMeta) } : { sourceMeta: undefined }), slideLocale: next.slideLocale, slides };
}

// ──────────── スライドの操作 ────────────

export const selectSlide = (p: ProjectState, i: number): ProjectState => ({ ...p, current: clampIndex(p, i) });

/** 今のスライドを複製して、すぐ後ろに足す（新しいスライドはレシピなし） */
export function duplicateSlide(p: ProjectState, i: number = p.current): ProjectState {
  const src = p.slides[clampIndex(p, i)]!;
  const copy: SlideState = { ...structuredClone(src), id: newSlideId(), recipe: null };
  const slides = [...p.slides.slice(0, i + 1), copy, ...p.slides.slice(i + 1)];
  return { ...p, slides, current: i + 1 };
}

export function removeSlide(p: ProjectState, i: number = p.current): ProjectState {
  if (p.slides.length <= 1) return p;
  const slides = p.slides.filter((_, k) => k !== i);
  const current = p.current > i || p.current === slides.length ? Math.max(0, p.current - 1) : p.current;
  return dropUnused({ ...p, slides, current }, [p.slides[i]?.dataRef]);
}

export function moveSlide(p: ProjectState, i: number, dir: -1 | 1): ProjectState {
  const j = i + dir;
  if (j < 0 || j >= p.slides.length) return p;
  const slides = [...p.slides];
  [slides[i], slides[j]] = [slides[j]!, slides[i]!];
  return { ...p, slides, current: p.current === i ? j : p.current === j ? i : p.current };
}

// ──────────── ② で選んだ案から作る ────────────

/**
 * ② の計画 → プロジェクト。選んだ案を1枚ずつスライドにする（データは1つ）。
 * データは今のものを使う。サンプルのままなら、案に合うサンプルに替える（Mekko の形が要る案があれば構成のサンプル）。
 * 見出しは、まだデータを見ていないので、案の「答える問い」から始める。
 */
/**
 * 「新しく作る」の②から始める：前に編集していたデータは使わず、見本から始める（③でデータを入れる）。
 * 前の作業（未保存）はここに来る前に確認している
 */
export const newProjectFromPlan = (plan: Plan, locale: Locale): ProjectState | null => projectFromPlan(plan, initialState(locale), locale);

export function projectFromPlan(plan: Plan, base: BuilderState, locale: Locale): ProjectState | null {
  const chosen = chosenRecipes(plan);
  if (!chosen.length) return null;
  // データは形の種類（表・要因・関係）ごとに1つ。今のデータがその形で見本でなければ使い、そうでなければ案に合う見本
  const baseFam = familyOf(base.chart);
  const sample = isSampleData(base);
  // 2指標スロープが表のデータの最初の案なら、左右の指標の表が2つある見本
  const pick = (fam: DataFamily, schema: string, chart: string): BuilderState['dataset'] =>
    !sample && baseFam === fam ? base.dataset
      : fam === 'table' && SPECIAL_SAMPLE[chart as ChartTypeId] ? SPECIAL_SAMPLE[chart as ChartTypeId]!(locale).dataset
      : sampleFor(fam === 'table' ? (SCHEMA_SAMPLE[schema] ?? 'trend') : FAMILY_SAMPLE[fam], locale).dataset;
  const data: Partial<Record<DataFamily, BuilderState['dataset']>> = {};
  for (const c of chosen) {
    const fam = familyOf(primaryChart(c.recipe));
    if (!data[fam]) data[fam] = pick(fam, c.recipe.schema, primaryChart(c.recipe));
  }
  // 見本のデータなら出典も見本（画面の言語で）。スライドの言語は画面の言語に合わせる（前の作業の言語を引き継がない）
  const source = sample ? sampleFor('trend', locale).source : base.source;
  const slides = chosen.map((c) => {
    const fam = familyOf(primaryChart(c.recipe));
    const b = { ...base, dataset: data[fam]!, source };
    // データはすでに決めたので、applyRecipe がサンプルを替えないよう、決めたデータを渡したまま戻す
    const r0 = applyRecipe(b, c.recipe, c.addComplements);
    // 重視点で決めた設定（例：相関係数を表示）も入れる。別の見せ方はスライドに足さず、Coach の情報として持つ
    const v: BuilderState = resolveAutoControls({ ...r0, controls: { ...r0.controls, ...c.controls }, dataset: b.dataset, source, title: localize(c.recipe.question, locale), titleMeta: { author: 'rule' },
      coach: { purpose: c.purpose, emphasis: c.emphasis, alternatives: c.alternatives } });
    return slideOf(v, newSlideId(), c.recipe.id);
  });
  const datasets: ProjectState['datasets'] = {};
  if (data.bridge) datasets.bridge = data.bridge;
  if (data.relation) datasets.relation = data.relation;
  return {
    version: 3, dataset: data.table ?? (baseFam === 'table' && !sample ? base.dataset : sampleFor('trend', locale).dataset),
    ...(Object.keys(datasets).length ? { datasets } : {}),
    source, ...(sample ? { sourceMeta: sampleFor('trend', locale).sourceMeta } : base.sourceMeta ? { sourceMeta: structuredClone(base.sourceMeta) } : {}), slideLocale: locale, slides, current: 0, recommendation: recommendationState(plan),
  };
}

// ──────────── データの形 ────────────

/** どれかのスライドが比較期間のデータを使うか（使わなければデータ欄は表1つ） */
export const projectUsesBase = (p: ProjectState): boolean => p.slides.some((_, i) => slideUsesBase(viewOf(p, i)));

/** 年が列に並んでいて、行は年でない（推移のグラフには行と列の入れ替えが要る） */
export const yearsInColumns = (d: ProjectState['dataset']): boolean => isTimeAxis(d.cols) && !isTimeAxis(d.rows);

/** すべてのスライドが Mekko（行＝市場など、列＝構成）なら、年の向きは気にしない */
export const expectsTimeRows = (p: ProjectState): boolean => p.slides.some((s) => s.chart !== 'mekko' && ['trend', 'comparison', 'composition'].includes(registry.charts[s.chart].purpose));

/** 名前を指す設定（強調・比較の対象・表示する行・列など）。行と列を入れ替えると意味が変わるので外す */
const NAME_CONTROLS = ['items', 'series', 'highlight', 'base_target', 'compare_target', 'compare_target2'] as const;

/** データの行と列を入れ替える（現在・比較の両方。行・列の見出し名も入れ替える） */
export function transposeProject(p: ProjectState): ProjectState {
  const cur = p.slides[p.current]!;
  const fam = familyOf(cur.chart);
  const own = ownDataRef(p, cur);
  const key = dataKey(p, cur);
  const d = own ? p.extra![own]!.dataset : datasetFor(p, cur.chart);
  const tr = (v: (number | null)[][]) => d.cols.map((_, k) => d.rows.map((_, i) => v[i]?.[k] ?? null));
  // 縦長の表からの切り出しは、行と列を入れ替えた表とは合わなくなるので外す（画面では切り出し方の入れ替えを使う）
  const { groups: _g, long: _l, ...rest } = d;
  void _g; void _l;
  const dataset: ProjectState['dataset'] = {
    ...rest,
    rows: [...d.cols], cols: [...d.rows],
    // 行が年になり、行の名前が空なら「年」とする
    dimensions: { rows: d.dimensions?.cols || (timeRange(d.cols) ? (p.slideLocale === 'en' ? 'Year' : '年') : ''), cols: d.dimensions?.rows ?? '' },
    periods: {
      ...d.periods,
      current: { ...d.periods.current, values: tr(d.periods.current.values) },
      base: { ...d.periods.base, values: tr(d.periods.base.values) },
    },
  };
  const slides = p.slides.map((s) => {
    if (dataKey(p, s) !== key) return s;
    const controls = { ...s.controls };
    for (const k of NAME_CONTROLS) delete controls[k];
    return { ...s, controls, mekko: { ...s.mekko, growthRows: s.mekko.growthRows.filter((r) => r === 'market') } };
  });
  if (own) return { ...p, extra: { ...p.extra, [own]: { ...p.extra![own]!, dataset } }, slides };
  return { ...p, ...setFamilyData(p, fam, dataset), slides };
}

// ──────────── 検証・出力・読み戻し ────────────

export const viewSpecs = (p: ProjectState): ViewSpec[] => p.slides.map((_, i) => toViewSpec(viewOf(p, i)));

/** 全スライドを検証する（1枚でも error があれば保存しない） */
export function validateProject(p: ProjectState): { ok: boolean; results: ValidationResult[] } {
  const results = p.slides.map((_, i) => { const v = viewOf(p, i); return validateViewSpec(toViewSpec(v), toDataset(v)); });
  return { ok: results.every((r) => r.ok), results };
}

/** 表・言葉の型の項目を読み直す（知らない型・壊れた中身は外す） */
export function normalizeSlideTemplate(s: SlideState): SlideState {
  const { view, content, look, ...rest } = s;
  const c = normalizeContent(content), l = normalizeLook(look);
  return { ...rest, ...(isStoryTemplateId(view) ? { view } : {}), ...(c ? { content: c } : {}), ...(l ? { look: l } : {}) };
}

/**
 * ブラウザ保存や DB から読み戻した値を、今の保存形式（v3）に直す。
 * v1・v2（1枚だけ）は1枚のプロジェクトにする。壊れていれば null
 */
export function normalizeProject(v: unknown): ProjectState | null {
  const o = v as Partial<ProjectState> | null;
  if (o && typeof o === 'object' && o.version === 3) {
    if (!o.dataset || !Array.isArray(o.dataset.rows) || !o.dataset.periods?.base || !Array.isArray(o.slides) || !o.slides.length) return null;
    const slides = o.slides.filter((s) => s && CHART_TYPE_IDS.includes(s.chart) && s.controls && s.complements && s.mekko)
      .map((s) => normalizeSlideTemplate({ ...s, recipe: s.recipe && (RECIPE_IDS as readonly string[]).includes(s.recipe) ? s.recipe : null }));
    if (!slides.length) return null;
    const rawDesign = o.design;
    const palette = rawDesign && typeof rawDesign.palette === 'string' && (THEME_IDS as readonly string[]).includes(rawDesign.palette) ? rawDesign.palette as ThemeId : undefined;
    const font = rawDesign && typeof rawDesign.font === 'string' && (SLIDE_FONT_IDS as readonly string[]).includes(rawDesign.font) ? rawDesign.font as SlideFontId : undefined;
    const design = palette || font ? { ...(palette ? { palette } : {}), ...(font ? { font } : {}) } : undefined;
    const p = { ...(o as ProjectState), slides, ...(design ? { design } : { design: undefined }) };
    return { ...p, current: clampIndex(p, typeof o.current === 'number' ? o.current : 0) };
  }
  const b = normalizeState(v);
  return b ? fromBuilder(b) : null;
}

/**
 * 今のスライドの後ろに、案（レシピ）から作ったスライドを1枚足す（補完アドバイスの「スライドを追加」）。
 * データは同じもの（見本のままなら、その案に合う見本）。見出しは案の「答える問い」から始める
 */
export function addRecipeSlide(p: ProjectState, recipeId: RecipeId): ProjectState {
  const r = registry.recipes[recipeId];
  const d = duplicateSlide(p);
  const v = viewOf(d, d.current);
  const next: BuilderState = { ...applyRecipe(v, r), title: localize(r.question, p.slideLocale), titleMeta: { author: 'rule' } };
  const w = withView(d, d.current, next);
  return { ...w, slides: w.slides.map((s, i) => (i === w.current ? { ...s, recipe: recipeId } : s)) };
}
