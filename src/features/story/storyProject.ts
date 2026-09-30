import { localize, primaryChart, registry, type Locale, type RecipeId } from '@/registry';
import { applyRecipe, isSampleData, resolveAutoControls } from '../editor/fromRecipe';
import { FAMILY_SAMPLE, familyOf, slideOf, viewOf, type DataFamily, type ProjectState, type SlideState } from '../editor/project';
import { SCHEMA_SAMPLE, SPECIAL_SAMPLE, initialState, sampleFor, type BuilderState } from '../editor/state';
import { EMPHASES } from '../start/coach';
import { dishFor } from './questionMap';
import { groupOf } from './storyOps';
import { emptySlide, type StoryDataset, type StorySlide, type StoryState } from './model';

/**
 * ストーリーの編集画面（docs/story-spec.md 8章）：今の編集画面（Builder）の部品を、ストーリーの形で使う。
 * ストーリー（問いの並び・Message・データ）⇄ 編集画面のプロジェクト（データ＋スライド N 枚）を行き来する。
 * - スライドの id ＝ 問いの id（行き来しても対応が崩れない）
 * - 編集画面に出すのは、グラフで見せる問い（外した問いと、言葉の問いは出さない）。並びはメイン → 付録
 * - データは、今の編集画面と同じく種類ごとに1つを共有（表・要因・関係）。複数の Dataset は後の段階
 * - Message ＝ スライドのメッセージタイトル（結論）。ユーザーが書く
 */

/** グラフで見せる問い（参考の見せ方があるか、もうグラフがある） */
export const isGraphQuestion = (s: StorySlide): boolean => s.presentationMode === 'GRAPH' && (!!s.visual || s.referenceRecipes.length > 0);

/** 編集画面に出す問い：外していない・グラフの問い。メインストーリー → 付録の順（それぞれストーリーの並び） */
export function editorQuestions(story: StoryState): StorySlide[] {
  const live = story.slides.filter((s) => groupOf(s) !== 'OUT' && isGraphQuestion(s));
  return [...live.filter((s) => groupOf(s) === 'MAIN'), ...live.filter((s) => groupOf(s) === 'APPENDIX')];
}

const FAMILIES: DataFamily[] = ['table', 'bridge', 'relation'];
const datasetOf = (story: StoryState, fam: DataFamily) => story.datasets.find((d) => d.id === fam)?.data;

/** まだグラフが無い問いの1枚目：参考の見せ方の1つ目で、決めたデータ（見本）から作る */
function firstVisual(q: StorySlide, data: Partial<Record<DataFamily, BuilderState['dataset']>>, source: string, locale: Locale): SlideState | null {
  const recipeId = q.referenceRecipes[0];
  if (!recipeId) return null;
  const recipe = registry.recipes[recipeId];
  const fam = familyOf(primaryChart(recipe));
  const b: BuilderState = { ...initialState(locale), dataset: data[fam]!, source };
  const r0 = applyRecipe(b, recipe);
  const dish = dishFor(q.proofNeeds);
  const purpose = dish ? (Object.keys(EMPHASES) as (keyof typeof EMPHASES)[]).find((p) => (EMPHASES[p] as readonly string[]).includes(dish)) : null;
  const v = resolveAutoControls({
    ...r0, dataset: b.dataset, source, title: q.userAuthoredMessage,
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
  const slides = qs.map((q) => prevSlide(q.id) ?? q.visual ?? firstVisual(q, data, source, locale)).filter((s): s is SlideState => !!s);
  const datasets: ProjectState['datasets'] = {};
  if (data.bridge) datasets.bridge = data.bridge;
  if (data.relation) datasets.relation = data.relation;
  const curId = prev?.slides[prev.current]?.id;
  const current = Math.max(0, slides.findIndex((s) => s.id === curId));
  return {
    version: 3, dataset: data.table, ...(Object.keys(datasets).length ? { datasets } : {}),
    source, slideLocale: prev?.slideLocale ?? story.slideLocale ?? locale, slides: slides.length ? slides : [slideOf(initialState(locale), 's1', null)], current,
  };
}

/**
 * 編集画面のプロジェクト → ストーリー（グラフ・Message・データを書き戻す）。問いの並びはストーリーのまま。
 * 編集画面で足したスライド（Coach の補完など）は、問いとして最後に足す
 */
export function mergeProject(story: StoryState, project: ProjectState, locale: Locale): StoryState {
  const byId = new Map(project.slides.map((s) => [s.id, s]));
  const known = new Set(story.slides.map((s) => s.id));
  const slides: StorySlide[] = story.slides.map((q) => {
    const v = byId.get(q.id);
    if (!v) return q;
    return { ...q, visual: v, userAuthoredMessage: v.title, status: q.status === 'DONE' ? 'DONE' : 'IN_PROGRESS' };
  });
  for (const v of project.slides) {
    if (known.has(v.id) || !v.recipe) continue;
    slides.push(emptySlide({ id: v.id, question: localize(registry.recipes[v.recipe].question, locale), referenceRecipes: [v.recipe], visual: v, userAuthoredMessage: v.title, status: 'IN_PROGRESS' }));
  }
  const datasets: StoryDataset[] = [{ id: 'table', label: '', data: project.dataset, source: project.source }];
  if (project.datasets?.bridge) datasets.push({ id: 'bridge', label: '', data: project.datasets.bridge, source: project.source });
  if (project.datasets?.relation) datasets.push({ id: 'relation', label: '', data: project.datasets.relation, source: project.source });
  const current = Math.max(0, slides.findIndex((s) => s.id === project.slides[project.current]?.id));
  return { ...story, slides, datasets, current, slideLocale: project.slideLocale };
}

/** その問いの進み具合（左の地図に出す）：確認済み（Message とデータがある）／作成中（グラフがある）／まだ */
export type QuestionProgress = 'done' | 'working' | 'todo';
export function progressOf(q: StorySlide, project: ProjectState): QuestionProgress {
  const i = project.slides.findIndex((s) => s.id === q.id);
  if (i < 0) return q.userAuthoredMessage.trim() ? 'done' : 'todo';
  const v = viewOf(project, i);
  return v.title.trim() && !isSampleData(v) ? 'done' : 'working';
}
