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

// ──────────── 相談の構造化（5.2）。AI が相談文から読み取り、規則が One Slide／Story を決める ────────────

/** Route を選ぶ手がかり（相談文に表れる動き）。Route 名そのものは AI に選ばせない */
export const ROUTE_SIGNAL_IDS = [
  'DATA_DISCOVERY', // データから全体像・差を見つける
  'MISMATCH', // 全体と違う差・例外・指標による見え方の違い
  'EXPLANATION', // 違い・変化を説明する（寄与・関連）
  'ROOT_CAUSE', // 原因を特定する
  'PRIORITIZATION', // 候補から選ぶ・優先順位
  'URGENCY', // 今動く必要
  'INVESTMENT', // 投資・予算の判断
  'VALIDATION', // 主張・仮説を検証する
  'EXECUTION', // 実行計画・展開
  'ANSWER_READY', // 結論が決まっていて承認を得たい
] as const;
export type RouteSignalId = (typeof ROUTE_SIGNAL_IDS)[number];

/** 結果の向き（Diagnosis で使う。6.4） */
export const OUTCOME_DIRECTION_IDS = ['POSITIVE', 'NEGATIVE', 'MIXED', 'NEUTRAL', 'UNKNOWN'] as const;
export type OutcomeDirectionId = (typeof OUTCOME_DIRECTION_IDS)[number];

/** AI の読み取り（アプリの形）。分からない項目は null・空（推測で埋めない） */
export interface StoryReading {
  decisionQuestion: string | null;
  desiredYes: DesiredYesId | null;
  primaryBarrier: string | null;
  proofNeeds: ProofNeedId[];
  scopeCandidate: StoryScopeId;
  routeSignals: RouteSignalId[];
  outcomeDirection: OutcomeDirectionId;
  /** 相談文に「1枚で」「複数枚で」などの明示があるか */
  explicitSize: 'ONE' | 'MULTIPLE' | null;
  confidence: number;
  /** 同じAI相談の応答に含める、Storyカード向けの具体化候補。生成後のQuestionへ意味が一致する時だけ接続する */
  personalizations?: StoryPersonalizationCandidate[];
  /** AI が提案した、データを集める依頼（Data Coach）。無い・使えない時は規則の提案に戻す。docs/story-data-pack-implementation-plan.md 13章 */
  dataPack?: StoryDataPackSuggestion[];
}

export interface StoryDataPackSuggestion {
  /** この依頼で答える証明要求（proof_needs の語） */
  needs: ProofNeedId[];
  label: string;
  role: string;
  importance: 'required' | 'recommended' | 'optional';
  grain: string[];
  fields: { label: string; description: string; kind: 'dimension' | 'measure'; valueType: 'text' | 'number' | 'percent' | 'date'; unit?: string; example?: string }[];
}

export type PersonalizationConfidence = 'confirmed' | 'proposed' | 'unknown';

export interface PersonalizedStoryContext {
  explanation: string;
  confidence: PersonalizationConfidence;
  requiredDataHints: string[];
  unresolvedQuestion?: string;
  sourceTerms?: string[];
}

/**
 * AI は問いのまとめ方（どの proof_needs を1枚にするか）を知らないので、証明要求1つごとに具体化を返す。
 * アプリが問いを作った後、その問いの proof_needs に当たる候補をまとめて付ける（最後の判断の問いは DECISION）
 */
export interface StoryPersonalizationCandidate extends PersonalizedStoryContext {
  target: ProofNeedId | 'DECISION';
}

// ──────────── 表・言葉の見せ方（9章）。P4 で入力欄を作る。今は見せ方の例に名前を使う ────────────

export const TABLE_TEMPLATE_IDS = ['BASIC_TABLE', 'COMPARISON_TABLE', 'DELTA_TABLE', 'KPI_SCORECARD', 'HEATMAP_TABLE'] as const;
export type TableTemplateId = (typeof TABLE_TEMPLATE_IDS)[number];
export const TABLE_TEMPLATES: Record<TableTemplateId, LocalizedText> = {
  BASIC_TABLE: L('基本表', 'Basic table'),
  COMPARISON_TABLE: L('比較表', 'Comparison table'),
  DELTA_TABLE: L('増減付き表', 'Table with changes'),
  KPI_SCORECARD: L('KPI スコアカード', 'KPI scorecard'),
  HEATMAP_TABLE: L('ヒートマップ型の表', 'Heatmap table'),
};

export const TEXT_TEMPLATE_IDS = [
  'CONCLUSION_THREE_REASONS', 'EXECUTIVE_SUMMARY', 'ISSUE_INSIGHT_ACTION', 'TWO_COLUMN_COMPARE', 'BULLET_SUMMARY', 'NUMBER_WITH_EXPLANATION', 'NEXT_ACTION',
] as const;
export type TextTemplateId = (typeof TEXT_TEMPLATE_IDS)[number];
export const TEXT_TEMPLATES: Record<TextTemplateId, LocalizedText> = {
  CONCLUSION_THREE_REASONS: L('結論＋3つの根拠', 'Conclusion + three reasons'),
  EXECUTIVE_SUMMARY: L('Executive Summary', 'Executive summary'),
  ISSUE_INSIGHT_ACTION: L('課題→示唆→アクション', 'Issue → insight → action'),
  TWO_COLUMN_COMPARE: L('2カラム比較', 'Two-column comparison'),
  BULLET_SUMMARY: L('箇条書き', 'Bullet points'),
  NUMBER_WITH_EXPLANATION: L('数字＋短い説明', 'Number + short explanation'),
  NEXT_ACTION: L('次のアクション', 'Next action'),
};
