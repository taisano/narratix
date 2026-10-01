import { GOAL_TO_PURPOSE, type PurposeId } from '@/registry';
import { switchReading, type Plan } from './plan';
import { coachPick, confidentPick, oneSlideCandidates, planFromQuestion } from '../story/oneSlide';
import type { EmphasisId } from './coach';

/**
 * ② の ①「この1枚で答える問いを選ぶ」（docs/decisions.md「1枚のスライドを作る画面」）。問いを選ぶ場所はここ1つ。
 * 問いの候補は2通り：相談の読み取り（Story の下書き）にある問い、または AI が見つけた「もう1つの読み方」。
 * 選び直しは規則だけ（AI を使わない・回数を減らさない）
 */

export const QUESTION_MAX = 3;

export interface QuestionOption {
  id: string;
  question: string;
  /** その問いで Coach が伝えたいこと（切り口） */
  dish: EmphasisId | null;
}

export type QuestionSet =
  | { kind: 'none' }
  /** 問いが1つ：選ばずに見せるだけ */
  | { kind: 'single'; question: string }
  | {
    kind: 'story' | 'reading';
    options: QuestionOption[];
    selected: string;
    recommended: string;
    /** おすすめの理由：goal＝相談の目的に合う、first＝ほかの問いの前提になる最初の問い、primary＝相談の中心として読んだ問い */
    reason: { kind: 'goal'; purpose: PurposeId } | { kind: 'first' } | { kind: 'primary' };
  };

export function questionSet(plan: Plan): QuestionSet {
  const c = plan.consultation;
  if (!c) return { kind: 'none' };
  const draft = plan.storyDraft;
  if (plan.oneFrom && draft) {
    const all = oneSlideCandidates(draft);
    const rec = coachPick(plan, draft) ?? all[0]?.id ?? plan.oneFrom.slideId;
    // おすすめを先頭に最大3つ。選んでいる問いは必ず入れる
    let list = [...all.filter((s) => s.id === rec), ...all.filter((s) => s.id !== rec)].slice(0, QUESTION_MAX);
    if (!list.some((s) => s.id === plan.oneFrom!.slideId)) {
      const cur = all.find((s) => s.id === plan.oneFrom!.slideId);
      if (cur) list = [...list.slice(0, QUESTION_MAX - 1), cur];
    }
    if (list.length >= 2) {
      const goal = c.classification.primary_goal;
      return {
        kind: 'story', selected: plan.oneFrom.slideId, recommended: rec,
        options: list.map((s) => ({ id: s.id, question: s.question, dish: plan.oneFrom!.slideId === s.id ? plan.angles[0]?.coachEmphasis ?? null : null })),
        reason: confidentPick(plan, draft) === rec && goal ? { kind: 'goal', purpose: GOAL_TO_PURPOSE[goal] } : { kind: 'first' },
      };
    }
    return { kind: 'single', question: plan.oneFrom.question };
  }
  if (c.alternative) {
    const primary = c.primary ?? { classification: c.classification, question: c.question, focus: c.focus ?? [] };
    return {
      kind: 'reading', selected: c.reading ?? 'primary', recommended: 'primary', reason: { kind: 'primary' },
      options: [
        { id: 'primary', question: primary.classification.business_question ?? primary.question, dish: null },
        { id: 'alternative', question: c.alternative.question, dish: null },
      ],
    };
  }
  const q = (c.reading === 'alternative' ? c.question : c.classification.business_question ?? c.question).trim();
  return q ? { kind: 'single', question: q } : { kind: 'none' };
}

/**
 * 問いを選び直す。切り口はその問いで Coach がすすめるものにし、形は Coach のおすすめに戻す
 * （同じ目的の問いどうしで前の切り口を残すと、問いを替えても何も変わらないため）
 */
export function selectQuestion(plan: Plan, id: string): Plan {
  const s = questionSet(plan);
  if (s.kind === 'story') {
    const slide = plan.storyDraft?.slides.find((x) => x.id === id);
    return slide ? planFromQuestion(plan, slide) : plan;
  }
  if (s.kind === 'reading' && (id === 'primary' || id === 'alternative')) return switchReading(plan, id);
  return plan;
}
