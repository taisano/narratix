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
export const MVP_ROUTES: readonly StoryRouteId[] = ['AIMED', 'DIAGNOSIS', 'CHOICE'];

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
  /** 画面に出す短い役割名。文言は messages/{ja,en}.json に置く */
  labelKey: string;
  question: LocalizedText;
  priority: QuestionPriorityId;
  proofNeeds: ProofNeedId[];
  /** 指定が無ければグラフ。結論・対応などユーザーが書く役割はTEXT */
  presentationMode?: PresentationModeId;
  /** Message・結論・対応をCoachが代筆しない役割 */
  userAuthored?: boolean;
  /** AI相談の「判断」の具体化を添える役割。ユーザーが書く推奨・結論には付けない */
  personalizationTarget?: 'DECISION';
  /** Story の設定として扱い、スライドにしない（Anchor） */
  settingOnly?: boolean;
  /** Question Map には必ず置くが、独立スライドは強制しない（Decision） */
  noForcedSlide?: boolean;
}

export interface RouteDef {
  id: StoryRouteId;
  roles: readonly RouteRoleDef[];
  primaryYes: readonly DesiredYesId[];
  /** desiredYes ごとに、データが未指定でも Question Map に置く役割 */
  stopRoles: Readonly<Partial<Record<DesiredYesId, readonly string[]>>>;
  /** proof_needs の既定の置き場所 */
  proofNeedRoles: Readonly<Record<ProofNeedId, string>>;
  /** 前の役割が埋まっていれば後ろへ置く proof_need */
  sharedProofNeedRoles: Readonly<Partial<Record<ProofNeedId, readonly [string, string]>>>;
  /** 役割に proof_needs が無い時に使う既定の問い */
  defaultProofNeeds: Readonly<Partial<Record<string, ProofNeedId>>>;
  /** desiredYesの停止位置を厳守し、それより後ろのproof_needをQuestion Mapへ出さない */
  strictStop?: boolean;
}

const AIMED_ROUTE = {
  id: 'AIMED',
  primaryYes: ['RECOGNITION', 'INTERPRETATION', 'SELECTION'],
  roles: [
    { id: 'AIMED.ANCHOR', labelKey: 'story.role.anchor', question: L('何を明らかにするか', 'What are we trying to find out?'), priority: 'REQUIRED', proofNeeds: [], settingOnly: true },
    { id: 'AIMED.IMPACT', labelKey: 'story.role.impact', question: L('全体として何が起きているか', 'What is happening overall?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'CURRENT_MIX', 'SIZE_CONTEXT'] },
    { id: 'AIMED.MISMATCH', labelKey: 'story.role.mismatch', question: L('全体の裏にどんな差・例外があるか', 'What differences or exceptions sit behind the whole?'), priority: 'REQUIRED', proofNeeds: ['SEGMENT_DIFFERENCE', 'MIX_CHANGE', 'TARGET_GAP', 'SECOND_METRIC'] },
    { id: 'AIMED.EXPLANATION', labelKey: 'story.role.explanation', question: L('違いをどこまで説明できるか', 'How far can we explain the differences?'), priority: 'CONDITIONAL', proofNeeds: ['CONTRIBUTION', 'BRIDGE', 'RELATIONSHIP', 'SECOND_METRIC'] },
    { id: 'AIMED.DECISION', labelKey: 'story.role.decision', question: L('次に何を判断・確認するか', 'What do we decide or check next?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, personalizationTarget: 'DECISION', noForcedSlide: true },
  ],
  stopRoles: {
    RECOGNITION: ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.DECISION'],
    INTERPRETATION: ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION'],
    SELECTION: ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION'],
    FEASIBILITY: ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION'],
    COMMITMENT: ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION'],
  },
  proofNeedRoles: {
    OVERALL_CHANGE: 'AIMED.IMPACT', CURRENT_MIX: 'AIMED.IMPACT', SIZE_CONTEXT: 'AIMED.IMPACT', GROWTH_SPEED: 'AIMED.IMPACT',
    SEGMENT_DIFFERENCE: 'AIMED.MISMATCH', MIX_CHANGE: 'AIMED.MISMATCH', TARGET_GAP: 'AIMED.MISMATCH', SECOND_METRIC: 'AIMED.MISMATCH',
    RANKING: 'AIMED.MISMATCH', ITEM_SHARE: 'AIMED.MISMATCH',
    CONTRIBUTION: 'AIMED.EXPLANATION', BRIDGE: 'AIMED.EXPLANATION', RELATIONSHIP: 'AIMED.EXPLANATION', POSITIONING: 'AIMED.EXPLANATION',
  },
  sharedProofNeedRoles: { SECOND_METRIC: ['AIMED.MISMATCH', 'AIMED.EXPLANATION'] },
  defaultProofNeeds: { 'AIMED.IMPACT': 'OVERALL_CHANGE', 'AIMED.MISMATCH': 'SEGMENT_DIFFERENCE' },
} as const satisfies RouteDef;

const CHOICE_ROUTE = {
  id: 'CHOICE',
  primaryYes: ['SELECTION', 'COMMITMENT'],
  strictStop: true,
  roles: [
    { id: 'CHOICE.DECISION', labelKey: 'story.role.choice.decision', question: L('何を選ぶ必要があるか', 'What needs to be chosen?'), priority: 'REQUIRED', proofNeeds: [], settingOnly: true },
    { id: 'CHOICE.CRITERIA', labelKey: 'story.role.choice.criteria', question: L('何を基準に比べるか', 'What criteria should be used?'), priority: 'REQUIRED', proofNeeds: ['SECOND_METRIC', 'TARGET_GAP', 'POSITIONING'] },
    { id: 'CHOICE.OPTIONS', labelKey: 'story.role.choice.options', question: L('比べる選択肢は何か', 'What options are being compared?'), priority: 'REQUIRED', proofNeeds: ['RANKING', 'SIZE_CONTEXT', 'POSITIONING'] },
    { id: 'CHOICE.TRADE_OFFS', labelKey: 'story.role.choice.tradeOffs', question: L('選択肢ごとの強み・弱みは何か', 'What are the trade-offs of each option?'), priority: 'REQUIRED', proofNeeds: ['SECOND_METRIC', 'POSITIONING', 'TARGET_GAP'] },
    { id: 'CHOICE.RECOMMENDATION', labelKey: 'story.role.choice.recommendation', question: L('どの案を選ぶか', 'Which option do you recommend?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, noForcedSlide: true },
    { id: 'CHOICE.CONDITIONS', labelKey: 'story.role.choice.conditions', question: L('その選択が成立する条件は何か', 'Under what conditions does the choice hold?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP', 'SECOND_METRIC'] },
    { id: 'CHOICE.COMMITMENT', labelKey: 'story.role.choice.commitment', question: L('何をいつ決めるか', 'What will be committed, and when?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true },
  ],
  stopRoles: {
    RECOGNITION: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION'],
    INTERPRETATION: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION'],
    SELECTION: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION'],
    FEASIBILITY: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION', 'CHOICE.CONDITIONS'],
    COMMITMENT: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS', 'CHOICE.RECOMMENDATION', 'CHOICE.CONDITIONS', 'CHOICE.COMMITMENT'],
  },
  proofNeedRoles: {
    OVERALL_CHANGE: 'CHOICE.OPTIONS', GROWTH_SPEED: 'CHOICE.OPTIONS', CURRENT_MIX: 'CHOICE.OPTIONS', SIZE_CONTEXT: 'CHOICE.OPTIONS',
    SEGMENT_DIFFERENCE: 'CHOICE.OPTIONS', RANKING: 'CHOICE.OPTIONS', ITEM_SHARE: 'CHOICE.OPTIONS',
    TARGET_GAP: 'CHOICE.CRITERIA', SECOND_METRIC: 'CHOICE.CRITERIA',
    CONTRIBUTION: 'CHOICE.TRADE_OFFS', MIX_CHANGE: 'CHOICE.TRADE_OFFS', BRIDGE: 'CHOICE.TRADE_OFFS',
    RELATIONSHIP: 'CHOICE.TRADE_OFFS', POSITIONING: 'CHOICE.TRADE_OFFS',
  },
  sharedProofNeedRoles: {
    SECOND_METRIC: ['CHOICE.CRITERIA', 'CHOICE.TRADE_OFFS'],
    POSITIONING: ['CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS'],
    TARGET_GAP: ['CHOICE.CRITERIA', 'CHOICE.TRADE_OFFS'],
  },
  defaultProofNeeds: {},
} as const satisfies RouteDef;

const DIAGNOSIS_ROUTE = {
  id: 'DIAGNOSIS',
  primaryYes: ['RECOGNITION', 'INTERPRETATION'],
  strictStop: true,
  roles: [
    { id: 'DIAGNOSIS.SYMPTOM', labelKey: 'story.role.diagnosis.outcome', question: L('何が起きているか', 'What outcome do we observe?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'SIZE_CONTEXT', 'CURRENT_MIX', 'TARGET_GAP'] },
    { id: 'DIAGNOSIS.LOCATION', labelKey: 'story.role.diagnosis.location', question: L('どこ・誰・いつに集中しているか', 'Where, for whom, or when is it concentrated?'), priority: 'REQUIRED', proofNeeds: ['SEGMENT_DIFFERENCE', 'RANKING', 'MIX_CHANGE', 'ITEM_SHARE', 'POSITIONING'] },
    { id: 'DIAGNOSIS.DRIVER', labelKey: 'story.role.diagnosis.driver', question: L('何が増減へ寄与し、何と関連しているか', 'What contributes to the change or moves with it?'), priority: 'CONDITIONAL', proofNeeds: ['CONTRIBUTION', 'BRIDGE', 'RELATIONSHIP', 'SECOND_METRIC'] },
    { id: 'DIAGNOSIS.ROOT_CAUSE', labelKey: 'story.role.diagnosis.rootCause', question: L('原因と言えるには何を追加で確かめる必要があるか', 'What else must be tested before calling it a cause?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT' },
    { id: 'DIAGNOSIS.ACTIONABILITY', labelKey: 'story.role.diagnosis.actionability', question: L('どこまで再現・修正・緩和できるか', 'What can be replicated, corrected, or mitigated?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP', 'POSITIONING'], presentationMode: 'TEXT' },
    { id: 'DIAGNOSIS.ACTION', labelKey: 'story.role.diagnosis.action', question: L('次に何を試す・確認するか', 'What should be tried or checked next?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, noForcedSlide: true },
  ],
  stopRoles: {
    RECOGNITION: ['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION'],
    INTERPRETATION: ['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION', 'DIAGNOSIS.DRIVER'],
    SELECTION: ['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION', 'DIAGNOSIS.DRIVER'],
    FEASIBILITY: ['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION', 'DIAGNOSIS.DRIVER', 'DIAGNOSIS.ACTIONABILITY'],
    COMMITMENT: ['DIAGNOSIS.SYMPTOM', 'DIAGNOSIS.LOCATION', 'DIAGNOSIS.DRIVER', 'DIAGNOSIS.ACTIONABILITY', 'DIAGNOSIS.ACTION'],
  },
  proofNeedRoles: {
    OVERALL_CHANGE: 'DIAGNOSIS.SYMPTOM', CURRENT_MIX: 'DIAGNOSIS.SYMPTOM', SIZE_CONTEXT: 'DIAGNOSIS.SYMPTOM', GROWTH_SPEED: 'DIAGNOSIS.SYMPTOM',
    SEGMENT_DIFFERENCE: 'DIAGNOSIS.LOCATION', MIX_CHANGE: 'DIAGNOSIS.LOCATION', TARGET_GAP: 'DIAGNOSIS.SYMPTOM',
    RANKING: 'DIAGNOSIS.LOCATION', ITEM_SHARE: 'DIAGNOSIS.LOCATION', POSITIONING: 'DIAGNOSIS.LOCATION',
    CONTRIBUTION: 'DIAGNOSIS.DRIVER', BRIDGE: 'DIAGNOSIS.DRIVER', RELATIONSHIP: 'DIAGNOSIS.DRIVER', SECOND_METRIC: 'DIAGNOSIS.DRIVER',
  },
  sharedProofNeedRoles: {},
  defaultProofNeeds: { 'DIAGNOSIS.SYMPTOM': 'OVERALL_CHANGE', 'DIAGNOSIS.LOCATION': 'SEGMENT_DIFFERENCE' },
} as const satisfies RouteDef;

/** 実装済みRouteの唯一の設計図。R3で1型ずつ足す */
export const STORY_ROUTES = { AIMED: AIMED_ROUTE, DIAGNOSIS: DIAGNOSIS_ROUTE, CHOICE: CHOICE_ROUTE } as const satisfies Partial<Record<StoryRouteId, RouteDef>>;

/** 既存参照との互換。定義の正本は STORY_ROUTES.AIMED.roles */
export const AIMED_ROLES: readonly RouteRoleDef[] = STORY_ROUTES.AIMED.roles;

/** 未実装Routeを保存済みデータから受け取った時は、従来どおりAIMEDで扱う */
export const routeDef = (route: StoryRouteId): RouteDef => STORY_ROUTES[route as keyof typeof STORY_ROUTES] ?? STORY_ROUTES.AIMED;

export const routeRoleDef = (route: StoryRouteId, role: string | null | undefined): RouteRoleDef | undefined =>
  role ? routeDef(route).roles.find((r) => r.id === role) : undefined;

export const roleDefById = (role: string | null | undefined): RouteRoleDef | undefined => {
  if (!role) return undefined;
  return (Object.values(STORY_ROUTES) as RouteDef[]).flatMap((route) => route.roles).find((candidate) => candidate.id === role);
};

export const routeQuestionRoleIds = (route: StoryRouteId): string[] => {
  const def = routeDef(route);
  const used = new Set(Object.values(def.proofNeedRoles));
  return def.roles.filter((role) => used.has(role.id)).map((role) => role.id);
};

export const isMvpRoute = (route: StoryRouteId): boolean => MVP_ROUTES.includes(route);

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
