import { applyClarify } from '@/lib/advisor/clarify';
import {
  RECIPE_DB_VERSION, activeRecipes, recipesForChart, recipesForPurpose, registry,
  type ChartTypeId, type ComplementId, type ConsultationClassification, type ControlId, type PurposeId, type RecipeDef,
  type MissingInfo, type RecipeId, type RecommendationState,
} from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import { AUTO_EMPHASIS, emphasesFor, inferEmphasis, recommend, type CoachIntent, type EmphasisId, type Proposal, type Recommendation } from './coach';
import { ASKS, CHART_EMPHASES, type AskId, type Conditions } from './dishes';
import { PURPOSE_EMPHASES } from './purposeMeta';
import type { CreationMode, StoryReading } from '@/registry';
import type { DepthAnswer } from '../story/scope';
import type { StoryState } from '../story/model';
import type { StoryDataPackPlan } from '../story/dataPackPlan';

/**
 * ② 伝え方を決める（Coach 型）。画面の状態で、ブラウザに保存する。
 * ユーザーが決めるのは「何を最も伝えたいか」（重視点）だけ。見せ方は Coach がリード1つに決め、別案2つは裏で持つ（選ばせない）。
 * 3つの入り口（相談・目的・チャート）とも、切り口ごとに CoachIntent を作り、同じ規則（coach.ts）で推薦する。
 */

export type EntryMode = RecommendationState['entry_mode'];

/** 切り口（目的1つ分）。重視点が決まれば、リードと別案が決まる */
export interface Angle {
  id: string;
  purpose: PurposeId;
  /** 重視点。null＝まだ決まっていない（質問する） */
  emphasis: EmphasisId | null;
  /** inferred＝Coach が相談文から推定、user＝ユーザーが選んだ */
  emphasisSource: 'inferred' | 'user' | null;
  /** 一問だけの確認への答え（例：構成比の変化も一緒に見せるか） */
  answers?: Partial<Record<AskId, string>>;
  /** Coach がすすめた切り口（② でバッジを付ける。ユーザーが選び直しても残す） */
  coachEmphasis?: EmphasisId | null;
  /** ③ で選んだスライドの形（レシピ）。無し＝Coach のおすすめ。今の候補に無ければおすすめに戻る */
  recipe?: RecipeId;
}

export interface Consultation {
  text: string;
  classification: ConsultationClassification;
  /** 誰が分類したか（AI／ルール版）。ルール版に戻った時はその理由 */
  classifier?: 'ai' | 'rules';
  fallback?: 'login' | 'limit' | 'off' | 'failed' | 'no_match';
  /** 相談の履歴に残した id（ログイン中だけ） */
  historyId?: string;
  summary: string;
  question: string;
  /** AI が重視した相談文の言葉（今の読み方の根拠） */
  focus?: string[];
  /** 相談文に混ざっていた、もう1つの問い（AI が見つけた時だけ）。選ぶと切り口が入れ替わる（AI は使わない） */
  alternative?: { question: string; classification: ConsultationClassification; focus: string[] } | null;
  /** 今どちらの問いで提案しているか */
  reading?: 'primary' | 'alternative';
  /** 最初の読み方（切り替えて戻す時に使う） */
  primary?: { classification: ConsultationClassification; question: string; focus: string[] };
  /** 提案を見て書き足した補足（出し直した時だけ） */
  note?: string;
  /** Coach が推定した重視点の確からしさ（0〜1） */
  inferredConfidence?: number;
  /** Story 用の AI の読み取り（1枚か Story かを規則で決める。docs/story-spec.md 5章）。ルール版の時は無い */
  story?: StoryReading | null;
}

export interface Plan {
  version: 2;
  entry: EntryMode;
  consultation?: Consultation;
  /** チャートから入った時のチャート（リードに固定する） */
  chart?: ChartTypeId;
  angles: Angle[];
  seq: number;
  /** 編集画面から「② に戻る」で来た時：入れたデータを保ったまま、伝え方だけを選び直す */
  keepData?: boolean;
  /** その時に入っていたデータから判定した、一品料理のデータの条件（docs/dish-matrix.md） */
  dataConditions?: Conditions;
  /** 1枚か Story かの一問への答え（5.7） */
  scopeAnswer?: DepthAnswer;
  /** おすすめと違う進め方を選んだ時（「まず1枚に絞る」「Story として組み立てる」） */
  scopeChoice?: 'one' | 'story';
  /** ② で整えている Story の下書き（Question の並び・まとめ方・置き場所）。「この Story から始める」で保存する。null／無し＝相談の読み取りのまま */
  storyDraft?: StoryState | null;
  /** 下書きを作り直した時に、データパックの設計だけ残しておく場所（storyDraft が null でも失わない）。draftOf が戻す */
  dataPackKept?: StoryDataPackPlan;
  /** 「まずは1枚だけ作る」：選んでいる問い（ストーリーの下書きのスライドの id） */
  onePick?: string;
  /** 1枚にした問い。ストーリーに戻る時のために、それまでの切り口も持つ */
  oneFrom?: { slideId: string; question: string; anglesBefore: Angle[] };
  /** 1枚の流れで出し直した後：新しい読み取りから、問いを選ばずにそのまま1枚の提案（ストーリーのおすすめは出さない） */
  oneKept?: boolean;
  /** 相談の入口で選んだ作りたいもの（1枚／Story／Coach にまかせる）。ユーザーの選択で、AI は上書きしない */
  creationMode?: CreationMode;
  /** Coach にまかせた時、最初に Coach がすすめた進め方（おすすめと最後に選んだ形の一致率を数える） */
  coachScope?: 'one' | 'story';
  /** 入口で選んだ形にできなかった理由（Story を選んだが AI の読み取りが無い） */
  modeNote?: 'storyNeedsAi' | 'oneByContent' | 'storyByContent';
}

/** いまのエンジンで描けるレシピだけを出す（描けないものは提案しない） */
export const availableRecipes = (): RecipeDef[] => activeRecipes().filter(recipeRenderable);
const available = (r: RecipeDef) => recipeRenderable(r);

/** 描けないレシピの数（画面に「準備中 N 件」と出す） */
export const pendingRecipeCount = () => activeRecipes().length - availableRecipes().length;

/** 入り口 B の目的：描けるレシピが1つでもある目的だけ選べる */
export const purposeHasRecipes = (p: PurposeId) => recipesForPurpose(p).some(available) && emphasesFor(p).length > 0;
/** 入り口 C のチャート：そのチャートがメインの、描けるレシピがあるものだけ選べる */
export const chartHasRecipes = (c: ChartTypeId) => recipesForChart(c).some(available);

function nextId(plan: Pick<Plan, 'seq'>): string {
  plan.seq += 1;
  return `a${plan.seq}`;
}

const clone = (p: Plan): Plan => structuredClone(p);

/** Story の下書きを捨てる（選び直し・入口の切り替え）。データパックの設計は捨てずに持ち越す */
export const withoutStoryDraft = (p: Plan): Plan => ({ ...p, storyDraft: null, dataPackKept: p.storyDraft?.dataPackPlan ?? p.dataPackKept });

// ──────────── 入り口ごとに計画を作る ────────────

/**
 * 相談から：AI（または規則）の分類から目的と重視点を推定する。確からしければ重視点を自動で選び、そうでなければ1問だけ聞く。
 * ここから先は AI を使わない（重視点の変更・別案・差し替えも規則）
 */
export function planFromConsultation(c: Consultation): Plan {
  const plan: Plan = { version: 2, entry: 'CONSULTATION', angles: [], seq: 0 };
  // もう1つの問いを中心にした時は、相談文全体ではなく、その問いの言葉で推定する（元の問いの「牽引」などに引っ張られない）
  const basis = c.reading === 'alternative' ? [c.question, ...(c.focus ?? [])].join(' ') : c.text;
  const inf = inferEmphasis(c.classification, basis, { override: c.reading !== 'alternative' });
  const auto = inf.emphasis && inf.confidence >= AUTO_EMPHASIS ? inf.emphasis : null;
  plan.consultation = { ...c, inferredConfidence: inf.confidence };
  if (emphasesFor(inf.purpose).length) plan.angles = [{ id: nextId(plan), purpose: inf.purpose, emphasis: auto, emphasisSource: auto ? 'inferred' : null, coachEmphasis: auto }];
  return plan;
}

/** 相談に混ざっていた2つの問いのうち、どちらを中心に見せるかを切り替える（AI は使わない） */
export function switchReading(plan: Plan, which: 'primary' | 'alternative'): Plan {
  const c = plan.consultation;
  if (!c?.alternative || (c.reading ?? 'primary') === which) return plan;
  const primary = c.primary ?? { classification: c.classification, question: c.question, focus: c.focus ?? [] };
  const next = which === 'alternative'
    ? { classification: c.alternative.classification, question: c.alternative.question, focus: c.alternative.focus }
    : primary;
  return planFromConsultation({ ...c, ...next, primary, reading: which });
}

/** 確認の答えを反映して、推定し直す（相談文と要約はそのまま。答えは分類に残る） */
export function answerClarify(plan: Plan, answers: Partial<Record<MissingInfo, number>>): Plan {
  const c = plan.consultation;
  if (!c) return plan;
  return planFromConsultation({ ...c, classification: applyClarify(c.classification, answers) });
}

/** 目的から：目的ごとに切り口を1つ。重視点は質問する（AI は使わない） */
export function planFromPurposes(purposes: PurposeId[]): Plan {
  const plan: Plan = { version: 2, entry: 'PURPOSE', angles: [], seq: 0 };
  plan.angles = purposes.filter(purposeHasRecipes).map((p) => ({ id: nextId(plan), purpose: p, emphasis: null, emphasisSource: null }));
  return plan;
}

/**
 * 目的から（1つだけ選ぶ）：その目的の基本の伝えたいことを最初から選んでおく（② にもすぐおすすめが出る）。
 * ほかの目的は、② で「一緒に見せる案」として Coach が出す（purposeMeta.ts）
 */
export function planFromPurpose(purpose: PurposeId): Plan {
  const plan: Plan = { version: 2, entry: 'PURPOSE', angles: [], seq: 0 };
  if (!purposeHasRecipes(purpose)) return plan;
  const all = emphasesFor(purpose);
  const best = PURPOSE_EMPHASES[purpose]?.order.find((e) => all.includes(e)) ?? all[0] ?? null;
  plan.angles = [{ id: nextId(plan), purpose, emphasis: best, emphasisSource: best ? 'inferred' : null, coachEmphasis: best }];
  return plan;
}

/** チャートから：チャートはリードに固定。重視点で補完パーツを変える（AI は使わない） */
export function planFromChart(chart: ChartTypeId): Plan {
  const plan: Plan = { version: 2, entry: 'CHART', chart, angles: [], seq: 0 };
  // そのチャートが一番得意な伝えたいことを、最初から選んでおく（② にもすぐ案が出る）
  const best = CHART_EMPHASES[chart]?.order[0] ?? null;
  plan.angles = [{ id: nextId(plan), purpose: registry.charts[chart].purpose, emphasis: best, emphasisSource: best ? 'inferred' : null, coachEmphasis: best }];
  return plan;
}

// ──────────── 画面の操作（すべて新しい計画を返す） ────────────

/** 重視点を選ぶ・変える（推薦は規則で即時に出し直す） */
export function setEmphasis(plan: Plan, angleId: string, emphasis: EmphasisId): Plan {
  const p = clone(plan);
  const a = p.angles.find((x) => x.id === angleId);
  if (a) {
    a.emphasis = emphasis; a.emphasisSource = 'user';
    // チャートから入った時は、伝えたいことを替えたら、まず選んだチャートの案に戻す（別案は選び直した時だけ）
    // チャート・目的から入った時は、伝えたいことを替えたら、その伝えたいことのおすすめに戻す（別案は選び直した時だけ）
    if (p.entry === 'CHART' || p.entry === 'PURPOSE') delete a.recipe; else keepRecipeIfOffered(p, a);
  }
  return p;
}

/** ③ の候補（おすすめ＋ほかの形）。確認の一問に答えるまでは無し */
export function presentationOptions(plan: Plan, a: Angle): Proposal[] {
  const rec = angleRecommendation(plan, a);
  return rec && !rec.ask ? [rec.lead, ...rec.alternatives] : [];
}

/** 今選んでいるスライドの形（選んだ形が候補に無ければ、Coach のおすすめ） */
export function selectedProposal(plan: Plan, a: Angle): Proposal | null {
  const opts = presentationOptions(plan, a);
  return opts.find((x) => x.recipe === a.recipe) ?? opts[0] ?? null;
}

/** ③ でスライドの形を選ぶ（AI は使わない）。おすすめを選んだ時は「選んでいない」に戻す */
export function setPresentation(plan: Plan, angleId: string, recipe: RecipeId): Plan {
  const p = clone(plan);
  const a = p.angles.find((x) => x.id === angleId);
  if (!a) return plan;
  const rec = angleRecommendation(p, a);
  if (rec && !rec.ask && rec.lead.recipe === recipe) delete a.recipe;
  else a.recipe = recipe;
  return p;
}

/** 切り口・確認の答えを変えた後：選んでいた形が新しい候補に無ければ、おすすめに戻す */
function keepRecipeIfOffered(p: Plan, a: Angle) {
  if (a.recipe && !presentationOptions(p, a).some((x) => x.recipe === a.recipe)) delete a.recipe;
}

/** 確認（一問だけ）に答える。答えは条件になり、推薦を出し直す */
export function answerAsk(plan: Plan, angleId: string, ask: AskId, option: string): Plan {
  const p = clone(plan);
  const a = p.angles.find((x) => x.id === angleId);
  if (a) { a.answers = { ...(a.answers ?? {}), [ask]: option }; keepRecipeIfOffered(p, a); }
  return p;
}

/** 確認の答えを取り消す（もう一度聞く） */
export function clearAsk(plan: Plan, angleId: string, ask: AskId): Plan {
  const p = clone(plan);
  const a = p.angles.find((x) => x.id === angleId);
  if (a?.answers) { const { [ask]: _drop, ...rest } = a.answers; void _drop; a.answers = rest; keepRecipeIfOffered(p, a); }
  return p;
}

/** 今の推薦に効いている確認の答え（取り消すと、また聞かれるもの） */
export function activeAnswers(plan: Plan, a: Angle): { ask: AskId; option: string }[] {
  return (Object.entries(a.answers ?? {}) as [AskId, string][]).filter(([ask]) => {
    const without = clearAsk(plan, a.id, ask);
    return angleRecommendation(without, without.angles.find((x) => x.id === a.id)!)?.ask === ask;
  }).map(([ask, option]) => ({ ask, option }));
}

/** 相談文の言葉から、重視点のほかにも求められていること（伸びの速さ＋構成比の変化） */
const MIX_WORDS = /構成比|シェア|内訳の変化|比率の変化|\bmix\b|share of/i;
const SPEED_WORDS = /成長率|伸び率|CAGR|速さ|ペース|growth rate|how fast/i;

/**
 * データ入力前の条件（docs/dish-matrix.md 3章）。相談の分類から分かるものと、確認の答え。
 * 分からないものは入れない（unknown：見本のデータは満たすので、満たすものとして扱う）
 */
export function conditionsOf(plan: Plan, a: Angle): Conditions {
  const c: Conditions = { ...(plan.dataConditions ?? {}) };
  const tm = plan.consultation?.classification.time_mode;
  // データがあればデータの期間の数を優先する
  if (!plan.dataConditions && tm === 'TWO_POINT') { c.PERIODS_2 = 'yes'; c.PERIODS_3PLUS = 'no'; c.PERIODS_2PLUS = 'yes'; }
  if (!plan.dataConditions && tm === 'MULTI_PERIOD') { c.PERIODS_2 = 'no'; c.PERIODS_3PLUS = 'yes'; c.PERIODS_2PLUS = 'yes'; }
  if (!plan.dataConditions && tm === 'NONE') { c.PERIODS_2 = 'no'; c.PERIODS_3PLUS = 'no'; c.PERIODS_2PLUS = 'no'; }
  for (const [ask, opt] of Object.entries(a.answers ?? {}) as [AskId, string][]) {
    Object.assign(c, ASKS[ask]?.options.find((o) => o.id === opt)?.sets ?? {});
  }
  return c;
}

/** 切り口（目的）を足す（Advanced）。もう1枚、別の問いのスライドになる */
export function addPurposeAngle(plan: Plan, purpose: PurposeId): Plan {
  if (!purposeHasRecipes(purpose)) return plan;
  const p = clone(plan);
  p.angles.push({ id: nextId(p), purpose, emphasis: null, emphasisSource: null });
  return p;
}

export function removeAngle(plan: Plan, angleId: string): Plan {
  if (plan.angles.length <= 1) return plan;
  return { ...plan, angles: plan.angles.filter((a) => a.id !== angleId) };
}

/** その切り口の CoachIntent（3つの入り口で同じ形） */
export function intentOf(plan: Plan, a: Angle): CoachIntent {
  const cls = plan.consultation?.classification;
  const aud = cls?.audience && cls.audience !== 'UNKNOWN' ? cls.audience : null;
  return {
    entryType: plan.entry === 'CONSULTATION' ? 'ai' : plan.entry === 'CHART' ? 'chart' : 'purpose',
    purpose: a.purpose,
    emphasis: a.emphasis,
    audience: aud,
    preferredChart: plan.entry === 'CHART' && plan.chart && registry.charts[plan.chart].purpose === a.purpose && a === plan.angles[0] ? plan.chart : null,
    confidence: a.emphasisSource === 'inferred' ? plan.consultation?.inferredConfidence ?? 1 : a.emphasis ? 1 : 0,
    ...(cls ? { classification: cls } : {}),
    conditions: conditionsOf(plan, a),
    alsoNeeds: alsoNeeds(plan.consultation?.text ?? ''),
  };
}

function alsoNeeds(text: string): NonNullable<CoachIntent['alsoNeeds']> {
  const out: NonNullable<CoachIntent['alsoNeeds']> = [];
  if (MIX_WORDS.test(text)) out.push('MIX_CHANGE');
  if (SPEED_WORDS.test(text)) out.push('GROWTH_SPEED');
  return out;
}

/** 重視点の選択肢（一度に4つまで） */
export const emphasisChoices = (plan: Plan, a: Angle): EmphasisId[] => {
  // チャートから入った時は、そのチャートが得意な順に並べ、向いていないものは出さない
  // 目的から入った時は、その目的の基本を先頭に（要因は始点から終点への変化が先頭）
  const ce = plan.entry === 'CHART' && plan.chart && a === plan.angles[0] ? CHART_EMPHASES[plan.chart]
    : plan.entry === 'PURPOSE' ? PURPOSE_EMPHASES[a.purpose] as { order: EmphasisId[]; hidden?: EmphasisId[] } | undefined : undefined;
  const all = emphasesFor(a.purpose);
  if (!ce) return [...all].slice(0, 4);
  return [...ce.order.filter((e) => all.includes(e)), ...all.filter((e) => !ce.order.includes(e) && !ce.hidden?.includes(e))].slice(0, 4);
};

/** 切り口の推薦（重視点が決まっていなければ null） */
export function angleRecommendation(plan: Plan, a: Angle): Recommendation | null {
  return a.emphasis ? recommend(intentOf(plan, a)) : null;
}

// ──────────── 選んだもの ────────────

export interface Chosen {
  recipe: RecipeDef;
  purpose: PurposeId;
  addComplements: ComplementId[];
  controls: Partial<Record<ControlId, unknown>>;
  emphasis: EmphasisId;
  /** 同じ問いの別の見せ方（データ入力後に実プレビューで出す。スライドには足さない） */
  alternatives: Proposal[];
}

/** スライドにする案：切り口ごとのリードだけ（別案は足さない）。重視点が決まっていない切り口は入れない */
export function chosenRecipes(plan: Plan): Chosen[] {
  const seen = new Set<RecipeId>();
  const out: Chosen[] = [];
  for (const a of plan.angles) {
    const rec = angleRecommendation(plan, a);
    if (!rec || rec.ask) continue;
    // ③ で選んだ形（無ければおすすめ）。選ばなかった形は、データを入れた後の「別の表現を試す」に回す
    const pick = selectedProposal(plan, a)!;
    if (seen.has(pick.recipe)) continue;
    seen.add(pick.recipe);
    out.push({
      recipe: registry.recipes[pick.recipe], purpose: a.purpose, addComplements: pick.complements ?? [], controls: pick.controls ?? {},
      emphasis: a.emphasis!, alternatives: [rec.lead, ...rec.alternatives].filter((x) => x.recipe !== pick.recipe),
    });
  }
  return out;
}

/** すべての切り口の重視点が決まっているか（主ボタンを押せるか） */
export const planReady = (plan: Plan) => plan.angles.length > 0 && plan.angles.every((a) => a.emphasis && !angleRecommendation(plan, a)?.ask);

/** 保存する推薦の状態（docs/consultation-flow.md 16章） */
export function recommendationState(plan: Plan): RecommendationState {
  const chosen = chosenRecipes(plan);
  return {
    entry_mode: plan.entry,
    ...(plan.creationMode ? { creation_mode: plan.creationMode } : {}),
    ...(plan.consultation ? { consultation_text: plan.consultation.text, consultation_classification: plan.consultation.classification } : {}),
    ...(plan.consultation?.historyId ? { consultation_history_id: plan.consultation.historyId } : {}),
    recommended_recipe_ids: [...new Set(chosen.flatMap((c) => [c.recipe.id, ...c.alternatives.map((x) => x.recipe)]))],
    selected_recipe_ids: chosen.map((c) => c.recipe.id),
    recommendation_version: RECIPE_DB_VERSION,
    ai_used_after_data_input: false,
  };
}

// ──────────── ブラウザへの保存 ────────────

export const PLAN_KEY = 'chart-advisor:plan';

export function readPlan(): Plan | null {
  try {
    const v = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null') as Plan | null;
    // 前の形（案を複数選ぶ版）の計画は読まない（入り口からやり直す）
    if (!v || v.version !== 2 || !Array.isArray(v.angles)) return null;
    v.angles = v.angles.filter((a) => (emphasesFor(a.purpose) as readonly string[]).length && (a.emphasis == null || (emphasesFor(a.purpose) as readonly string[]).includes(a.emphasis)));
    // 目的から入った計画は1つの目的だけ（前の複数選択の計画は、最初の目的だけを残す）
    if (v.entry === 'PURPOSE') v.angles = v.angles.slice(0, 1);
    return v;
  } catch { return null; }
}

export function writePlan(plan: Plan | null) {
  try {
    if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
  } catch { /* 保存できなくても動く */ }
}
