import type { CreationMode, Locale, StoryReading } from '@/registry';
import type { Plan } from '../start/plan';
import { decideScope, unifiable } from './scope';
import { storyFromReading } from './questionMap';
import { readOutline } from './outline';
import { confidentPick, oneSlideCandidates, planFromQuestion } from './oneSlide';

/**
 * 相談の入口で選んだ「作りたいもの」を、② の計画に当てはめる（docs/decisions.md「相談入口の3つの入口」）。
 * 規則だけ（AI は相談文の読み取りに1回使うだけで、形式は AI に渡さない・上書きさせない）。
 * - ONE_SLIDE：1枚。問いが複数あれば黙って1つに縮めない（はっきり決まれば「〜に絞りました」、決まらなければ最大3つから選ぶ）
 * - STORY：Story の問いの流れ。相談文に「1枚で」とあっても Story にする。AI の読み取りが無ければ、見せ方の並びが書いてある時だけ規則で組む
 * - COACH_RECOMMEND：これまでどおり Coach が1枚か Story かをすすめる（もう一方は閉じた別案）
 */

/** AI の読み取りが無い時、相談文に見せ方の並びが書いてあれば、その並びで Story を組むための最小の読み取り（推測で埋めない） */
export function outlineReading(text: string): StoryReading | null {
  if (!readOutline(text)) return null;
  return {
    decisionQuestion: null, desiredYes: null, primaryBarrier: null, proofNeeds: [],
    scopeCandidate: 'STORY_FLOW', routeSignals: [], outcomeDirection: 'UNKNOWN', explicitSize: 'MULTIPLE', confidence: 0,
  };
}

/** Coach がすすめる進め方（数える用。確認の一問を出す時は決まっていない） */
export function coachScopeOf(plan: Plan, storyAllowed: boolean): Plan['coachScope'] {
  const s = decideScope(plan.consultation?.story, storyAllowed, plan.scopeAnswer).scope;
  return s === 'STORY_FLOW' ? 'story' : s === 'CLARIFY' ? undefined : 'one';
}

export function applyCreationMode(plan: Plan, mode: CreationMode, locale: Locale, storyAllowed: boolean): Plan {
  const c = plan.consultation;
  const base: Plan = { ...plan, creationMode: mode, scopeChoice: undefined, oneKept: undefined, oneFrom: undefined, onePick: undefined, storyDraft: null, modeNote: undefined, coachScope: undefined };
  if (!c) return base;
  if (mode === 'COACH_RECOMMEND' || (mode === 'STORY' && !storyAllowed)) {
    return { ...base, ...(mode === 'COACH_RECOMMEND' ? { coachScope: coachScopeOf(base, storyAllowed) } : {}) };
  }
  if (mode === 'STORY') {
    if (c.story) return { ...base, scopeChoice: 'story' };
    const r = outlineReading(c.text);
    if (r) return { ...base, consultation: { ...c, story: r }, scopeChoice: 'story' };
    // Story を組むには問いの読み取りが要る。作れない時は、黙らずに理由を出して1枚で提案する
    return { ...base, scopeChoice: 'one', oneKept: true, modeNote: 'storyNeedsAi' };
  }
  // ONE_SLIDE
  const one: Plan = { ...base, scopeChoice: 'one' };
  // 示すことが1つ（または1枚にまとめられる組）なら、そのまま1枚の提案
  if (!c.story || unifiable(c.story.proofNeeds)) return { ...one, oneKept: true };
  const draft = storyFromReading(c.text, c.story, locale);
  const list = oneSlideCandidates(draft);
  if (list.length <= 1) return { ...one, oneKept: true };
  const pick = confidentPick(one, draft);
  const slide = pick ? draft.slides.find((s) => s.id === pick) : undefined;
  // はっきり決まる時は、その問いで1枚を作り「〜に絞りました」と出す。決まらない時は選んでもらう（onePicking）
  return slide ? planFromQuestion({ ...one, storyDraft: draft }, slide) : { ...one, storyDraft: draft };
}

/** 数える用：入口の形・Coach がすすめた形・最後に選んだ形（「coach_recommend:story:one」など。相談文は入れない） */
export const modeOutcome = (plan: Plan, final: 'one' | 'story'): string =>
  `${(plan.creationMode ?? 'none').toLowerCase()}:${plan.coachScope ?? '-'}:${final}`;
