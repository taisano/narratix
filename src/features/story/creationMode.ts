import type { CreationMode, Locale, StoryReading } from '@/registry';
import { withoutStoryDraft, type Plan } from '../start/plan';
import { decideScope, unifiable } from './scope';
import { storyFromReading } from './questionMap';
import { readOutline } from './outline';
import { oneSlideCandidates, pickCoachQuestion } from './oneSlide';

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
  const base0: Plan = { ...plan, creationMode: mode, scopeChoice: undefined, oneKept: undefined, oneFrom: undefined, onePick: undefined, modeNote: undefined, coachScope: undefined };
  const base = withoutStoryDraft(base0);
  if (!c) return base;
  if (mode === 'COACH_RECOMMEND' || (mode === 'STORY' && !storyAllowed)) {
    const d = decideScope(c.story, storyAllowed, base.scopeAnswer).scope;
    // 独立した問いが混ざっている時は、1枚の流れで中心の問いを1つ選んだ状態にする（ほかの問いは ① のカードで選べる）
    const p = d === 'MULTIPLE_QUESTIONS' ? oneSlideOf(base, locale) : base;
    return { ...p, ...(mode === 'COACH_RECOMMEND' ? { coachScope: coachScopeOf(base, storyAllowed) } : {}) };
  }
  if (mode === 'STORY') {
    if (c.story) return { ...base, scopeChoice: 'story' };
    const r = outlineReading(c.text);
    if (r) return { ...base, consultation: { ...c, story: r }, scopeChoice: 'story' };
    // Story を組むには問いの読み取りが要る。作れない時は、黙らずに理由を出して1枚で提案する
    return { ...base, scopeChoice: 'one', oneKept: true, modeNote: 'storyNeedsAi' };
  }
  // ONE_SLIDE
  return oneSlideOf(base, locale);
}

/**
 * 1枚の流れ。示すことが1つ（または1枚にまとめられる組）なら今までどおり。問いが複数あれば、Coach の選んだ問いで1枚を作り、
 * ほかの問いは ② の ① のカードで選べるようにする（黙って縮めない）
 */
export function oneSlideOf(plan: Plan, locale: Locale): Plan {
  const c = plan.consultation;
  const one: Plan = withoutStoryDraft({ ...plan, scopeChoice: 'one', oneFrom: undefined, onePick: undefined });
  if (!c?.story || unifiable(c.story.proofNeeds)) return { ...one, oneKept: true };
  const draft = storyFromReading(c.text, c.story, locale);
  if (oneSlideCandidates(draft).length <= 1) return { ...one, oneKept: true };
  return pickCoachQuestion(one, draft);
}

/** 数える用：入口の形・Coach がすすめた形・最後に選んだ形（「coach_recommend:story:one」など。相談文は入れない） */
export const modeOutcome = (plan: Plan, final: 'one' | 'story'): string =>
  `${(plan.creationMode ?? 'none').toLowerCase()}:${plan.coachScope ?? '-'}:${final}`;
