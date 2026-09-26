import type { LongPivot } from '@/registry';
import {
  CHART_TYPE_IDS, RECIPE_IDS, localize, primaryChart, registry, validateViewSpec,
  type ChartTypeId, type Locale, type RecipeId, type RecommendationState, type ValidationResult, type ViewSpec,
} from '@/registry';
import { applyRecipe, isSampleData } from './fromRecipe';
import { timeRange } from '@/engine/transform/cagr';
import { SCHEMA_SAMPLE, initialState, normalizeState, sampleFor, slideUsesBase, toDataset, toViewSpec, type BuilderState } from './state';
import { derivedUnit, longDataset, normalizePivot } from './long';
import { chosenRecipes, recommendationState, type Plan } from '../start/plan';

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
  controls: BuilderState['controls'];
  complements: BuilderState['complements'];
  mekko: BuilderState['mekko'];
  /** レシピの標準構成のうち、外した表のパネル（id） */
  hiddenParts?: string[];
  /** 縦長の表から切り出している時の、このスライドの切り出し方（Vol と Val を別のスライドにできる） */
  longPivot?: LongPivot;
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
const FAMILY_SAMPLE: Record<DataFamily, 'trend' | 'contribution' | 'relationship'> = { table: 'trend', bridge: 'contribution', relation: 'relationship' };

export interface ProjectState {
  version: 3;
  /** 表の形のデータ（推移・比較・構成のスライドで共通） */
  dataset: BuilderState['dataset'];
  /** 要因・関係のデータ（そのスライドがある時だけ） */
  datasets?: Partial<Record<'bridge' | 'relation', BuilderState['dataset']>>;
  source: string;
  slideLocale: Locale;
  slides: SlideState[];
  /** 編集中のスライドの位置 */
  current: number;
  /** ② で選んだ推薦の状態（相談から作った時など） */
  recommendation?: RecommendationState;
  /** Library の見本を複製して作った時の元（左側に「Library から」と出す。相談文の代わり） */
  origin?: { kind: 'library'; id: string; title: string };
}

let seq = 0;
export const newSlideId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

const slideOf = (s: BuilderState, id: string, recipe: RecipeId | null): SlideState => ({
  id, recipe, chart: s.chart, title: s.title,
  controls: structuredClone(s.controls), complements: structuredClone(s.complements), mekko: structuredClone(s.mekko),
  ...(s.hiddenParts?.length ? { hiddenParts: [...s.hiddenParts] } : {}),
  ...(s.dataset.long && familyOf(s.chart) === 'table' ? { longPivot: structuredClone(s.dataset.long.pivot) } : {}),
});

/** 1枚分の状態（v2）→ 1枚のプロジェクト */
export function fromBuilder(s: BuilderState, recipe: RecipeId | null = null): ProjectState {
  const fam = familyOf(s.chart);
  const base = { version: 3 as const, source: s.source, slideLocale: s.slideLocale, slides: [slideOf(s, 's1', recipe)], current: 0 };
  return fam === 'table' ? { ...base, dataset: s.dataset } : { ...base, dataset: sampleFor('trend').dataset, datasets: { [fam]: s.dataset } };
}

/** そのチャートが使うデータ（無ければ見本） */
export function datasetFor(p: ProjectState, chart: ChartTypeId): BuilderState['dataset'] {
  const fam = familyOf(chart);
  if (fam === 'table') return p.dataset;
  return p.datasets?.[fam] ?? sampleFor(FAMILY_SAMPLE[fam]).dataset;
}

/** データを種類の場所に書き戻す */
function setFamilyData(p: ProjectState, fam: DataFamily, d: BuilderState['dataset']): Pick<ProjectState, 'dataset' | 'datasets'> {
  return fam === 'table' ? { dataset: d, datasets: p.datasets } : { dataset: p.dataset, datasets: { ...(p.datasets ?? {}), [fam]: d } };
}

/** 同じデータを使うスライドの数（データ欄の見出し用） */
export const sharedCount = (p: ProjectState, i: number = p.current): number => {
  const fam = familyOf(p.slides[clampIndex(p, i)]!.chart);
  return p.slides.filter((s) => familyOf(s.chart) === fam).length;
};

export const initialProject = (): ProjectState => fromBuilder(initialState());

const clampIndex = (p: ProjectState, i: number) => Math.min(Math.max(0, i), p.slides.length - 1);

/** i 枚目のスライドを、画面の部品が使う1枚分の状態にする */
export function viewOf(p: ProjectState, i: number = p.current): BuilderState {
  const s = p.slides[clampIndex(p, i)]!;
  const d = datasetFor(p, s.chart);
  // 縦長の表から切り出している時は、このスライドの切り出し方で表を作る
  const dataset = d.long && s.longPivot ? longDataset(d, d.long, normalizePivot(d.long, s.longPivot)) : d;
  return {
    version: 2, dataset, source: p.source, slideLocale: p.slideLocale,
    chart: s.chart, title: s.title, controls: s.controls, complements: s.complements, mekko: s.mekko,
    recipe: s.recipe, hiddenParts: s.hiddenParts ?? [],
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
    const slides = p.slides.map((s, k) => (k === at ? slideOf(next, s.id, null) : s));
    const data = p.datasets?.[famNext as 'bridge'] || famNext === 'table' ? {} : { datasets: { ...(p.datasets ?? {}), [famNext]: sampleFor(FAMILY_SAMPLE[famNext]).dataset } };
    return { ...p, ...data, source: next.source, slideLocale: next.slideLocale, slides };
  }
  const before = datasetFor(p, next.chart);
  // 切り出し中で、割合でなければ、画面で入れた単位を元の値の単位として残す
  const L = next.dataset.long;
  if (L && L.pivot.share == null && (next.dataset.unit ?? '') !== derivedUnit(L, L.pivot)) next = { ...next, dataset: { ...next.dataset, long: { ...L, unit: next.dataset.unit ?? '' } } };
  const slides = p.slides.map((s, k) => {
    // チャートを替えたら、もうそのレシピではない
    if (k === at) return slideOf(next, s.id, next.chart === s.chart ? s.recipe : null);
    // 同じデータを使うほかのスライドの設定も、行・列の名前の変更に合わせる
    if (familyOf(s.chart) !== famNext) return s;
    // 切り出しをやめたら、ほかのスライドの切り出し方も外す。自分の切り出し方があるスライドは名前をそのまま
    if (s.longPivot && !next.dataset.long) { const { longPivot: _lp, ...rest } = s; void _lp; return rest; }
    if (s.longPivot) return s;
    const c1 = remapNames(s.controls, before.rows, next.dataset.rows);
    return { ...s, controls: remapNames(c1, before.cols, next.dataset.cols) };
  });
  return { ...p, ...setFamilyData(p, famNext, next.dataset), source: next.source, slideLocale: next.slideLocale, slides };
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
  return { ...p, slides, current };
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
export function projectFromPlan(plan: Plan, base: BuilderState, locale: Locale): ProjectState | null {
  const chosen = chosenRecipes(plan);
  if (!chosen.length) return null;
  // データは形の種類（表・要因・関係）ごとに1つ。今のデータがその形で見本でなければ使い、そうでなければ案に合う見本
  const baseFam = familyOf(base.chart);
  const sample = isSampleData(base);
  const pick = (fam: DataFamily, schema: string): BuilderState['dataset'] =>
    !sample && baseFam === fam ? base.dataset : sampleFor(fam === 'table' ? (SCHEMA_SAMPLE[schema] ?? 'trend') : FAMILY_SAMPLE[fam]).dataset;
  const data: Partial<Record<DataFamily, BuilderState['dataset']>> = {};
  for (const c of chosen) {
    const fam = familyOf(primaryChart(c.recipe));
    if (!data[fam]) data[fam] = pick(fam, c.recipe.schema);
  }
  const source = sample ? sampleFor('trend').source : base.source;
  const slides = chosen.map((c) => {
    const fam = familyOf(primaryChart(c.recipe));
    const b = { ...base, dataset: data[fam]!, source };
    // データはすでに決めたので、applyRecipe がサンプルを替えないよう、決めたデータを渡したまま戻す
    const v = { ...applyRecipe(b, c.recipe, c.addComplements), dataset: b.dataset, source, title: localize(c.recipe.question, locale) };
    return slideOf(v, newSlideId(), c.recipe.id);
  });
  const datasets: ProjectState['datasets'] = {};
  if (data.bridge) datasets.bridge = data.bridge;
  if (data.relation) datasets.relation = data.relation;
  return {
    version: 3, dataset: data.table ?? (baseFam === 'table' && !sample ? base.dataset : sampleFor('trend').dataset),
    ...(Object.keys(datasets).length ? { datasets } : {}),
    source, slideLocale: base.slideLocale, slides, current: 0, recommendation: recommendationState(plan),
  };
}

// ──────────── データの形 ────────────

/** どれかのスライドが比較期間のデータを使うか（使わなければデータ欄は表1つ） */
export const projectUsesBase = (p: ProjectState): boolean => p.slides.some((_, i) => slideUsesBase(viewOf(p, i)));

/** 年が列に並んでいて、行は年でない（推移のグラフには行と列の入れ替えが要る） */
export const yearsInColumns = (d: ProjectState['dataset']): boolean => !!timeRange(d.cols) && !timeRange(d.rows);

/** すべてのスライドが Mekko（行＝市場など、列＝構成）なら、年の向きは気にしない */
export const expectsTimeRows = (p: ProjectState): boolean => p.slides.some((s) => s.chart !== 'mekko' && ['trend', 'comparison', 'composition'].includes(registry.charts[s.chart].purpose));

/** 名前を指す設定（強調・比較の対象・表示する行・列など）。行と列を入れ替えると意味が変わるので外す */
const NAME_CONTROLS = ['items', 'series', 'highlight', 'base_target', 'compare_target', 'compare_target2'] as const;

/** データの行と列を入れ替える（現在・比較の両方。行・列の見出し名も入れ替える） */
export function transposeProject(p: ProjectState): ProjectState {
  const fam = familyOf(p.slides[p.current]!.chart);
  const d = datasetFor(p, p.slides[p.current]!.chart);
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
    if (familyOf(s.chart) !== fam) return s;
    const controls = { ...s.controls };
    for (const k of NAME_CONTROLS) delete controls[k];
    return { ...s, controls, mekko: { ...s.mekko, growthRows: s.mekko.growthRows.filter((r) => r === 'market') } };
  });
  return { ...p, ...setFamilyData(p, fam, dataset), slides };
}

// ──────────── 検証・出力・読み戻し ────────────

export const viewSpecs = (p: ProjectState): ViewSpec[] => p.slides.map((_, i) => toViewSpec(viewOf(p, i)));

/** 全スライドを検証する（1枚でも error があれば保存しない） */
export function validateProject(p: ProjectState): { ok: boolean; results: ValidationResult[] } {
  const results = p.slides.map((_, i) => { const v = viewOf(p, i); return validateViewSpec(toViewSpec(v), toDataset(v)); });
  return { ok: results.every((r) => r.ok), results };
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
      .map((s) => ({ ...s, recipe: s.recipe && (RECIPE_IDS as readonly string[]).includes(s.recipe) ? s.recipe : null }));
    if (!slides.length) return null;
    const p = { ...(o as ProjectState), slides };
    return { ...p, current: clampIndex(p, typeof o.current === 'number' ? o.current : 0) };
  }
  const b = normalizeState(v);
  return b ? fromBuilder(b) : null;
}
