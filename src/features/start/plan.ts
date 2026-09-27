import { applyClarify } from '@/lib/advisor/clarify';
import {
  RECIPE_DB_VERSION, activeRecipes, recipesForChart, recipesForPurpose, registry,
  type ChartTypeId, type ComplementId, type ConsultationClassification, type ControlId, type PurposeId, type RecipeDef,
  type MissingInfo, type RecipeId, type RecommendationState,
} from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import { AUTO_EMPHASIS, emphasesFor, inferEmphasis, recommend, type CoachIntent, type EmphasisId, type Proposal, type Recommendation } from './coach';

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
  if (emphasesFor(inf.purpose).length) plan.angles = [{ id: nextId(plan), purpose: inf.purpose, emphasis: auto, emphasisSource: auto ? 'inferred' : null }];
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

/** チャートから：チャートはリードに固定。重視点で補完パーツを変える（AI は使わない） */
export function planFromChart(chart: ChartTypeId): Plan {
  const plan: Plan = { version: 2, entry: 'CHART', chart, angles: [], seq: 0 };
  plan.angles = [{ id: nextId(plan), purpose: registry.charts[chart].purpose, emphasis: null, emphasisSource: null }];
  return plan;
}

// ──────────── 画面の操作（すべて新しい計画を返す） ────────────

/** 重視点を選ぶ・変える（推薦は規則で即時に出し直す） */
export function setEmphasis(plan: Plan, angleId: string, emphasis: EmphasisId): Plan {
  const p = clone(plan);
  const a = p.angles.find((x) => x.id === angleId);
  if (a) { a.emphasis = emphasis; a.emphasisSource = 'user'; }
  return p;
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
  };
}

/** 重視点の選択肢（一度に4つまで） */
export const emphasisChoices = (_plan: Plan, a: Angle): EmphasisId[] => [...emphasesFor(a.purpose)].slice(0, 4);

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
    if (!rec || seen.has(rec.lead.recipe)) continue;
    seen.add(rec.lead.recipe);
    out.push({
      recipe: registry.recipes[rec.lead.recipe], purpose: a.purpose, addComplements: rec.lead.complements ?? [], controls: rec.lead.controls ?? {},
      emphasis: a.emphasis!, alternatives: rec.alternatives,
    });
  }
  return out;
}

/** すべての切り口の重視点が決まっているか（主ボタンを押せるか） */
export const planReady = (plan: Plan) => plan.angles.length > 0 && plan.angles.every((a) => a.emphasis);

/** 保存する推薦の状態（docs/consultation-flow.md 16章） */
export function recommendationState(plan: Plan): RecommendationState {
  const chosen = chosenRecipes(plan);
  return {
    entry_mode: plan.entry,
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
    return v;
  } catch { return null; }
}

export function writePlan(plan: Plan | null) {
  try {
    if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
  } catch { /* 保存できなくても動く */ }
}
