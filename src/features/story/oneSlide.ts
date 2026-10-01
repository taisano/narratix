import { EMPHASES, type EmphasisId } from '../start/coach';
import type { Plan } from '../start/plan';
import { GOAL_TO_PURPOSE, type PurposeId } from '@/registry';
import { dishFor } from './questionMap';
import { groupOf } from './storyOps';
import type { StorySlide, StoryState } from './model';

/**
 * 「まずは1枚だけ作る」（docs/story-spec.md 4.2：中心の Question を一つ提案し、ユーザーは切り替えられる）。
 * ストーリーの下書きの問いから1つを選び、その問いの proof_needs → 料理 → 見せ方で1枚の提案を作る。
 * ほかの問いは消さない（「ストーリーに戻る」で元の画面へ）
 */

const purposeOf = (e: EmphasisId): PurposeId | null =>
  (Object.keys(EMPHASES) as PurposeId[]).find((p) => (EMPHASES[p] as readonly string[]).includes(e)) ?? null;

/** 1枚にできる問い：メインストーリーにあって、示すこと（proof_needs）があり、料理につながるもの */
export function oneSlideCandidates(draft: StoryState): StorySlide[] {
  return draft.slides.filter((s) => groupOf(s) === 'MAIN' && s.proofNeeds.length > 0 && dishFor(s.proofNeeds) != null);
}

/** 相談の分類（目的）に合う問い（はっきり1つに決まる時だけ。合うものが無い・2つ以上なら null） */
export function confidentPick(plan: Plan, draft: StoryState): string | null {
  const list = oneSlideCandidates(draft);
  const goal = plan.consultation?.classification.primary_goal;
  const want = goal ? GOAL_TO_PURPOSE[goal] : null;
  const hits = list.filter((s) => { const d = dishFor(s.proofNeeds); return d != null && purposeOf(d) === want; });
  return hits.length === 1 ? hits[0]!.id : null;
}

/** Coach の初期選択：最初の相談の分類（目的）に合う問い。無ければ最初の問い */
export function coachPick(plan: Plan, draft: StoryState): string | null {
  const list = oneSlideCandidates(draft);
  const goal = plan.consultation?.classification.primary_goal;
  const want = goal ? GOAL_TO_PURPOSE[goal] : null;
  const hit = list.find((s) => { const d = dishFor(s.proofNeeds); return d != null && purposeOf(d) === want; });
  return (hit ?? list[0])?.id ?? null;
}

/** 1枚で伝える時に選んでもらう問いの数の上限（Coach の初期選択を先頭に） */
export const ONE_PICK_MAX = 3;
export function pickCandidates(plan: Plan, draft: StoryState, limit?: number): StorySlide[] {
  const list = oneSlideCandidates(draft);
  if (!limit) return list;
  const first = coachPick(plan, draft);
  return [...list.filter((s) => s.id === first), ...list.filter((s) => s.id !== first)].slice(0, limit);
}

/** 選んだ問いで1枚の提案にする（伝えたいこと＝その問いの料理。あとで変えられる） */
export function planFromQuestion(plan: Plan, slide: StorySlide): Plan {
  const dish = dishFor(slide.proofNeeds);
  const purpose = dish ? purposeOf(dish) : null;
  if (!dish || !purpose) return plan;
  const seq = plan.seq + 1;
  return {
    ...plan, seq,
    angles: [{ id: `a${seq}`, purpose, emphasis: dish, emphasisSource: 'user' }],
    oneFrom: { slideId: slide.id, question: slide.question, anglesBefore: plan.oneFrom?.anglesBefore ?? plan.angles },
  };
}

/** ストーリーに戻る（整えた問いはそのまま。切り口は元に戻す） */
export function backToStory(plan: Plan): Plan {
  return { ...plan, angles: plan.oneFrom?.anglesBefore ?? plan.angles, scopeChoice: undefined, oneFrom: undefined, onePick: undefined };
}

/** 1枚にする問いを選び直す（選ぶ画面へ戻る） */
export function repickQuestion(plan: Plan): Plan {
  return { ...plan, angles: plan.oneFrom?.anglesBefore ?? plan.angles, onePick: plan.oneFrom?.slideId, oneFrom: undefined };
}
