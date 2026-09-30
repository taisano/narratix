import type { LocalizedText } from './locale';
import type { ProofNeedId } from './proofNeeds';

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

/**
 * Story（コース料理）の語彙。docs/story-spec.md（Story 機能 最終提案・実装指示書 v1.0）。
 * UI には内部 ID を出さず、label を出す
 */

/** 1枚で伝えるか、Story として組み立てるか（3.2） */
export const STORY_SCOPE_IDS = ['ONE_SLIDE_STORY', 'STORY_FLOW', 'MULTIPLE_QUESTIONS', 'CLARIFY'] as const;
export type StoryScopeId = (typeof STORY_SCOPE_IDS)[number];

/** 読み手に期待する状態＝必要な Yes（5.3）。Route の停止条件 */
export const DESIRED_YES_IDS = ['RECOGNITION', 'INTERPRETATION', 'SELECTION', 'FEASIBILITY', 'COMMITMENT'] as const;
export type DesiredYesId = (typeof DESIRED_YES_IDS)[number];
export const DESIRED_YES: Record<DesiredYesId, LocalizedText> = {
  RECOGNITION: L('事実・問題・機会を認識する', 'Recognise the fact, problem or opportunity'),
  INTERPRETATION: L('原因や意味に納得する', 'Accept the explanation or meaning'),
  SELECTION: L('選択肢から方向を選ぶ', 'Choose a direction'),
  FEASIBILITY: L('実行可能性に納得する', 'Accept that it is feasible'),
  COMMITMENT: L('予算・人員・行動を承認する', 'Approve budget, people or action'),
};

/** Story Route（6章）。MVP で実装するのは AIMED だけ */
export const STORY_ROUTE_IDS = ['ANSWER_FIRST', 'AIMED', 'DIAGNOSIS', 'CHOICE', 'URGENCY', 'BUSINESS_CASE', 'PROOF', 'TRANSFORMATION'] as const;
export type StoryRouteId = (typeof STORY_ROUTE_IDS)[number];
export const MVP_ROUTES: readonly StoryRouteId[] = ['AIMED'];

/** Question の優先度（3.3）。重要度とスライド化は別：REQUIRED でもデータが無ければ COACHING_ONLY になり得る */
export const QUESTION_PRIORITY_IDS = ['REQUIRED', 'CONDITIONAL', 'SUPPORTING', 'APPENDIX', 'COACHING_ONLY'] as const;
export type QuestionPriorityId = (typeof QUESTION_PRIORITY_IDS)[number];

/** 見せ方（8.4・9章）。グラフ・表・言葉・その組み合わせ */
export const PRESENTATION_MODE_IDS = ['GRAPH', 'TABLE', 'TEXT', 'HYBRID'] as const;
export type PresentationModeId = (typeof PRESENTATION_MODE_IDS)[number];

/** スライドの置き場所（15.2）：Main Story／Supporting Evidence／Appendix */
export const STORY_SECTION_IDS = ['MAIN', 'SUPPORTING', 'APPENDIX'] as const;
export type StorySectionId = (typeof STORY_SECTION_IDS)[number];

/** スライドの状態（左の Story の地図：確認済み／作成中／次に作る／この後は、この状態と並びから出す） */
export const STORY_SLIDE_STATUS_IDS = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const;
export type StorySlideStatusId = (typeof STORY_SLIDE_STATUS_IDS)[number];

/** Main Story の枚数（3.3）：理想 3〜8、10 を超えたら統合・Appendix・分割を提案する */
export const STORY_SIZE = { idealMin: 3, idealMax: 8, softMax: 10 } as const;

/** AIMED の役割（6.3）。Question Map の元。Route の役割をそのまま1枚にはしない（7.2） */
export interface RouteRoleDef {
  id: string;
  question: LocalizedText;
  priority: QuestionPriorityId;
  proofNeeds: ProofNeedId[];
  /** Story の設定として扱い、スライドにしない（Anchor） */
  settingOnly?: boolean;
  /** Question Map には必ず置くが、独立スライドは強制しない（Decision） */
  noForcedSlide?: boolean;
}

export const AIMED_ROLES: readonly RouteRoleDef[] = [
  { id: 'AIMED.ANCHOR', question: L('何を明らかにするか', 'What are we trying to find out?'), priority: 'REQUIRED', proofNeeds: [], settingOnly: true },
  { id: 'AIMED.IMPACT', question: L('全体として何が起きているか', 'What is happening overall?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'CURRENT_MIX', 'SIZE_CONTEXT'] },
  { id: 'AIMED.MISMATCH', question: L('全体の裏にどんな差・例外があるか', 'What differences or exceptions sit behind the whole?'), priority: 'REQUIRED', proofNeeds: ['SEGMENT_DIFFERENCE', 'MIX_CHANGE', 'TARGET_GAP', 'SECOND_METRIC'] },
  { id: 'AIMED.EXPLANATION', question: L('違いをどこまで説明できるか', 'How far can we explain the differences?'), priority: 'CONDITIONAL', proofNeeds: ['CONTRIBUTION', 'BRIDGE', 'RELATIONSHIP', 'SECOND_METRIC'] },
  { id: 'AIMED.DECISION', question: L('次に何を判断・確認するか', 'What do we decide or check next?'), priority: 'REQUIRED', proofNeeds: [], noForcedSlide: true },
];
