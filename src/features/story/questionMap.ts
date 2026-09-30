import {
  AIMED_ROLES, PROOF_NEEDS, TEXT_TEMPLATES, localize, registry, type TextTemplateId, type DesiredYesId, type Locale, type ProofNeedId, type RecipeId, type StoryReading,
} from '@/registry';
import { EMPHASES, recommend, type EmphasisId } from '../start/coach';
import { DISHES } from '../start/dishes';
import { unifiable, unifyingRecipes } from './scope';
import { emptySlide, newStory, type StorySlide, type StoryState } from './model';

/**
 * AIMED の Question Map（docs/story-spec.md 6.3・7章）。
 * Route の役割 → Question → proof_needs → 料理 → レシピ（参考）。役割をそのまま1枚にはせず、
 * 同じ役割の proof_needs は1枚にまとめられる時だけまとめ、そうでなければ分ける。
 * 必要な Yes を停止条件にして、相談文にない範囲までは広げない
 */

export type Role = 'AIMED.IMPACT' | 'AIMED.MISMATCH' | 'AIMED.EXPLANATION';

/** proof_needs を置く役割。AIMED の表（6.3）にある語はその役割、無い語は近い役割へ（語彙は増やさない） */
export const ROLE_OF: Record<ProofNeedId, Role> = {
  OVERALL_CHANGE: 'AIMED.IMPACT', CURRENT_MIX: 'AIMED.IMPACT', SIZE_CONTEXT: 'AIMED.IMPACT', GROWTH_SPEED: 'AIMED.IMPACT',
  SEGMENT_DIFFERENCE: 'AIMED.MISMATCH', MIX_CHANGE: 'AIMED.MISMATCH', TARGET_GAP: 'AIMED.MISMATCH', SECOND_METRIC: 'AIMED.MISMATCH',
  RANKING: 'AIMED.MISMATCH', ITEM_SHARE: 'AIMED.MISMATCH',
  CONTRIBUTION: 'AIMED.EXPLANATION', BRIDGE: 'AIMED.EXPLANATION', RELATIONSHIP: 'AIMED.EXPLANATION', POSITIONING: 'AIMED.EXPLANATION',
};

/** 2つの役割に載る語（6.3 の表）：前の役割がまだ空ならそこ、埋まっていれば後の役割（例：市場の差があれば、別の指標は説明の側へ） */
const SHARED: Partial<Record<ProofNeedId, readonly [Role, Role]>> = { SECOND_METRIC: ['AIMED.MISMATCH', 'AIMED.EXPLANATION'] };

/** proof_needs を役割に割り当てる（相談文の順を保つ） */
export function assignRoles(needs: readonly ProofNeedId[]): Map<ProofNeedId, Role> {
  const out = new Map<ProofNeedId, Role>();
  for (const n of needs) if (!SHARED[n]) out.set(n, ROLE_OF[n]);
  for (const n of needs) {
    const opt = SHARED[n];
    if (!opt) continue;
    const taken = new Set(out.values());
    out.set(n, taken.has(opt[0]) ? opt[1] : opt[0]);
  }
  return out;
}

/** 役割に proof_needs が無い時の既定（Impact と Mismatch は AIMED で欠かせない） */
const DEFAULT_NEED: Partial<Record<Role, ProofNeedId>> = { 'AIMED.IMPACT': 'OVERALL_CHANGE', 'AIMED.MISMATCH': 'SEGMENT_DIFFERENCE' };

/** 説明（Explanation）まで進む Yes */
const EXPLAIN_YES: readonly DesiredYesId[] = ['INTERPRETATION', 'SELECTION', 'FEASIBILITY', 'COMMITMENT'];

/** proof_needs → 料理（その語を最初に持つ料理。目的の並び順で先のもの） */
export function dishFor(needs: readonly ProofNeedId[]): EmphasisId | null {
  const order = Object.values(EMPHASES).flat() as EmphasisId[];
  const first = needs[0];
  if (!first) return null;
  // 全部を持つ料理があればそれ、無ければ最初の語を持つ料理
  return order.find((e) => needs.every((n) => DISHES[e].proofNeeds.includes(n)))
    ?? order.find((e) => DISHES[e].proofNeeds[0] === first)
    ?? order.find((e) => DISHES[e].proofNeeds.includes(first)) ?? null;
}

/** proof_needs → 参考のレシピ（2つを1枚にまとめた時は、まとめるレシピを先に。あとは料理のおすすめ） */
export function referenceRecipesFor(needs: readonly ProofNeedId[]): RecipeId[] {
  return [...new Set([...unifyingRecipes(needs), ...recipesFor(dishFor(needs))])].slice(0, 3);
}

/** 料理 → 参考のレシピ（おすすめ＋別案。目的から入った時と同じ規則） */
export function recipesFor(dish: EmphasisId | null): RecipeId[] {
  if (!dish) return [];
  const purpose = (Object.keys(EMPHASES) as (keyof typeof EMPHASES)[]).find((p) => (EMPHASES[p] as readonly string[]).includes(dish));
  if (!purpose) return [];
  const r = recommend({ entryType: 'purpose', purpose, emphasis: dish, audience: null, preferredChart: null, confidence: 1 });
  return r ? [...new Set([r.lead.recipe, ...r.alternatives.map((a) => a.recipe)])].slice(0, 3) : [];
}

/** 同じ役割の proof_needs を、1枚にまとめられる組ごとに分ける（先頭から順に） */
function groups(needs: ProofNeedId[]): ProofNeedId[][] {
  const out: ProofNeedId[][] = [];
  for (const n of needs) {
    const g = out.find((x) => unifiable([...x, n]));
    if (g) g.push(n); else out.push([n]);
  }
  return out;
}

export const questionOf = (needs: ProofNeedId[], locale: Locale) =>
  needs.map((n) => localize(PROOF_NEEDS[n].question, locale)).join(locale === 'ja' ? '／' : ' / ');

/** AIMED の Question Map（スライドの下書き）。Decision は Map に置くが、独立スライドは強制しない（言葉で書く1枚として置く） */
export function aimedQuestionMap(reading: StoryReading, locale: Locale): StorySlide[] {
  const needs = [...new Set(reading.proofNeeds)];
  const roles = assignRoles(needs);
  const byRole = (role: Role) => needs.filter((n) => roles.get(n) === role);
  const explain = byRole('AIMED.EXPLANATION').length > 0 || (reading.desiredYes != null && EXPLAIN_YES.includes(reading.desiredYes));
  const slides: StorySlide[] = [];
  for (const role of ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION'] as const) {
    if (role === 'AIMED.EXPLANATION' && !explain) continue;
    const def = AIMED_ROLES.find((r) => r.id === role)!;
    const mine = byRole(role);
    const list = mine.length ? groups(mine) : DEFAULT_NEED[role] ? [[DEFAULT_NEED[role]!]] : [[]];
    for (const g of list) {
      slides.push(emptySlide({
        routeRole: role,
        questionPriority: def.priority,
        presentationMode: 'GRAPH',
        question: g.length ? questionOf(g, locale) : localize(def.question, locale),
        proofNeeds: g,
        referenceRecipes: referenceRecipesFor(g),
      }));
    }
  }
  const decision = AIMED_ROLES.find((r) => r.id === 'AIMED.DECISION')!;
  slides.push(emptySlide({ routeRole: decision.id, questionPriority: decision.priority, presentationMode: 'TEXT', question: localize(decision.question, locale) }));
  // 次の Question は、並びの次のスライドの Question
  return slides.map((s, i) => ({ ...s, nextQuestion: slides[i + 1]?.question ?? '' }));
}

/** Question を選び直す時の候補（AIMED の役割ごと）。suggested＝相談から読み取ったもの。AI は使わない（5.9） */
export function candidateNeeds(reading: StoryReading): { need: ProofNeedId; role: Role; suggested: boolean }[] {
  const order: Role[] = ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION'];
  const picked = assignRoles(reading.proofNeeds);
  return (Object.keys(ROLE_OF) as ProofNeedId[])
    .map((need) => ({ need, role: picked.get(need) ?? ROLE_OF[need], suggested: reading.proofNeeds.includes(need) }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

/** 「この Story から始める」：相談と読み取りから Story を作る（データ・Message は空。ユーザーが入れる） */
export function storyFromReading(consultation: string, reading: StoryReading, locale: Locale, chosenNeeds?: readonly ProofNeedId[]): StoryState {
  // 選び直した Question があれば、その proof_needs で組む（読み取りのほかの項目はそのまま）
  const r = chosenNeeds ? { ...reading, proofNeeds: [...chosenNeeds] } : reading;
  return newStory(locale, {
    consultation,
    scope: 'STORY_FLOW',
    decisionQuestion: reading.decisionQuestion ?? '',
    desiredYes: reading.desiredYes,
    primaryBarrier: reading.primaryBarrier ?? '',
    primaryRoute: 'AIMED',
    routeConfidence: reading.confidence,
    slides: aimedQuestionMap(r, locale),
  });
}

/** 見せ方の例（グラフ・表・言葉のどれで見せるかを添える）。グラフの例が無い Question には、言葉の例 */
export type ExampleMode = 'graph' | 'table' | 'text';
export function examplesOf(s: StorySlide, locale: Locale): { label: string; mode: ExampleMode }[] {
  const graphs = s.referenceRecipes.slice(0, 2).map((r) => ({ label: localize(registry.recipes[r].name, locale), mode: 'graph' as const }));
  if (graphs.length) return graphs;
  const texts: TextTemplateId[] = s.routeRole === 'AIMED.DECISION' ? ['NEXT_ACTION', 'CONCLUSION_THREE_REASONS'] : ['ISSUE_INSIGHT_ACTION', 'NUMBER_WITH_EXPLANATION'];
  return texts.map((id) => ({ label: localize(TEXT_TEMPLATES[id], locale), mode: 'text' as const }));
}
