import {
  RECIPE_DB_VERSION, activeRecipes, rankRecipes, recipesForChart, recipesForPurpose, registry,
  type ChartTypeId, type ComplementId, type ConsultationClassification, type PurposeId, type RankedRecipe, type RecipeDef,
  type RecipeId, type RecommendationState, type ReasonCode,
} from '@/registry';
import { recipeRenderable } from '@/engine/recipes';

/**
 * 「切り口から作る」の計画（① 入り口 → ② 切り口を選ぶ）。画面の状態で、ブラウザに保存する。
 * 3つの入り口とも、選ぶ単位はレシピ。違うのは絞り込み方だけ（相談＝規則で最大3案、目的・チャート＝レシピ一覧）。
 */

export type EntryMode = RecommendationState['entry_mode'];
export type Role = 'lead' | 'sub' | 'other';

export interface PlanItem {
  recipe: RecipeId;
  role: Role;
  chosen: boolean;
  /** 「見えにくいこと」から足した補完パーツ（③でオンの状態から始める） */
  addComplements: ComplementId[];
}

export interface Angle {
  id: string;
  purpose: PurposeId;
  included: boolean;
  showOthers: boolean;
  items: PlanItem[];
}

export interface Consultation {
  text: string;
  classification: ConsultationClassification;
  summary: string;
  question: string;
  ranked: { recipe: RecipeId; score: number; reasons: ReasonCode[] }[];
}

export interface Plan {
  version: 1;
  entry: EntryMode;
  consultation?: Consultation;
  angles: Angle[];
  /** 右の欄で説明を出しているレシピ */
  focus: RecipeId | null;
  seq: number;
}

/** いまのエンジンで描けるレシピだけを出す（描けないものは提案しない） */
export const availableRecipes = (): RecipeDef[] => activeRecipes().filter(recipeRenderable);
const available = (r: RecipeDef) => recipeRenderable(r);

/** 描けないレシピの数（画面に「準備中 N 件」と出す） */
export const pendingRecipeCount = () => activeRecipes().length - availableRecipes().length;

/** 入り口 B の目的：描けるレシピが1つでもある目的だけ選べる */
export const purposeHasRecipes = (p: PurposeId) => recipesForPurpose(p).some(available);
/** 入り口 C のチャート：そのチャートがメインの、描けるレシピがあるものだけ選べる */
export const chartHasRecipes = (c: ChartTypeId) => recipesForChart(c).some(available);

const toItems = (ids: RecipeId[], subCount: number): PlanItem[] =>
  ids.map((recipe, i) => ({ recipe, role: i === 0 ? 'lead' : i <= subCount ? 'sub' : 'other', chosen: i === 0, addComplements: [] }));

function nextId(plan: Pick<Plan, 'seq'>): string {
  plan.seq += 1;
  return `a${plan.seq}`;
}

/** 目的の切り口：その目的のレシピ。ほかに選ばれた目的が「主な目的」のレシピはそちらに回す（同じレシピを2か所に出さない） */
function purposeItems(purpose: PurposeId, others: PurposeId[]): PlanItem[] {
  const ids = recipesForPurpose(purpose)
    .filter(available)
    .filter((r) => r.goals[0] === purpose || !others.includes(r.goals[0]!))
    .map((r) => r.id);
  return toItems(ids, 2);
}

// ──────────── 入り口ごとに計画を作る ────────────

export function planFromConsultation(c: Omit<Consultation, 'ranked'>, ranked: RankedRecipe[] = rankRecipes(c.classification, availableRecipes())): Plan {
  const plan: Plan = { version: 1, entry: 'CONSULTATION', angles: [], focus: null, seq: 0 };
  plan.consultation = { ...c, ranked: ranked.map((x) => ({ recipe: x.recipe.id, score: x.score, reasons: x.reasons })) };
  plan.angles = ranked.map((x, i) => ({
    id: nextId(plan), purpose: x.recipe.goals[0]!, included: true, showOthers: false,
    items: [{ recipe: x.recipe.id, role: i === 0 ? 'lead' : 'sub', chosen: i === 0, addComplements: [] }],
  }));
  plan.focus = ranked[0]?.recipe.id ?? null;
  return plan;
}

export function planFromPurposes(purposes: PurposeId[]): Plan {
  const plan: Plan = { version: 1, entry: 'PURPOSE', angles: [], focus: null, seq: 0 };
  plan.angles = purposes.map((p) => ({ id: nextId(plan), purpose: p, included: true, showOthers: false, items: purposeItems(p, purposes.filter((x) => x !== p)) }))
    .filter((a) => a.items.length > 0);
  plan.focus = plan.angles[0]?.items[0]?.recipe ?? null;
  return plan;
}

export function planFromChart(chart: ChartTypeId): Plan {
  const plan: Plan = { version: 1, entry: 'CHART', angles: [], focus: null, seq: 0 };
  const purpose = registry.charts[chart].purpose;
  const mine = recipesForChart(chart).filter(available).map((r) => r.id);
  const rest = recipesForPurpose(purpose).filter((r) => available(r) && r.goals[0] === purpose).map((r) => r.id).filter((id) => !mine.includes(id));
  plan.angles = [{ id: nextId(plan), purpose, included: true, showOthers: false, items: toItems([...mine, ...rest], mine.length - 1) }];
  plan.focus = mine[0] ?? null;
  return plan;
}

// ──────────── 画面の操作（すべて新しい計画を返す） ────────────

const clone = (p: Plan): Plan => structuredClone(p);

export function toggleChosen(plan: Plan, angleId: string, recipe: RecipeId): Plan {
  const p = clone(plan);
  const it = p.angles.find((a) => a.id === angleId)?.items.find((i) => i.recipe === recipe);
  if (it) it.chosen = !it.chosen;
  return p;
}

export function toggleAngle(plan: Plan, angleId: string, key: 'included' | 'showOthers'): Plan {
  const p = clone(plan);
  const a = p.angles.find((x) => x.id === angleId);
  if (a) a[key] = !a[key];
  return p;
}

/** 切り口（目的）を足す。すでにある目的でも、もう1つ足せる */
export function addPurposeAngle(plan: Plan, purpose: PurposeId): Plan {
  const p = clone(plan);
  const items = purposeItems(purpose, []);
  if (!items.length) return plan;
  p.angles.push({ id: nextId(p), purpose, included: true, showOthers: false, items });
  p.focus = items[0]!.recipe;
  return p;
}

/**
 * 別のレシピを選ぶ（「別のレシピなら見せられる」「同じデータで、ほかの目的なら」から）。
 * すでにどこかの切り口にあればそこで選択、無ければ主な目的の切り口に足す（無ければ新しい切り口）。
 */
export function chooseRecipe(plan: Plan, recipe: RecipeId): Plan {
  const p = clone(plan);
  const hit = p.angles.find((a) => a.items.some((i) => i.recipe === recipe));
  if (hit) {
    const it = hit.items.find((i) => i.recipe === recipe)!;
    it.chosen = true;
    hit.included = true;
    if (it.role === 'other') hit.showOthers = true;
  } else {
    const purpose = registry.recipes[recipe].goals[0]!;
    const angle = p.angles.find((a) => a.purpose === purpose);
    if (angle) {
      angle.items.push({ recipe, role: 'other', chosen: true, addComplements: [] });
      angle.included = true;
      angle.showOthers = true;
    } else {
      const rest = purposeItems(purpose, []).filter((i) => i.recipe !== recipe).map((i) => ({ ...i, role: 'other' as Role, chosen: false }));
      p.angles.push({ id: nextId(p), purpose, included: true, showOthers: false, items: [{ recipe, role: 'lead', chosen: true, addComplements: [] }, ...rest] });
    }
  }
  p.focus = recipe;
  return p;
}

/** 「見えにくいこと」に補完パーツを足す（そのレシピを選んだ状態にする） */
export function addComplement(plan: Plan, recipe: RecipeId, complement: ComplementId): Plan {
  const p = clone(plan);
  for (const a of p.angles) {
    for (const it of a.items) {
      if (it.recipe !== recipe) continue;
      if (!it.addComplements.includes(complement)) it.addComplements.push(complement);
      it.chosen = true;
      a.included = true;
    }
  }
  return p;
}

export function setFocus(plan: Plan, recipe: RecipeId): Plan {
  return { ...plan, focus: recipe };
}

export function chooseAll(plan: Plan): Plan {
  const p = clone(plan);
  p.angles.forEach((a) => { a.included = true; a.items.forEach((i) => { if (i.role !== 'other') i.chosen = true; }); });
  return p;
}

// ──────────── 選んだもの ────────────

export interface Chosen {
  recipe: RecipeDef;
  purpose: PurposeId;
  addComplements: ComplementId[];
}

/** 選んだレシピ（切り口の順・同じレシピは1回だけ）。これが③④で作るスライドの順 */
export function chosenRecipes(plan: Plan): Chosen[] {
  const seen = new Set<RecipeId>();
  const out: Chosen[] = [];
  for (const a of plan.angles) {
    if (!a.included) continue;
    for (const it of a.items) {
      if (!it.chosen || seen.has(it.recipe)) continue;
      seen.add(it.recipe);
      out.push({ recipe: registry.recipes[it.recipe], purpose: a.purpose, addComplements: it.addComplements });
    }
  }
  return out;
}

/** 同じデータで、ほかの目的ならこんな切り口も（チャートから入った時）。まだ無い目的の先頭レシピ */
export function otherPurposeSuggestions(plan: Plan): RecipeId[] {
  const have = new Set(plan.angles.map((a) => a.purpose));
  const inPlan = new Set(plan.angles.flatMap((a) => a.items.map((i) => i.recipe)));
  return (['trend', 'comparison', 'composition'] as const)
    .filter((p) => !have.has(p))
    .map((p) => recipesForPurpose(p).filter(available).find((r) => r.goals[0] === p && !inPlan.has(r.id)))
    .filter((r): r is RecipeDef => !!r)
    .map((r) => r.id);
}

/** 保存する推薦の状態（docs/consultation-flow.md 16章） */
export function recommendationState(plan: Plan): RecommendationState {
  return {
    entry_mode: plan.entry,
    ...(plan.consultation ? { consultation_text: plan.consultation.text, consultation_classification: plan.consultation.classification } : {}),
    recommended_recipe_ids: plan.consultation ? plan.consultation.ranked.map((r) => r.recipe) : plan.angles.flatMap((a) => a.items.filter((i) => i.role !== 'other').map((i) => i.recipe)),
    selected_recipe_ids: chosenRecipes(plan).map((c) => c.recipe.id),
    recommendation_version: RECIPE_DB_VERSION,
    ai_used_after_data_input: false,
  };
}

// ──────────── ブラウザへの保存 ────────────

export const PLAN_KEY = 'chart-advisor:plan';

export function readPlan(): Plan | null {
  try {
    const v = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null') as Plan | null;
    if (!v || v.version !== 1 || !Array.isArray(v.angles)) return null;
    // レシピが無くなっていたら外す（レシピの版が変わった時）
    v.angles = v.angles
      .map((a) => ({ ...a, items: a.items.filter((i) => i.recipe in registry.recipes) }))
      .filter((a) => a.items.length);
    return v;
  } catch { return null; }
}

export function writePlan(plan: Plan | null) {
  try {
    if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
  } catch { /* 保存できなくても動く */ }
}
