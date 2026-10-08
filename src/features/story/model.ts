import {
  CHART_TYPE_IDS, CREATION_MODES, DESIRED_YES_IDS, PRESENTATION_MODE_IDS, PROOF_NEED_IDS, QUESTION_PRIORITY_IDS, RECIPE_IDS, STORY_ROUTE_IDS,
  STORY_SCOPE_IDS, STORY_SECTION_IDS, STORY_SIZE, STORY_SLIDE_STATUS_IDS,
  type CreationMode, type DesiredYesId, type Locale, type PresentationModeId, type ProofNeedId, type QuestionPriorityId, type RecipeId,
  type StoryRouteId, type StoryScopeId, type StorySectionId, type StorySlideStatusId, type StoryTemplateId, isStoryTemplateId,
  type PersonalizedStoryContext,
} from '@/registry';
import type { TemplateContent, TemplateLook } from '@/engine/layout/templates';
import { normalizeContent, normalizeLook } from '../templates/content';
import type { BuilderState } from '../editor/state';
import type { SlideState } from '../editor/project';
import { normalizeTextMeta, type TextMeta } from '../data/text';
import type { SourceMeta } from '../data/source';
import { normalizeDataPackPlan, type StoryDataPackPlan } from './dataPackPlan';

/**
 * Story（コース料理）の保存形式 v1。docs/story-spec.md 16章。
 * 1つの Story＝マイチャートの「Story」タブの1件（表 stories の1行）。
 * Story が Source Dataset を持ち、スライドは参照する（10章）。見せ方（グラフ・表・言葉）を替えても、
 * データ（datasets）と内容（textContent）は別に持つので失わない。
 * Message・Executive Summary・Decision などはユーザーが書く（Coach は代筆しない）
 */

export interface StoryDataset {
  id: string;
  label: string;
  /** 表のデータ（今のエディタのデータと同じ形） */
  data: BuilderState['dataset'];
  source: string;
  sourceMeta?: SourceMeta;
  /** 年・年度などの区別（10.6 の確認に使う）。分からなければ空 */
  periodType?: string;
  /** 共通のデータ（id＝table・bridge・relation）以外の、問いだけのデータの形の種類 */
  family?: 'table' | 'bridge' | 'relation';
}

export interface SuggestedDataNeed {
  label: string;
  suggestedShape: string[];
  reason: string;
}

/** スライド固有のデータの切り出し（期間・項目・並び・強調） */
export interface DataView {
  periods: string[];
  categories: string[];
  highlight: string | null;
}

export interface StorySlide {
  id: string;
  /** Main Story／Supporting Evidence／Appendix */
  section: StorySectionId;
  /** Route の役割（例：AIMED.IMPACT）。自分で足したスライドは null */
  routeRole: string | null;
  questionPriority: QuestionPriorityId;
  presentationMode: PresentationModeId;
  question: string;
  /** 問いを作ったもの。規則で作った後にユーザーが直した場合も区別する */
  questionMeta?: TextMeta;
  proofNeeds: ProofNeedId[];
  /** ユーザーが書く答え・主張 */
  userAuthoredMessage: string;
  suggestedDataNeeds: SuggestedDataNeed[];
  referenceRecipes: RecipeId[];
  datasetRefs: string[];
  dataView: DataView;
  /** グラフの中身（今のエディタの1枚分）。まだ作っていなければ null */
  visual: SlideState | null;
  /** 言葉・表の中身（テンプレートの ID と入力欄）。P4 で形を決める */
  textContent: { template: string; fields: Record<string, string> } | null;
  nextQuestion: string;
  status: StorySlideStatusId;
  /** 相談文で指定された見せ方（表・言葉の型）。最初のスライドをこの型で作る */
  template?: StoryTemplateId;
  /** 相談文から読み取った中身の下書き（KPI・比較表の見出しなど）。最初のスライドに入れる */
  seed?: { content: TemplateContent; look?: TemplateLook };
  /** 問いを自分で書き換えた（見せ方を替えても、問いを自動では替えない） */
  questionEdited?: boolean;
  /** AI相談時にこのQuestionへ紐づいた具体化。問いを編集した時は画面では出さない */
  personalization?: PersonalizedStoryContext;
}

export interface StoryState {
  version: 1;
  title: string;
  titleMeta?: TextMeta;
  slideLocale: Locale;
  /** 元の相談文（無ければ空） */
  consultation: string;
  scope: StoryScopeId;
  decisionQuestion: string;
  decisionQuestionMeta?: TextMeta;
  desiredYes: DesiredYesId | null;
  primaryBarrier: string;
  primaryRoute: StoryRouteId;
  /** 将来：Secondary Route（MVP では自動提案しない） */
  secondaryRoute: { route: StoryRouteId; startAt: string; transitionQuestion: string } | null;
  routeConfidence: number | null;
  businessArchetype: string | null;
  datasets: StoryDataset[];
  slides: StorySlide[];
  /** 編集中のスライドの位置 */
  current: number;
  /**
   * Executive Summary（14章）。enabled＝メインストーリーにそのスライドがある（スライドは問いの1つとして slides に持つ）。
   * skipped＝「今回はスキップ」を押した（地図の枠を小さくする）。evidenceSlideRefs＝参照しているスライド
   */
  executiveSummary: {
    enabled: boolean; skipped?: boolean; userAuthoredContent: Record<string, string>; evidenceSlideRefs: string[];
    /** 出力の時の位置：first＝先頭、last＝メインの最後（無ければこれ）。編集中はいつもメインの一番下 */
    position?: 'first' | 'last';
  };
  aiStoryReview: { lastReviewedRevision: string | null; result: unknown };
  /** 相談の入口で選んだ作りたいもの（Story を選んだか、Coach にまかせて Story になったか） */
  creationMode?: CreationMode;
  /** データを集める依頼（Story データパック）。実データが入る前の収集設計で、Dataset とは別に持つ。無い Story もある */
  dataPackPlan?: StoryDataPackPlan;
}

let seq = 0;
export const newStoryItemId = (prefix: 'q' | 'd') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptySlide(over: Partial<StorySlide> = {}): StorySlide {
  return {
    id: newStoryItemId('q'), section: 'MAIN', routeRole: null, questionPriority: 'REQUIRED', presentationMode: 'GRAPH',
    question: '', proofNeeds: [], userAuthoredMessage: '', suggestedDataNeeds: [], referenceRecipes: [], datasetRefs: [],
    questionMeta: { author: 'rule' },
    dataView: { periods: [], categories: [], highlight: null }, visual: null, textContent: null, nextQuestion: '', status: 'NOT_STARTED',
    ...over,
  };
}

export function newStory(locale: Locale, over: Partial<StoryState> = {}): StoryState {
  return {
    version: 1, title: '', slideLocale: locale, consultation: '', scope: 'STORY_FLOW', decisionQuestion: '', desiredYes: null,
    primaryBarrier: '', primaryRoute: 'AIMED', secondaryRoute: null, routeConfidence: null, businessArchetype: null,
    datasets: [], slides: [], current: 0,
    executiveSummary: { enabled: false, userAuthoredContent: {}, evidenceSlideRefs: [] },
    aiStoryReview: { lastReviewedRevision: null, result: null },
    ...over,
  };
}

// ──────────── 読み込み（保存したものが壊れていても、読めるところは読む） ────────────

const oneOf = <T extends string>(ids: readonly T[], v: unknown, fallback: T): T => ((ids as readonly string[]).includes(v as string) ? (v as T) : fallback);
const str = (v: unknown, max = 5000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const rec = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as Record<string, string> : {};

function normalizePersonalization(v: unknown): PersonalizedStoryContext | null {
  const o = v as Partial<PersonalizedStoryContext> | null;
  if (!o || typeof o !== 'object') return null;
  const explanation = str(o.explanation, 500).trim();
  if (!explanation) return null;
  const confidence = ['confirmed', 'proposed', 'unknown'].includes(o.confidence as string) ? o.confidence! : 'unknown';
  const hints = [...new Set(strs(o.requiredDataHints).map((x) => x.trim()).filter(Boolean))].slice(0, 5).map((x) => x.slice(0, 200));
  const unresolvedQuestion = str(o.unresolvedQuestion, 300).trim();
  const sourceTerms = [...new Set(strs(o.sourceTerms).map((x) => x.trim()).filter(Boolean))].slice(0, 5).map((x) => x.slice(0, 100));
  return {
    explanation,
    confidence,
    requiredDataHints: hints,
    ...(unresolvedQuestion ? { unresolvedQuestion } : {}),
    ...(sourceTerms.length ? { sourceTerms } : {}),
  };
}

function normalizeDataset(v: unknown): StoryDataset | null {
  const o = v as Partial<StoryDataset> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.data || !Array.isArray(o.data.rows) || !Array.isArray(o.data.cols)) return null;
  return { id: o.id, label: str(o.label, 200), data: o.data, source: str(o.source, 500), ...(o.sourceMeta ? { sourceMeta: o.sourceMeta } : {}), ...(o.periodType ? { periodType: str(o.periodType, 40) } : {}), ...(o.family && ['table', 'bridge', 'relation'].includes(o.family) ? { family: o.family } : {}) };
}

function normalizeVisual(v: unknown): SlideState | null {
  const s = v as Partial<SlideState> | null;
  if (!s || typeof s !== 'object' || !CHART_TYPE_IDS.includes(s.chart!) || !s.controls || !s.complements || !s.mekko) return null;
  return { ...(s as SlideState), recipe: s.recipe && (RECIPE_IDS as readonly string[]).includes(s.recipe) ? s.recipe : null };
}

function normalizeSlide(v: unknown, datasetIds: Set<string>): StorySlide | null {
  const o = v as Partial<StorySlide> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string') return null;
  const dv = (o.dataView ?? {}) as Partial<DataView>;
  const tc = o.textContent as StorySlide['textContent'] | undefined;
  const personalization = normalizePersonalization(o.personalization);
  return {
    id: o.id,
    section: oneOf(STORY_SECTION_IDS, o.section, 'MAIN'),
    routeRole: typeof o.routeRole === 'string' ? o.routeRole : null,
    questionPriority: oneOf(QUESTION_PRIORITY_IDS, o.questionPriority, 'REQUIRED'),
    presentationMode: oneOf(PRESENTATION_MODE_IDS, o.presentationMode, 'GRAPH'),
    question: str(o.question, 500),
    ...(normalizeTextMeta(o.questionMeta) ? { questionMeta: normalizeTextMeta(o.questionMeta) } : {}),
    proofNeeds: strs(o.proofNeeds).filter((p): p is ProofNeedId => (PROOF_NEED_IDS as readonly string[]).includes(p)),
    userAuthoredMessage: str(o.userAuthoredMessage, 1000),
    suggestedDataNeeds: (Array.isArray(o.suggestedDataNeeds) ? o.suggestedDataNeeds : [])
      .filter((n) => n && typeof n === 'object')
      .map((n) => ({ label: str(n.label, 200), suggestedShape: strs(n.suggestedShape), reason: str(n.reason, 500) })),
    referenceRecipes: strs(o.referenceRecipes).filter((r): r is RecipeId => (RECIPE_IDS as readonly string[]).includes(r)),
    // 無くなった Dataset への参照は外す（データは消さない）
    datasetRefs: strs(o.datasetRefs).filter((id) => datasetIds.has(id)),
    dataView: { periods: strs(dv.periods), categories: strs(dv.categories), highlight: typeof dv.highlight === 'string' ? dv.highlight : null },
    visual: normalizeVisual(o.visual),
    textContent: tc && typeof tc === 'object' && typeof tc.template === 'string' ? { template: tc.template, fields: rec(tc.fields) } : null,
    nextQuestion: str(o.nextQuestion, 500),
    status: oneOf(STORY_SLIDE_STATUS_IDS, o.status, 'NOT_STARTED'),
    ...(isStoryTemplateId(o.template) ? { template: o.template } : {}),
    ...(o.seed && typeof o.seed === 'object' && normalizeContent(o.seed.content) ? { seed: { content: normalizeContent(o.seed.content)!, ...(normalizeLook(o.seed.look) ? { look: normalizeLook(o.seed.look)! } : {}) } } : {}),
    ...(o.questionEdited === true ? { questionEdited: true } : {}),
    ...(personalization ? { personalization } : {}),
  };
}

export function normalizeStory(v: unknown): StoryState | null {
  const o = v as Partial<StoryState> | null;
  if (!o || typeof o !== 'object' || o.version !== 1) return null;
  const datasets = (Array.isArray(o.datasets) ? o.datasets : []).map(normalizeDataset).filter((d): d is StoryDataset => !!d);
  const ids = new Set(datasets.map((d) => d.id));
  const slides = (Array.isArray(o.slides) ? o.slides : []).map((s) => normalizeSlide(s, ids)).filter((s): s is StorySlide => !!s);
  const sec = o.secondaryRoute as StoryState['secondaryRoute'] | undefined;
  const es = (o.executiveSummary ?? {}) as Partial<StoryState['executiveSummary']>;
  const review = (o.aiStoryReview ?? {}) as Partial<StoryState['aiStoryReview']>;
  const dataPackPlan = normalizeDataPackPlan(o.dataPackPlan, new Set(slides.map((x) => x.id)));
  return {
    version: 1,
    title: str(o.title, 300),
    ...(normalizeTextMeta(o.titleMeta) ? { titleMeta: normalizeTextMeta(o.titleMeta) } : {}),
    slideLocale: o.slideLocale === 'en' ? 'en' : 'ja',
    consultation: str(o.consultation, 5000),
    scope: oneOf(STORY_SCOPE_IDS, o.scope, 'STORY_FLOW'),
    decisionQuestion: str(o.decisionQuestion, 500),
    ...(normalizeTextMeta(o.decisionQuestionMeta) ? { decisionQuestionMeta: normalizeTextMeta(o.decisionQuestionMeta) } : {}),
    desiredYes: (DESIRED_YES_IDS as readonly string[]).includes(o.desiredYes as string) ? (o.desiredYes as DesiredYesId) : null,
    primaryBarrier: str(o.primaryBarrier, 500),
    primaryRoute: oneOf(STORY_ROUTE_IDS, o.primaryRoute, 'AIMED'),
    secondaryRoute: sec && typeof sec === 'object' && (STORY_ROUTE_IDS as readonly string[]).includes(sec.route)
      ? { route: sec.route, startAt: str(sec.startAt, 100), transitionQuestion: str(sec.transitionQuestion, 500) } : null,
    routeConfidence: typeof o.routeConfidence === 'number' && o.routeConfidence >= 0 && o.routeConfidence <= 1 ? o.routeConfidence : null,
    businessArchetype: typeof o.businessArchetype === 'string' ? o.businessArchetype.slice(0, 100) : null,
    datasets,
    slides,
    current: Math.max(0, Math.min(slides.length - 1, typeof o.current === 'number' ? Math.floor(o.current) : 0)),
    executiveSummary: { enabled: es.enabled === true, ...(es.skipped === true ? { skipped: true } : {}), userAuthoredContent: rec(es.userAuthoredContent), evidenceSlideRefs: strs(es.evidenceSlideRefs), ...(es.position === 'first' || es.position === 'last' ? { position: es.position } : {}) },
    aiStoryReview: { lastReviewedRevision: typeof review.lastReviewedRevision === 'string' ? review.lastReviewedRevision : null, result: review.result ?? null },
    ...((CREATION_MODES as readonly string[]).includes(o.creationMode as string) ? { creationMode: o.creationMode } : {}),
    ...(dataPackPlan ? { dataPackPlan } : {}),
  };
}

// ──────────── 一覧に出す要約 ────────────

/** Main Story の枚数（表紙・Appendix などは数えない。Executive Summary は足した時だけ、メインのスライドとして数える。3.3） */
export const mainCount = (s: StoryState): number =>
  s.slides.filter((x) => x.section === 'MAIN' && x.questionPriority !== 'COACHING_ONLY').length;

/** 10 枚を超えたか（統合・Appendix・分割を提案する目安） */
export const overSoftMax = (s: StoryState): boolean => mainCount(s) > STORY_SIZE.softMax;

/** 一覧・検索に使う名前：自分で付けた名前 → 決めたい問い → 最初の Question */
export const storyDisplayTitle = (s: StoryState): string => s.title.trim() || s.decisionQuestion.trim() || s.slides[0]?.question.trim() || '';

/** 一覧の進み具合。done はスライドの status（保存のたびに編集画面の「確認済み」と同じ判定で付ける）を数える */
export interface StoryProgress { done: number; inProgress: number; total: number }
export const storyProgress = (s: StoryState): StoryProgress => {
  const main = s.slides.filter((x) => x.questionPriority !== 'COACHING_ONLY');
  return { done: main.filter((x) => x.status === 'DONE').length, inProgress: main.filter((x) => x.status === 'IN_PROGRESS').length, total: main.length };
};
