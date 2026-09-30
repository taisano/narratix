import { AIMED_ROLES, STORY_SIZE, type Locale, type ProofNeedId, type StorySectionId } from '@/registry';
import { assignRoles, questionOf, referenceRecipesFor, ROLE_OF, type Role } from './questionMap';
import { unifiable } from './scope';
import { emptySlide, mainCount, type StorySlide, type StoryState } from './model';

/**
 * Question Map の編集（docs/story-spec.md 3.3・7.3・7.4・5.9）。すべて規則で、AI は使わない。
 * データや Message を黙って消さない：統合・分割は、まだグラフもMessageも無い Question だけ
 */

/** まだ何も入っていない（グラフ・Message・言葉の中身・データの参照が無い） */
export const isBlank = (s: StorySlide): boolean =>
  !s.visual && !s.userAuthoredMessage.trim() && !s.textContent && s.datasetRefs.length === 0;

/** 次の Question をつなぎ直す：Main Story の並び（スライドにしない確認事項は飛ばす）で次の Question。それ以外は空 */
export function relink(slides: StorySlide[]): StorySlide[] {
  const main = slides.filter((s) => s.section === 'MAIN' && s.questionPriority !== 'COACHING_ONLY');
  return slides.map((s) => {
    const i = main.findIndex((m) => m.id === s.id);
    return { ...s, nextQuestion: i >= 0 ? main[i + 1]?.question ?? '' : '' };
  });
}

const withSlides = (story: StoryState, slides: StorySlide[]): StoryState => {
  const next = relink(slides);
  return { ...story, slides: next, current: Math.max(0, Math.min(next.length - 1, story.current)) };
};
const at = (story: StoryState, id: string) => story.slides.findIndex((s) => s.id === id);

/** 並びを1つ上・下へ */
export function moveQuestion(story: StoryState, id: string, dir: -1 | 1): StoryState {
  const i = at(story, id), j = i + dir;
  if (i < 0 || j < 0 || j >= story.slides.length) return story;
  const slides = [...story.slides];
  [slides[i], slides[j]] = [slides[j]!, slides[i]!];
  return withSlides(story, slides);
}

/** Main Story／Supporting Evidence／Appendix へ移す */
export function setSection(story: StoryState, id: string, section: StorySectionId): StoryState {
  return withSlides(story, story.slides.map((s) => (s.id === id ? { ...s, section } : s)));
}

/** 役割の本来の優先度（自分で足した Question は REQUIRED） */
const priorityOf = (s: StorySlide) => AIMED_ROLES.find((r) => r.id === s.routeRole)?.priority ?? 'REQUIRED';

/** スライドにしない（確認事項として残す）／スライドに戻す */
export function setCoachingOnly(story: StoryState, id: string, on: boolean): StoryState {
  return withSlides(story, story.slides.map((s) => (s.id === id ? { ...s, questionPriority: on ? 'COACHING_ONLY' : priorityOf(s) } : s)));
}

export function renameQuestion(story: StoryState, id: string, question: string): StoryState {
  return withSlides(story, story.slides.map((s) => (s.id === id ? { ...s, question: question.slice(0, 500) } : s)));
}

/** Question を外す（画面では、中身がある時は確認してから） */
export function removeQuestion(story: StoryState, id: string): StoryState {
  return withSlides(story, story.slides.filter((s) => s.id !== id));
}

/**
 * Question を足す（proof_needs から）。同じ役割の最後の Main の Question の後ろ、無ければ役割の順の位置
 */
export function addQuestion(story: StoryState, needs: ProofNeedId[], locale: Locale): StoryState {
  if (!needs.length) return story;
  const role = assignRoles(needs).get(needs[0]!) ?? ROLE_OF[needs[0]!];
  const def = AIMED_ROLES.find((r) => r.id === role)!;
  const slide = emptySlide({
    routeRole: role, questionPriority: def.priority, presentationMode: 'GRAPH',
    question: questionOf(needs, locale), proofNeeds: needs, referenceRecipes: referenceRecipesFor(needs),
  });
  const order: string[] = ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION'];
  const rank = (s: StorySlide) => (s.routeRole ? order.indexOf(s.routeRole) : -1);
  const slides = [...story.slides];
  // 同じ役割か、それより前の役割の Main の Question のうち最後のものの後ろ
  let pos = -1;
  slides.forEach((s, i) => { if (s.section === 'MAIN' && rank(s) >= 0 && rank(s) <= order.indexOf(role)) pos = i; });
  slides.splice(pos + 1, 0, slide);
  return withSlides(story, slides);
}

/** 次の Question と1枚にまとめられるか（同じ役割・同じ置き場所・1枚にまとめられる組・どちらもまだ空） */
export function canMergeWithNext(story: StoryState, id: string): boolean {
  const i = at(story, id);
  const a = story.slides[i], b = story.slides[i + 1];
  if (!a || !b || a.routeRole !== b.routeRole || a.section !== b.section || !isBlank(a) || !isBlank(b)) return false;
  if (!a.proofNeeds.length || !b.proofNeeds.length) return false;
  return unifiable([...a.proofNeeds, ...b.proofNeeds]);
}

export function mergeWithNext(story: StoryState, id: string, locale: Locale): StoryState {
  if (!canMergeWithNext(story, id)) return story;
  const i = at(story, id);
  const a = story.slides[i]!, b = story.slides[i + 1]!;
  const needs = [...new Set([...a.proofNeeds, ...b.proofNeeds])];
  const merged: StorySlide = { ...a, proofNeeds: needs, question: questionOf(needs, locale), referenceRecipes: referenceRecipesFor(needs) };
  const slides = [...story.slides];
  slides.splice(i, 2, merged);
  return withSlides(story, slides);
}

/** まとめた Question を proof_needs ごとに分けられるか（まだ空の時だけ） */
export const canSplit = (s: StorySlide): boolean => s.proofNeeds.length > 1 && isBlank(s);

export function splitQuestion(story: StoryState, id: string, locale: Locale): StoryState {
  const i = at(story, id);
  const s = story.slides[i];
  if (!s || !canSplit(s)) return story;
  const parts = s.proofNeeds.map((n, k) => (k === 0
    ? { ...s, proofNeeds: [n], question: questionOf([n], locale), referenceRecipes: referenceRecipesFor([n]) }
    : emptySlide({ routeRole: s.routeRole, section: s.section, questionPriority: s.questionPriority, presentationMode: s.presentationMode, proofNeeds: [n], question: questionOf([n], locale), referenceRecipes: referenceRecipesFor([n]) })));
  const slides = [...story.slides];
  slides.splice(i, 1, ...parts);
  return withSlides(story, slides);
}

/** まだ Question に入っていない proof_needs（足せる候補。役割の順） */
export function unusedNeeds(story: StoryState): { need: ProofNeedId; role: Role }[] {
  const used = new Set(story.slides.flatMap((s) => s.proofNeeds));
  const order: Role[] = ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION'];
  return (Object.keys(ROLE_OF) as ProofNeedId[]).filter((n) => !used.has(n)).map((need) => ({ need, role: ROLE_OF[need] }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

/**
 * 枚数の目安（3.3）：少ない（1〜2枚。無理に増やさない）／理想（3〜8）／多め（9〜10）／超えた（11〜。統合・Appendix・分割を提案）
 */
export type SizeLevel = 'few' | 'ideal' | 'many' | 'over';
export function sizeAdvice(story: StoryState): { main: number; level: SizeLevel } {
  const main = mainCount(story);
  const level: SizeLevel = main < STORY_SIZE.idealMin ? 'few' : main <= STORY_SIZE.idealMax ? 'ideal' : main <= STORY_SIZE.softMax ? 'many' : 'over';
  return { main, level };
}

/** proof_needs が入っている Question（無ければ空） */
const holders = (story: StoryState, need: ProofNeedId) => story.slides.filter((s) => s.proofNeeds.includes(need));

/** その問いを外せるか（入っている Question がまだ空の時だけ。中身は黙って消さない） */
export const canRemoveNeed = (story: StoryState, need: ProofNeedId): boolean => holders(story, need).every(isBlank);

/**
 * 問いを外す：その問いだけの Question は外し、ほかの問いとまとめた Question からは、その問いだけを抜く
 */
export function removeNeed(story: StoryState, need: ProofNeedId, locale: Locale): StoryState {
  if (!canRemoveNeed(story, need)) return story;
  const slides = story.slides.flatMap((s) => {
    if (!s.proofNeeds.includes(need)) return [s];
    const rest = s.proofNeeds.filter((n) => n !== need);
    return rest.length ? [{ ...s, proofNeeds: rest, question: questionOf(rest, locale), referenceRecipes: referenceRecipesFor(rest) }] : [];
  });
  return withSlides(story, slides);
}

/** 問いの選び直し：入っていれば外し、無ければ足す */
export const toggleNeed = (story: StoryState, need: ProofNeedId, locale: Locale): StoryState =>
  story.slides.some((s) => s.proofNeeds.includes(need)) ? removeNeed(story, need, locale) : addQuestion(story, [need], locale);
