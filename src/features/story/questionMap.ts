import {
  EXEC_SUMMARY_ROLE, PROOF_NEEDS, STORY_ROUTES, STORY_TEMPLATES, TEXT_TEMPLATES, localize, registry, roleDefById, routeDef, routeQuestionRoleIds,
  type TextTemplateId, type Locale, type OutcomeDirectionId, type PersonalizedStoryContext, type ProofNeedId, type RecipeId, type StoryReading, type StoryRouteId,
} from '@/registry';
import { EMPHASES, recommend, type EmphasisId } from '../start/coach';
import { DISHES } from '../start/dishes';
import { unifiable, unifyingRecipes } from './scope';
import { emptySlide, newStory, type StorySlide, type StoryState } from './model';
import { outlineQuestionMap, readOutline } from './outline';
import { dataPackFromSuggestions } from './dataPack';
import { decideRoute } from './route';

/**
 * AIMED の Question Map（docs/story-spec.md 6.3・7章）。
 * Route の役割 → Question → proof_needs → 料理 → レシピ（参考）。役割をそのまま1枚にはせず、
 * 同じ役割の proof_needs は1枚にまとめられる時だけまとめ、そうでなければ分ける。
 * 必要な Yes を停止条件にして、相談文にない範囲までは広げない
 */

export type Role = 'AIMED.IMPACT' | 'AIMED.MISMATCH' | 'AIMED.EXPLANATION';

/** 既存参照との互換。正本は STORY_ROUTES.AIMED.proofNeedRoles */
export const ROLE_OF = STORY_ROUTES.AIMED.proofNeedRoles as Record<ProofNeedId, Role>;

/** proof_needs をRouteの役割に割り当てる（相談文の順を保つ） */
export function assignRouteRoles(route: StoryRouteId, needs: readonly ProofNeedId[]): Map<ProofNeedId, string> {
  const def = routeDef(route);
  const out = new Map<ProofNeedId, string>();
  for (const n of needs) if (!def.sharedProofNeedRoles[n]) out.set(n, def.proofNeedRoles[n]);
  for (const n of needs) {
    const opt = def.sharedProofNeedRoles[n];
    if (!opt) continue;
    const taken = new Set(out.values());
    out.set(n, taken.has(opt[0]) ? opt[1] : opt[0]);
  }
  return out;
}

/** 既存参照との互換。AIMEDの proof_needs を役割に割り当てる */
export function assignRoles(needs: readonly ProofNeedId[]): Map<ProofNeedId, Role> {
  return assignRouteRoles('AIMED', needs) as Map<ProofNeedId, Role>;
}

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
export interface StoryQuestionContext {
  route?: StoryRouteId;
  outcomeDirection?: OutcomeDirectionId;
}

const diagnosisContributionDish = (needs: readonly ProofNeedId[], context?: StoryQuestionContext): EmphasisId | null => {
  if (context?.route !== 'DIAGNOSIS' || !needs.includes('CONTRIBUTION')) return null;
  if (context.outcomeDirection === 'POSITIVE') return 'increase';
  if (context.outcomeDirection === 'NEGATIVE') return 'decrease';
  return 'posneg';
};

export function referenceRecipesFor(needs: readonly ProofNeedId[], context?: StoryQuestionContext): RecipeId[] {
  const dish = diagnosisContributionDish(needs, context) ?? dishFor(needs);
  return [...new Set([...unifyingRecipes(needs), ...recipesFor(dish)])].slice(0, 3);
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

const contributionQuestion = (locale: Locale, outcomeDirection?: OutcomeDirectionId): string => {
  if (outcomeDirection === 'POSITIVE') return locale === 'ja' ? 'どの項目が全体の増加に寄与したか' : 'Which parts contributed to the increase?';
  if (outcomeDirection === 'NEGATIVE') return locale === 'ja' ? 'どの項目が全体の減少に寄与したか' : 'Which parts contributed to the decrease?';
  return locale === 'ja' ? 'どの項目が全体の増減に寄与したか' : 'Which parts contributed to the change?';
};

export const questionOf = (needs: ProofNeedId[], locale: Locale, context?: StoryQuestionContext) =>
  needs.map((n) => context?.route === 'DIAGNOSIS' && n === 'CONTRIBUTION'
    ? contributionQuestion(locale, context.outcomeDirection)
    : localize(PROOF_NEEDS[n].question, locale)).join(locale === 'ja' ? '／' : ' / ');

const CONFIDENCE_ORDER = ['unknown', 'proposed', 'confirmed'] as const;

/**
 * 問いに具体化を付ける。AI は証明要求1つごとに返すので、問いの proof_needs（1つ以上）に当たる候補をまとめる。
 * 説明は先頭の証明要求のもの、必要なデータは合わせて重複を除き5件まで、確認は最初の1つ、確かさは一番低いもの。
 * 当たる候補が1つも無ければ付けない（従来のカード）。並び順や実行時の id には依存しない
 */
export function personalizationFor(reading: StoryReading, target: readonly ProofNeedId[] | 'DECISION'): PersonalizedStoryContext | undefined {
  const keys = target === 'DECISION' ? ['DECISION'] : target;
  const found = keys.flatMap((k) => reading.personalizations?.find((x) => x.target === k) ?? []);
  const first = found[0];
  if (!first) return undefined;
  const hints = [...new Set(found.flatMap((p) => p.requiredDataHints))].slice(0, 5);
  const terms = [...new Set(found.flatMap((p) => p.sourceTerms ?? []))].slice(0, 5);
  const confidence = found.map((p) => p.confidence).sort((a, b) => CONFIDENCE_ORDER.indexOf(a) - CONFIDENCE_ORDER.indexOf(b))[0]!;
  const unresolvedQuestion = found.find((p) => p.unresolvedQuestion)?.unresolvedQuestion;
  return {
    explanation: first.explanation,
    confidence,
    requiredDataHints: hints,
    ...(unresolvedQuestion ? { unresolvedQuestion } : {}),
    ...(terms.length ? { sourceTerms: terms } : {}),
  };
}

/** Route定義から作る Question Map。結論役割はMapに置くが、独立スライドは強制しない */
export function routeQuestionMap(reading: StoryReading, locale: Locale, route: StoryRouteId): StorySlide[] {
  const routeDefinition = routeDef(route);
  const context = { route, outcomeDirection: reading.outcomeDirection } satisfies StoryQuestionContext;
  const needs = [...new Set(reading.proofNeeds)];
  const roles = assignRouteRoles(route, needs);
  const byRole = (role: string) => needs.filter((n) => roles.get(n) === role);
  const stopRoles = new Set(reading.desiredYes ? routeDefinition.stopRoles[reading.desiredYes] ?? [] : routeDefinition.stopRoles.RECOGNITION ?? []);
  const slides: StorySlide[] = [];
  for (const roleDefinition of routeDefinition.roles.filter((role) => !role.settingOnly)) {
    const role = roleDefinition.id;
    const mine = byRole(role);
    const defaultNeed = routeDefinition.defaultProofNeeds[role];
    if (routeDefinition.strictStop && !stopRoles.has(role)) continue;
    if (!mine.length && !defaultNeed && !stopRoles.has(role)) continue;
    const list = mine.length ? groups(mine) : defaultNeed ? [[defaultNeed]] : [[]];
    for (const g of list) {
      slides.push(emptySlide({
        routeRole: role,
        questionPriority: roleDefinition.priority,
        presentationMode: roleDefinition.presentationMode ?? 'GRAPH',
        question: g.length ? questionOf(g, locale, context) : localize(roleDefinition.question, locale),
        proofNeeds: g,
        referenceRecipes: referenceRecipesFor(g, context),
        personalization: roleDefinition.noForcedSlide ? personalizationFor(reading, 'DECISION') : g.length ? personalizationFor(reading, g) : undefined,
      }));
    }
  }
  // 次の Question は、並びの次のスライドの Question
  return slides.map((s, i) => ({ ...s, nextQuestion: slides[i + 1]?.question ?? '' }));
}

/** 既存参照との互換。R1では結果を1文字も変えない */
export function aimedQuestionMap(reading: StoryReading, locale: Locale): StorySlide[] {
  return routeQuestionMap(reading, locale, 'AIMED');
}

/** Question を選び直す時の候補（AIMED の役割ごと）。suggested＝相談から読み取ったもの。AI は使わない（5.9） */
export function candidateNeeds(reading: StoryReading): { need: ProofNeedId; role: Role; suggested: boolean }[] {
  const order = routeQuestionRoleIds('AIMED') as Role[];
  const picked = assignRoles(reading.proofNeeds);
  return (Object.keys(ROLE_OF) as ProofNeedId[])
    .map((need) => ({ need, role: picked.get(need) ?? ROLE_OF[need], suggested: reading.proofNeeds.includes(need) }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

/** 「この Story から始める」：相談と読み取りから Story を作る（データ・Message は空。ユーザーが入れる） */
export function storyFromReading(consultation: string, reading: StoryReading, locale: Locale, chosenNeeds?: readonly ProofNeedId[]): StoryState {
  // 選び直した Question があれば、その proof_needs で組む（読み取りのほかの項目はそのまま）
  const r = chosenNeeds ? { ...reading, proofNeeds: [...chosenNeeds] } : reading;
  const route = decideRoute(r).route;
  const story = newStory(locale, {
    consultation,
    scope: 'STORY_FLOW',
    decisionQuestion: reading.decisionQuestion ?? '',
    ...(reading.decisionQuestion ? { decisionQuestionMeta: { author: 'ai' } as const } : {}),
    desiredYes: reading.desiredYes,
    primaryBarrier: reading.primaryBarrier ?? '',
    primaryRoute: route,
    outcomeDirection: reading.outcomeDirection,
    routeConfidence: reading.confidence,
    // 相談文にスライドの並び（見せ方の名前）が書いてあれば、その順で組む（AIMED の地図より、指定を優先）
    ...outlineStory(consultation, locale, route, () => routeQuestionMap(r, locale, route)),
  });
  // AI がデータの依頼を提案していれば持たせる（無い・使えない時は付けず、画面が規則の提案を出す）
  const pack = dataPackFromSuggestions(story, reading.dataPack);
  return pack ? { ...story, dataPackPlan: pack } : story;
}

/** 相談文の並びで組んだ問い（並びの指定が無ければ AIMED の地図）。Executive Summary はいつも入れる */
function outlineStory(consultation: string, locale: Locale, route: StoryRouteId, questionMap: () => StorySlide[]): Pick<StoryState, 'slides'> & Partial<Pick<StoryState, 'executiveSummary'>> {
  const outline = readOutline(consultation);
  const slides = outline ? outlineQuestionMap(consultation, outline, locale, route) : questionMap();
  // Executive Summary は聞かずに足す（最後に。出力の時に先頭か最後かを選ぶ）
  const withExec = slides.some((q) => q.routeRole === EXEC_SUMMARY_ROLE) ? slides : [...slides, emptySlide({
    routeRole: EXEC_SUMMARY_ROLE, section: 'MAIN', questionPriority: 'SUPPORTING', presentationMode: 'TEXT', question: locale === 'ja' ? 'Executive Summary' : 'Executive summary',
  })];
  return { slides: withExec, executiveSummary: { enabled: true, userAuthoredContent: {}, evidenceSlideRefs: [] } };
}

/** 見せ方の例（グラフ・表・言葉のどれで見せるかを添える）。グラフの例が無い Question には、言葉の例 */
export type ExampleMode = 'graph' | 'table' | 'text';
export function examplesOf(s: StorySlide, locale: Locale): { label: string; mode: ExampleMode }[] {
  // 相談文で見せ方を指定した問いは、その見せ方
  if (s.template) return [{ label: localize(STORY_TEMPLATES[s.template].label, locale), mode: STORY_TEMPLATES[s.template].kind }];
  const graphs = s.referenceRecipes.slice(0, 2).map((r) => ({ label: localize(registry.recipes[r].name, locale), mode: 'graph' as const }));
  if (graphs.length) return graphs;
  const texts: TextTemplateId[] = roleDefById(s.routeRole)?.userAuthored ? ['NEXT_ACTION', 'CONCLUSION_THREE_REASONS'] : ['ISSUE_INSIGHT_ACTION', 'NUMBER_WITH_EXPLANATION'];
  return texts.map((id) => ({ label: localize(TEXT_TEMPLATES[id], locale), mode: 'text' as const }));
}
