import { EXEC_SUMMARY_ROLE, STORY_TEMPLATES, localize, primaryChart, registry, type Locale, type RecipeId, type StoryTemplateId } from '@/registry';
import { ensureTemplate, templateFilled } from '../templates/content';
import { applyRecipe, isSampleData, resolveAutoControls } from '../editor/fromRecipe';
import { FAMILY_SAMPLE, dataKey, familyOf, slideOf, viewOf, type DataFamily, type ProjectState, type SlideState } from '../editor/project';
import { SCHEMA_SAMPLE, SPECIAL_SAMPLE, initialState, sampleFor, type BuilderState } from '../editor/state';
import { EMPHASES } from '../start/coach';
import { dishFor } from './questionMap';
import { groupOf } from './storyOps';
import { emptySlide, type StoryDataset, type StorySlide, type StoryState } from './model';

/**
 * ストーリーの編集画面（docs/story-spec.md 8章）：今の編集画面（Builder）の部品を、ストーリーの形で使う。
 * ストーリー（問いの並び・Message・データ）⇄ 編集画面のプロジェクト（データ＋スライド N 枚）を行き来する。
 * - スライドの id ＝ 問いの id（行き来しても対応が崩れない）
 * - 編集画面に出すのは、外していない問いすべて（グラフ・表・言葉）。並びはメイン → 付録。
 *   言葉の問い（判断など）は「結論＋3つの根拠」のスライドで始める
 * - データは、今の編集画面と同じく種類ごとに1つを共有（表・要因・関係）。複数の Dataset は後の段階
 * - Message ＝ スライドのメッセージタイトル（結論）。ユーザーが書く
 */

/** グラフで見せる問い（参考の見せ方があるか、もうグラフがある） */
export const isGraphQuestion = (s: StorySlide): boolean => s.presentationMode === 'GRAPH' && (!!s.visual || s.referenceRecipes.length > 0);

/** 編集画面に出す問い：外していない問いすべて。メインストーリー → 付録の順（それぞれストーリーの並び） */
export function editorQuestions(story: StoryState): StorySlide[] {
  return orderedQuestions(story);
}

/** スライドの見せ方（表・言葉なら table／text、グラフなら null）。左の地図に添える */
export function viewModeOf(q: StorySlide, project: ProjectState): 'table' | 'text' | null {
  const v = project.slides.find((s) => s.id === q.id)?.view ?? q.visual?.view;
  if (v) return STORY_TEMPLATES[v].kind;
  return q.presentationMode === 'TEXT' ? 'text' : q.presentationMode === 'TABLE' ? 'table' : null;
}

const FAMILIES: DataFamily[] = ['table', 'bridge', 'relation'];
const datasetOf = (story: StoryState, fam: DataFamily) => story.datasets.find((d) => d.id === fam)?.data;

/** 問いの最初の見せ方（表・言葉の型）。グラフで始める問いは null */
export function initialViewOf(q: StorySlide): StoryTemplateId | null {
  if (q.template) return q.template;
  if (q.presentationMode === 'GRAPH' && q.referenceRecipes[0]) return null;
  return q.routeRole === EXEC_SUMMARY_ROLE ? 'STORY_TEXT_EXECUTIVE_SUMMARY' : q.presentationMode === 'TABLE' ? 'STORY_TABLE_COMPARISON' : 'STORY_TEXT_CONCLUSION_REASONS';
}

/**
 * 見せ方を替えた時の問い：見せ方が元（保存してある見せ方）と違えば、その見せ方が答える問い。
 * 表・言葉の型はその型の問い、グラフはそのレシピの問い。替えていなければ null
 */
export function questionForView(q: StorySlide, v: SlideState, locale: Locale): string | null {
  const before = q.visual ? q.visual.view ?? null : initialViewOf(q);
  const after = v.view ?? null;
  if (before === after) return null;
  if (after) return localize(STORY_TEMPLATES[after].question, locale);
  return v.recipe ? localize(registry.recipes[v.recipe].question, locale) : null;
}

/** まだグラフが無い問いの1枚目：参考の見せ方の1つ目で、決めたデータ（見本）から作る */
function firstVisual(q: StorySlide, data: Partial<Record<DataFamily, BuilderState['dataset']>>, source: string, locale: Locale): SlideState | null {
  const recipeId = q.referenceRecipes[0];
  // 言葉・表の問い（グラフの見せ方が無い問いも）：相談文で指定した型、無ければ結論＋3つの根拠。結論＝これまでに書いたメッセージ
  const id = initialViewOf(q);
  if (id) {
    // 相談文から読み取った下書き（KPI・比較表の見出しなど）があれば、それを中身にする
    const b: BuilderState = { ...initialState(locale), dataset: data.table!, source, title: q.userAuthoredMessage, titleMeta: { author: 'user' },
      ...(q.seed ? { content: q.seed.content, ...(q.seed.look ? { look: q.seed.look } : {}) } : {}) };
    return slideOf({ ...b, ...ensureTemplate(b, id, true) }, q.id, null);
  }
  if (!recipeId) return null;
  const recipe = registry.recipes[recipeId];
  const fam = familyOf(primaryChart(recipe));
  const b: BuilderState = { ...initialState(locale), dataset: data[fam]!, source };
  const r0 = applyRecipe(b, recipe);
  const dish = dishFor(q.proofNeeds);
  const purpose = dish ? (Object.keys(EMPHASES) as (keyof typeof EMPHASES)[]).find((p) => (EMPHASES[p] as readonly string[]).includes(dish)) : null;
  const v = resolveAutoControls({
    ...r0, dataset: b.dataset, source, title: q.userAuthoredMessage, titleMeta: { author: 'user' },
    ...(purpose ? { coach: { purpose, emphasis: dish, alternatives: q.referenceRecipes.slice(1).map((recipe: RecipeId) => ({ recipe })) } } : {}),
  });
  return slideOf(v, q.id, recipeId);
}

/**
 * ストーリー → 編集画面のプロジェクト。prev（今のプロジェクト）があれば、そのデータ・スライドを引き継ぐ
 * （問いを並べ替えた・足した時に、入れたデータやグラフの設定を失わない）
 */
export function projectOfStory(story: StoryState, locale: Locale, prev?: ProjectState | null): ProjectState {
  const qs = editorQuestions(story);
  const prevSlide = (id: string) => prev?.slides.find((s) => s.id === id);
  // データは種類ごとに1つ：今のプロジェクト → 保存したストーリー → 最初の問いの見せ方に合う見本
  const data: Partial<Record<DataFamily, BuilderState['dataset']>> = {};
  if (prev) { data.table = prev.dataset; if (prev.datasets?.bridge) data.bridge = prev.datasets.bridge; if (prev.datasets?.relation) data.relation = prev.datasets.relation; }
  for (const fam of FAMILIES) if (!data[fam]) { const d = datasetOf(story, fam); if (d) data[fam] = d; }
  for (const q of qs) {
    const r = q.visual ? null : q.referenceRecipes[0] ? registry.recipes[q.referenceRecipes[0]] : null;
    const chart = q.visual?.chart ?? (r ? primaryChart(r) : null);
    if (!chart) continue;
    const fam = familyOf(chart);
    if (data[fam]) continue;
    data[fam] = fam === 'table' && SPECIAL_SAMPLE[chart] ? SPECIAL_SAMPLE[chart]!(locale).dataset
      : sampleFor(fam === 'table' ? (SCHEMA_SAMPLE[r?.schema ?? 'MATRIX_TIME_SERIES'] ?? 'trend') : FAMILY_SAMPLE[fam], locale).dataset;
  }
  if (!data.table) data.table = sampleFor('trend', locale).dataset;
  const source = prev?.source ?? story.datasets.find((d) => d.id === 'table')?.source ?? sampleFor('trend', locale).source;
  if (!data.table) data.table = sampleFor('trend', locale).dataset;
  const slides = qs.map((q) => prevSlide(q.id) ?? q.visual ?? firstVisual(q, data, source, locale)).filter((s): s is SlideState => !!s);
  const datasets: ProjectState['datasets'] = {};
  if (data.bridge) datasets.bridge = data.bridge;
  if (data.relation) datasets.relation = data.relation;
  // 開いた時の位置：前の位置。初めて開く時は保存した位置。ただし、まだ空の Executive Summary からは始めない
  // （最後にまとめる1枚なので、先に2枚目以降のメッセージを書く）
  const saved = story.slides[story.current];
  const emptyExec = (q: StorySlide | undefined) => !!q && q.routeRole === EXEC_SUMMARY_ROLE && !templateFilled(slides.find((x) => x.id === q.id) ?? {});
  const curId = prev?.slides[prev.current]?.id
    ?? (saved && !emptyExec(saved) ? saved.id : qs.find((q) => q.routeRole !== EXEC_SUMMARY_ROLE)?.id);
  const current = Math.max(0, slides.findIndex((s) => s.id === curId));
  // 問いだけのデータ（「このスライドだけ別のデータにする」）。外した問いのデータも残す
  const extra: NonNullable<ProjectState['extra']> = prev?.extra ? { ...prev.extra } : {};
  for (const d of story.datasets) {
    if ((FAMILIES as string[]).includes(d.id) || !d.family || extra[d.id]) continue;
    extra[d.id] = { label: d.label, family: d.family, dataset: d.data, source: d.source };
  }
  return {
    version: 3, dataset: data.table, ...(Object.keys(datasets).length ? { datasets } : {}), ...(Object.keys(extra).length ? { extra } : {}),
    source, slideLocale: prev?.slideLocale ?? story.slideLocale ?? locale, tone: 'story', slides: slides.length ? slides : [slideOf(initialState(locale), 's1', null)], current,
  };
}

/**
 * 編集画面のプロジェクト → ストーリー（グラフ・Message・データを書き戻す）。問いの並びはストーリーのまま。
 * 編集画面で足したスライド（Coach の補助スライドなど）は、問いとして今の問いのすぐ後ろに足す
 */
export function mergeProject(story: StoryState, project: ProjectState, locale: Locale): StoryState {
  const byId = new Map(project.slides.map((s) => [s.id, s]));
  const known = new Set(story.slides.map((s) => s.id));
  const slides: StorySlide[] = story.slides.map((q) => {
    const v = byId.get(q.id);
    if (!v) return q;
    const presentationMode = v.view ? (STORY_TEMPLATES[v.view].kind === 'table' ? 'TABLE' : 'TEXT') : 'GRAPH';
    // 見せ方を替えたら、問いもその見せ方の問いに（自分で書き換えた問いは替えない。画面で「替える」を出す）
    const nq = q.questionEdited ? null : questionForView(q, v, locale);
    return {
      ...q, ...(nq ? { question: nq } : {}), visual: v, presentationMode, userAuthoredMessage: v.title,
      // 完成の判定は編集画面の「確認済み」と同じ（一覧の「作成済み n / N」もこれを数える）
      status: progressOf(q, project) === 'done' ? 'DONE' : 'IN_PROGRESS',
      datasetRefs: v.dataRef && project.extra?.[v.dataRef] ? [v.dataRef] : [],
    };
  });
  // 足したスライドは、編集画面で直前にあるスライド（＝今の問い）のすぐ後ろに、同じ置き場所で入れる
  let prevId: string | null = null;
  for (const v of project.slides) {
    if (known.has(v.id) || !v.recipe) { prevId = v.id; continue; }
    const at = prevId ? slides.findIndex((s) => s.id === prevId) : -1;
    const before = at >= 0 ? slides[at] : undefined;
    const q = emptySlide({
      ...(v.dataRef && project.extra?.[v.dataRef] ? { datasetRefs: [v.dataRef] } : {}),
      id: v.id, question: localize(registry.recipes[v.recipe].question, locale), referenceRecipes: [v.recipe], visual: v, userAuthoredMessage: v.title, status: 'IN_PROGRESS',
      section: before?.section ?? 'MAIN', routeRole: before?.routeRole ?? null, questionPriority: 'SUPPORTING',
    });
    if (at >= 0) slides.splice(at + 1, 0, q); else slides.push(q);
    known.add(v.id);
    prevId = v.id;
  }
  const datasets: StoryDataset[] = [{ id: 'table', label: '', data: project.dataset, source: project.source }];
  if (project.datasets?.bridge) datasets.push({ id: 'bridge', label: '', data: project.datasets.bridge, source: project.source });
  if (project.datasets?.relation) datasets.push({ id: 'relation', label: '', data: project.datasets.relation, source: project.source });
  for (const [id, x] of Object.entries(project.extra ?? {})) datasets.push({ id, label: x.label, data: x.dataset, source: x.source, family: x.family });
  const current = Math.max(0, slides.findIndex((s) => s.id === project.slides[project.current]?.id));
  // Executive Summary：メインにあるか、参照しているスライド
  const es = slides.find((q) => q.routeRole === EXEC_SUMMARY_ROLE && groupOf(q) !== 'OUT');
  const executiveSummary = { ...story.executiveSummary, enabled: !!es, evidenceSlideRefs: es?.visual?.content?.exec ? [...new Set(es.visual.content.exec.mode === 'free' ? es.visual.content.exec.free?.refs ?? [] : es.visual.content.exec.blocks.flatMap((b) => b.refs))] : [] };
  return { ...story, slides, datasets, current, slideLocale: project.slideLocale, executiveSummary };
}

/** その問いの進み具合（左の地図に出す）：確認済み（Message とデータがある）／作成中（グラフがある）／まだ */
export type QuestionProgress = 'done' | 'working' | 'todo';
export function progressOf(q: StorySlide, project: ProjectState): QuestionProgress {
  const i = project.slides.findIndex((s) => s.id === q.id);
  if (i < 0) return q.userAuthoredMessage.trim() ? 'done' : 'todo';
  const v = viewOf(project, i);
  if (v.view) return v.title.trim() && templateFilled(v) ? 'done' : 'working';
  return v.title.trim() && !isSampleData(v) ? 'done' : 'working';
}

/** 左の地図と同じ並び：外していない問い（言葉の問いも含む）。メイン → 付録 */
export function orderedQuestions(story: StoryState): StorySlide[] {
  const live = story.slides.filter((s) => groupOf(s) !== 'OUT');
  const main = live.filter((s) => groupOf(s) === 'MAIN');
  // Executive Summary は、編集中はメインの一番下（ほかのスライドを作ってから書く）。出力の時に先頭か最後かを選ぶ
  const isExec = (s: StorySlide) => s.routeRole === EXEC_SUMMARY_ROLE;
  return [...main.filter((s) => !isExec(s)), ...main.filter(isExec), ...live.filter((s) => groupOf(s) === 'APPENDIX')];
}

/** 今の問いの位置（問い n / 全体。言葉の問いも数える）。見つからなければ null */
export function questionPosition(story: StoryState, id: string | null): { n: number; total: number } | null {
  const list = orderedQuestions(story);
  const i = id ? list.findIndex((q) => q.id === id) : -1;
  return i < 0 ? null : { n: i + 1, total: list.length };
}

/**
 * 今のスライドと同じデータを使う問い（データの欄の見出しに出す）。
 * main＝メインストーリーの番号（左の地図と同じ番号）、appendix＝付録の問いの数
 */
export function sharingQuestions(story: StoryState, project: ProjectState): { main: number[]; appendix: number } {
  const cur = project.slides[project.current];
  if (!cur) return { main: [], appendix: 0 };
  const key = dataKey(project, cur);
  const uses = new Set(project.slides.filter((s) => !s.view && dataKey(project, s) === key).map((s) => s.id));
  const list = orderedQuestions(story);
  const main: number[] = [];
  let appendix = 0, n = 0;
  for (const q of list) {
    const isMain = groupOf(q) === 'MAIN';
    if (isMain) n++;
    if (!uses.has(q.id)) continue;
    if (isMain) main.push(n); else appendix++;
  }
  return { main, appendix };
}

/**
 * 出力の並び：編集中はメインの一番下にある Executive Summary を、選んだ位置へ（最後が既定）。
 * 参照スライドの番号は、この並びで数え直す（出力でも viewOf が並びから番号を付ける）
 */
export function exportOrder(project: ProjectState, story: StoryState): ProjectState {
  // 既定は最後（編集中の並びのまま）。先頭を選んだ時だけ並べ替える
  if (story.executiveSummary.position !== 'first') return project;
  const ids = new Set(story.slides.filter((q) => q.routeRole === EXEC_SUMMARY_ROLE && groupOf(q) === 'MAIN').map((q) => q.id));
  const exec = project.slides.filter((s) => ids.has(s.id));
  if (!exec.length) return project;
  const slides = [...exec, ...project.slides.filter((s) => !ids.has(s.id))];
  const curId = project.slides[project.current]?.id;
  return { ...project, slides, current: Math.max(0, slides.findIndex((s) => s.id === curId)) };
}
