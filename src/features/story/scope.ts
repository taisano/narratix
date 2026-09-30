import type { DesiredYesId, ProofNeedId, RouteSignalId, StoryReading, StoryScopeId } from '@/registry';

/**
 * 1枚で伝えるか、Story として組み立てるか（docs/story-spec.md 5.4〜5.7）。
 * AI の読み取り（StoryReading）を受けて、規則で決める。同じ読み取りなら必ず同じ答え（18.1）。
 * おすすめは1つだけ。判断できない時は、枚数ではなく意図の深さを一問だけ聞く
 */

/** 推薦の理由（画面では相談の言葉と一緒に1行で出す） */
export const SCOPE_REASONS = [
  'NO_READING', // AI の読み取りが無い（ルール版）→ これまでどおり1枚
  'PLAN', // Story を使えないプラン
  'EXPLICIT_ONE', // 「1枚で」と書かれている
  'EXPLICIT_MULTIPLE', // 「複数枚」「一連の流れ」と書かれている
  'SEPARATE_QUESTIONS', // 独立した相談が混ざっている
  'ONE_PROOF', // 示すことが1つ（または1枚にまとめられる）
  'MANY_PROOFS', // 別々に確かめることが複数ある
  'RECOGNITION', // 事実を認識してもらうのが中心
  'DEEP_YES', // 理由・選択・承認まで求めている
  'AI_CANDIDATE', // 判断が割れた時、確かな AI の候補に従った
  'ASK_DEPTH', // 意図の深さを一問だけ確認する
  'ANSWER_FACT', // 確認の答え：事実を見せることが中心
  'ANSWER_REASON', // 確認の答え：理由・判断まで
] as const;
export type ScopeReason = (typeof SCOPE_REASONS)[number];

export type DepthAnswer = 'fact' | 'reason';

export interface ScopeDecision {
  scope: StoryScopeId;
  reasons: ScopeReason[];
}

/** 深い Yes：理由・選択・実行・承認まで求めている */
const DEEP_YES: readonly DesiredYesId[] = ['INTERPRETATION', 'SELECTION', 'FEASIBILITY', 'COMMITMENT'];
/** 深い動き：原因・選択・投資・実行（事実の報告より先） */
const DEEP_SIGNALS: readonly RouteSignalId[] = ['EXPLANATION', 'ROOT_CAUSE', 'PRIORITIZATION', 'INVESTMENT', 'EXECUTION', 'VALIDATION'];

/**
 * 1枚にまとめられる proof_needs の組（主役＋付け合わせ、または主役の中で同時に示せる。docs/catalog.md のレシピ）。
 * 例：全体の拡大＋寄与＝TREND_STACKED_DELTA、規模＋構成＝MIX_MEKKO、順位＋別の指標＝COMP_RANK_METRIC2
 */
const UNIFIABLE: readonly (readonly [ProofNeedId, ProofNeedId])[] = [
  ['OVERALL_CHANGE', 'CONTRIBUTION'], // TREND_STACKED_DELTA・TREND_LINE_DELTA
  ['OVERALL_CHANGE', 'GROWTH_SPEED'], // TREND_LINE＋伸び率注記・TREND_CAGR_TABLE
  ['OVERALL_CHANGE', 'SIZE_CONTEXT'], // TREND_STACKED（合計ラベル）
  ['SIZE_CONTEXT', 'CURRENT_MIX'], // MIX_MEKKO
  ['MIX_CHANGE', 'CONTRIBUTION'], // TREND_SHARE_DELTA
  ['MIX_CHANGE', 'GROWTH_SPEED'], // TREND_SHARE_CAGR
  ['RANKING', 'SEGMENT_DIFFERENCE'], // COMP_RANK_DELTA
  ['RANKING', 'GROWTH_SPEED'], // COMP_RANK_CAGR
  ['RANKING', 'SECOND_METRIC'], // COMP_RANK_METRIC2
  ['RANKING', 'TARGET_GAP'], // COMP_RANK_AVG
  ['POSITIONING', 'SIZE_CONTEXT'], // REL_BUBBLE
  ['POSITIONING', 'RELATIONSHIP'], // REL_QUADRANT
];
const pairOk = (a: ProofNeedId, b: ProofNeedId) => UNIFIABLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** その proof_needs を1枚にまとめられるか（1つ、または組になる2つ） */
export function unifiable(needs: readonly ProofNeedId[]): boolean {
  const u = [...new Set(needs)];
  return u.length <= 1 || (u.length === 2 && pairOk(u[0]!, u[1]!));
}

/** 規則で決める。storyAllowed＝このプランで Story を作れるか */
export function decideScope(reading: StoryReading | null | undefined, storyAllowed: boolean, answer?: DepthAnswer): ScopeDecision {
  if (!reading) return { scope: 'ONE_SLIDE_STORY', reasons: ['NO_READING'] };
  if (!storyAllowed) return { scope: 'ONE_SLIDE_STORY', reasons: ['PLAN'] };
  if (reading.explicitSize === 'ONE') return { scope: 'ONE_SLIDE_STORY', reasons: ['EXPLICIT_ONE'] };
  if (reading.explicitSize === 'MULTIPLE') return { scope: 'STORY_FLOW', reasons: ['EXPLICIT_MULTIPLE'] };
  if (reading.scopeCandidate === 'MULTIPLE_QUESTIONS') return { scope: 'MULTIPLE_QUESTIONS', reasons: ['SEPARATE_QUESTIONS'] };
  // 確認に答えてもらった後は、追加の質問をせずに決める（5.7）
  if (answer === 'fact') return { scope: 'ONE_SLIDE_STORY', reasons: ['ANSWER_FACT'] };
  if (answer === 'reason') return { scope: 'STORY_FLOW', reasons: ['ANSWER_REASON'] };

  const many = !unifiable(reading.proofNeeds);
  const deep = (reading.desiredYes != null && DEEP_YES.includes(reading.desiredYes)) || reading.routeSignals.some((s) => DEEP_SIGNALS.includes(s));
  if (many && deep) return { scope: 'STORY_FLOW', reasons: ['MANY_PROOFS', 'DEEP_YES'] };
  if (!many && !deep && reading.desiredYes != null) return { scope: 'ONE_SLIDE_STORY', reasons: ['ONE_PROOF', 'RECOGNITION'] };
  if (!many && !deep && reading.scopeCandidate !== 'CLARIFY') return { scope: 'ONE_SLIDE_STORY', reasons: ['ONE_PROOF'] };
  // 判断が割れた時：AI の候補が確かなら従う。そうでなければ一問だけ聞く
  if (reading.confidence >= 0.7 && (reading.scopeCandidate === 'ONE_SLIDE_STORY' || reading.scopeCandidate === 'STORY_FLOW')) {
    return { scope: reading.scopeCandidate, reasons: [reading.scopeCandidate === 'STORY_FLOW' ? (many ? 'MANY_PROOFS' : 'DEEP_YES') : 'ONE_PROOF', 'AI_CANDIDATE'] };
  }
  return { scope: 'CLARIFY', reasons: ['ASK_DEPTH'] };
}
