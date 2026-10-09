import type { LocalizedText } from './locale';
import type { ProofNeedId } from './proofNeeds';
import type { StoryTemplateId } from './storyTemplates';

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

/** Story Route（6章）。有効化するRouteはMVP_ROUTESで管理する */
export const STORY_ROUTE_IDS = ['ANSWER_FIRST', 'AIMED', 'DIAGNOSIS', 'CHOICE', 'URGENCY', 'BUSINESS_CASE', 'PROOF', 'TRANSFORMATION'] as const;
export type StoryRouteId = (typeof STORY_ROUTE_IDS)[number];
export const MVP_ROUTES: readonly StoryRouteId[] = ['AIMED', 'DIAGNOSIS', 'CHOICE', 'ANSWER_FIRST', 'URGENCY', 'PROOF', 'BUSINESS_CASE', 'TRANSFORMATION'];

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
  /** この信号が読み取られた時、停止位置より後ろでも「外した問い」（COACHING_ONLY）として置く */
  coachingOnSignal?: RouteSignalId;
  /** 相談文にこの言葉（正規表現・大文字小文字を区別しない）があれば、停止位置に関わらず必須の問いとして残す */
  cues?: string;
  /** 既定の置き場所（無ければMain）。詳細な前提など、本筋を重くしない役割に使う */
  section?: 'SUPPORTING' | 'APPENDIX';
  /** 1枚にまとめられない組があっても、この役割は1枚だけ置く（残りは「外した問い」） */
  singleSlide?: boolean;
  /** 停止位置に入っていても、対応するproof_needsが無ければ空の問いを置かない */
  onlyWithNeeds?: boolean;
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
  /** 相談文で見せ方を指定した時に、その見せ方を置く役割。無いRouteは役割の並び位置で決める */
  /** 前面には役割の質問を出し、proof_needsの質問は裏のレシピ選びにだけ使う */
  roleQuestionFirst?: boolean;
  outlineRoles?: Readonly<Partial<Record<OutlineRoleKind, string>>>;
}

/** outlineRoles のキー（Executive Summary は役割を持たない） */
export type OutlineRoleKind = Exclude<StoryTemplateId, 'STORY_TEXT_EXECUTIVE_SUMMARY'> | 'GRAPH_TREND';

const ANSWER_FIRST_ROUTE = {
  id: 'ANSWER_FIRST',
  roleQuestionFirst: true,
  primaryYes: ['SELECTION', 'COMMITMENT'],
  outlineRoles: {
    STORY_TABLE_KPI: 'ANSWER_FIRST.REASONS', STORY_TEXT_NUMBERS: 'ANSWER_FIRST.REASONS', GRAPH_TREND: 'ANSWER_FIRST.EVIDENCE',
    STORY_TABLE_DELTA: 'ANSWER_FIRST.EVIDENCE', STORY_TABLE_HEATMAP: 'ANSWER_FIRST.EVIDENCE', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'ANSWER_FIRST.RISKS',
    STORY_TABLE_BASIC: 'ANSWER_FIRST.EVIDENCE', STORY_TEXT_TWO_COLUMN: 'ANSWER_FIRST.RISKS', STORY_TEXT_BULLETS: 'ANSWER_FIRST.REASONS',
    STORY_TABLE_COMPARISON: 'ANSWER_FIRST.EVIDENCE', STORY_TEXT_CONCLUSION_REASONS: 'ANSWER_FIRST.ANSWER', STORY_TEXT_NEXT_ACTIONS: 'ANSWER_FIRST.ASK',
  },
  strictStop: true,
  roles: [
    { id: 'ANSWER_FIRST.DECISION', labelKey: 'story.role.answerFirst.decision', question: L('何について判断・承認を得るか', 'What decision or approval is needed?'), priority: 'REQUIRED', proofNeeds: [], settingOnly: true },
    { id: 'ANSWER_FIRST.ANSWER', labelKey: 'story.role.answerFirst.answer', question: L('提案する結論は何か', 'What answer do you propose?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true },
    { id: 'ANSWER_FIRST.REASONS', labelKey: 'story.role.answerFirst.reasons', question: L('その結論を支える理由は何か', 'What reasons support the answer?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'SIZE_CONTEXT', 'SEGMENT_DIFFERENCE', 'RANKING'] },
    { id: 'ANSWER_FIRST.EVIDENCE', labelKey: 'story.role.answerFirst.evidence', question: L('理由を裏づける事実は何か', 'What evidence supports the reasons?'), priority: 'REQUIRED', proofNeeds: ['CONTRIBUTION', 'MIX_CHANGE', 'BRIDGE', 'POSITIONING'] },
    { id: 'ANSWER_FIRST.RISKS', labelKey: 'story.role.answerFirst.risks', question: L('判断前に確認すべき反対材料や条件は何か', 'What risks or conditions must be checked?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP', 'SECOND_METRIC', 'RELATIONSHIP'], cues: 'リスク|懸念|留意|反対材料|risk' },
    { id: 'ANSWER_FIRST.ASK', labelKey: 'story.role.answerFirst.ask', question: L('読み手に何を決めてほしいか', 'What do you want the audience to decide?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, noForcedSlide: true },
  ],
  stopRoles: {
    RECOGNITION: ['ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE'],
    INTERPRETATION: ['ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE'],
    SELECTION: ['ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE', 'ANSWER_FIRST.ASK'],
    FEASIBILITY: ['ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE', 'ANSWER_FIRST.RISKS', 'ANSWER_FIRST.ASK'],
    COMMITMENT: ['ANSWER_FIRST.ANSWER', 'ANSWER_FIRST.REASONS', 'ANSWER_FIRST.EVIDENCE', 'ANSWER_FIRST.RISKS', 'ANSWER_FIRST.ASK'],
  },
  proofNeedRoles: {
    OVERALL_CHANGE: 'ANSWER_FIRST.REASONS', GROWTH_SPEED: 'ANSWER_FIRST.REASONS', CURRENT_MIX: 'ANSWER_FIRST.REASONS',
    SIZE_CONTEXT: 'ANSWER_FIRST.REASONS', SEGMENT_DIFFERENCE: 'ANSWER_FIRST.REASONS', RANKING: 'ANSWER_FIRST.REASONS', ITEM_SHARE: 'ANSWER_FIRST.REASONS',
    CONTRIBUTION: 'ANSWER_FIRST.EVIDENCE', MIX_CHANGE: 'ANSWER_FIRST.EVIDENCE', BRIDGE: 'ANSWER_FIRST.EVIDENCE', POSITIONING: 'ANSWER_FIRST.EVIDENCE',
    TARGET_GAP: 'ANSWER_FIRST.RISKS', SECOND_METRIC: 'ANSWER_FIRST.RISKS', RELATIONSHIP: 'ANSWER_FIRST.RISKS',
  },
  sharedProofNeedRoles: {},
  defaultProofNeeds: {},
} as const satisfies RouteDef;

const URGENCY_ROUTE = {
  id: 'URGENCY',
  roleQuestionFirst: true,
  primaryYes: ['RECOGNITION', 'COMMITMENT'],
  outlineRoles: {
    STORY_TABLE_KPI: 'URGENCY.STATUS_QUO', STORY_TEXT_NUMBERS: 'URGENCY.STATUS_QUO', GRAPH_TREND: 'URGENCY.STATUS_QUO',
    STORY_TABLE_DELTA: 'URGENCY.INFLECTION', STORY_TABLE_HEATMAP: 'URGENCY.INFLECTION', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'URGENCY.COST_OF_DELAY',
    STORY_TABLE_BASIC: 'URGENCY.EXPOSURE', STORY_TEXT_TWO_COLUMN: 'URGENCY.COST_OF_DELAY', STORY_TEXT_BULLETS: 'URGENCY.WINDOW',
    STORY_TABLE_COMPARISON: 'URGENCY.EXPOSURE', STORY_TEXT_CONCLUSION_REASONS: 'URGENCY.WINDOW', STORY_TEXT_NEXT_ACTIONS: 'URGENCY.NO_REGRET_MOVE',
  },
  strictStop: true,
  roles: [
    { id: 'URGENCY.STATUS_QUO', labelKey: 'story.role.urgency.statusQuo', question: L('現状はどう推移しているか', 'How is the current situation evolving?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'SIZE_CONTEXT'] },
    { id: 'URGENCY.INFLECTION', labelKey: 'story.role.urgency.inflection', question: L('何が、いつ変わり始めたか', 'What changed, and when?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'GROWTH_SPEED'] },
    { id: 'URGENCY.SPREAD', labelKey: 'story.role.urgency.spread', question: L('どこまで広がっているか', 'How far has it spread?'), priority: 'REQUIRED', proofNeeds: ['SEGMENT_DIFFERENCE'], onlyWithNeeds: true },
    { id: 'URGENCY.EXPOSURE', labelKey: 'story.role.urgency.exposure', question: L('放置するとどこまで影響するか', 'What is exposed if nothing changes?'), priority: 'REQUIRED', proofNeeds: ['SIZE_CONTEXT', 'TARGET_GAP'] },
    { id: 'URGENCY.COST_OF_DELAY', labelKey: 'story.role.urgency.costOfDelay', question: L('遅れるほど何が失われるか', 'What is lost as action is delayed?'), priority: 'CONDITIONAL', proofNeeds: ['SIZE_CONTEXT', 'TARGET_GAP', 'BRIDGE'], cues: '遅れ|遅延|放置|先送り|機会損失|delay' },
    { id: 'URGENCY.WINDOW', labelKey: 'story.role.urgency.window', question: L('いつまでに動く必要があるか', 'By when does action need to happen?'), priority: 'CONDITIONAL', proofNeeds: ['OVERALL_CHANGE', 'TARGET_GAP'], presentationMode: 'TEXT', cues: 'いつまで|期限|時期|タイミング|猶予|締切|締め切り|deadline|by when' },
    { id: 'URGENCY.NO_REGRET_MOVE', labelKey: 'story.role.urgency.noRegretMove', question: L('不確実でも始められる対応は何か', 'What can be started despite uncertainty?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, cues: '今すぐできる|まず始め|不確実でも|no.?regret' },
  ],
  stopRoles: {
    RECOGNITION: ['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.SPREAD', 'URGENCY.EXPOSURE'],
    INTERPRETATION: ['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.SPREAD', 'URGENCY.EXPOSURE'],
    SELECTION: ['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.SPREAD', 'URGENCY.EXPOSURE'],
    FEASIBILITY: ['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.SPREAD', 'URGENCY.EXPOSURE', 'URGENCY.COST_OF_DELAY', 'URGENCY.WINDOW'],
    COMMITMENT: ['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION', 'URGENCY.SPREAD', 'URGENCY.EXPOSURE', 'URGENCY.COST_OF_DELAY', 'URGENCY.WINDOW', 'URGENCY.NO_REGRET_MOVE'],
  },
  proofNeedRoles: {
    OVERALL_CHANGE: 'URGENCY.STATUS_QUO', CURRENT_MIX: 'URGENCY.STATUS_QUO',
    GROWTH_SPEED: 'URGENCY.INFLECTION', SEGMENT_DIFFERENCE: 'URGENCY.SPREAD', MIX_CHANGE: 'URGENCY.INFLECTION',
    SIZE_CONTEXT: 'URGENCY.EXPOSURE', TARGET_GAP: 'URGENCY.EXPOSURE', RANKING: 'URGENCY.EXPOSURE', ITEM_SHARE: 'URGENCY.EXPOSURE', POSITIONING: 'URGENCY.EXPOSURE',
    CONTRIBUTION: 'URGENCY.COST_OF_DELAY', BRIDGE: 'URGENCY.COST_OF_DELAY', SECOND_METRIC: 'URGENCY.COST_OF_DELAY', RELATIONSHIP: 'URGENCY.COST_OF_DELAY',
  },
  sharedProofNeedRoles: {
    OVERALL_CHANGE: ['URGENCY.STATUS_QUO', 'URGENCY.INFLECTION'],
    SIZE_CONTEXT: ['URGENCY.EXPOSURE', 'URGENCY.COST_OF_DELAY'],
    TARGET_GAP: ['URGENCY.EXPOSURE', 'URGENCY.WINDOW'],
  },
  defaultProofNeeds: {},
} as const satisfies RouteDef;

const PROOF_ROUTE = {
  id: 'PROOF',
  roleQuestionFirst: true,
  primaryYes: ['INTERPRETATION', 'FEASIBILITY'],
  outlineRoles: {
    STORY_TABLE_KPI: 'PROOF.EVIDENCE', STORY_TEXT_NUMBERS: 'PROOF.EVIDENCE', GRAPH_TREND: 'PROOF.EVIDENCE',
    STORY_TABLE_DELTA: 'PROOF.EVIDENCE', STORY_TABLE_HEATMAP: 'PROOF.BOUNDARY', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'PROOF.TEST',
    STORY_TABLE_BASIC: 'PROOF.BOUNDARY', STORY_TEXT_TWO_COLUMN: 'PROOF.COUNTER_EVIDENCE', STORY_TEXT_BULLETS: 'PROOF.BOUNDARY',
    STORY_TABLE_COMPARISON: 'PROOF.COUNTER_EVIDENCE', STORY_TEXT_CONCLUSION_REASONS: 'PROOF.CLAIM', STORY_TEXT_NEXT_ACTIONS: 'PROOF.EXPERIMENT',
  },
  strictStop: true,
  roles: [
    { id: 'PROOF.CLAIM', labelKey: 'story.role.proof.claim', question: L('何を確かめたいか', 'What claim needs testing?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true },
    { id: 'PROOF.TEST', labelKey: 'story.role.proof.test', question: L('何が確認できれば主張を支持できるか', 'What test would support the claim?'), priority: 'REQUIRED', proofNeeds: ['RELATIONSHIP', 'SECOND_METRIC', 'TARGET_GAP'] },
    { id: 'PROOF.EVIDENCE', labelKey: 'story.role.proof.evidence', question: L('主張を支持する事実は何か', 'What evidence supports the claim?'), priority: 'REQUIRED', proofNeeds: ['RELATIONSHIP', 'SECOND_METRIC', 'TARGET_GAP'] },
    { id: 'PROOF.COUNTER_EVIDENCE', labelKey: 'story.role.proof.counterEvidence', question: L('主張に反する事実は何か', 'What evidence weighs against the claim?'), priority: 'CONDITIONAL', proofNeeds: ['SECOND_METRIC', 'SEGMENT_DIFFERENCE', 'TARGET_GAP'], cues: '反対材料|反証|反例|否定|当てはまらない|counter' },
    { id: 'PROOF.BOUNDARY', labelKey: 'story.role.proof.boundary', question: L('どこまでなら主張が成り立つか', 'Where does the claim hold, and where does it not?'), priority: 'REQUIRED', proofNeeds: ['SEGMENT_DIFFERENCE', 'POSITIONING'] },
    { id: 'PROOF.EXPERIMENT', labelKey: 'story.role.proof.experiment', question: L('次に何を試せば不確実性を減らせるか', 'What experiment would reduce uncertainty next?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, cues: '次の検証|次に必要な検証|必要な検証|追加検証|追加で確認|追加の検証|検証すべき|交絡|対照群|段階導入|実験|パイロット|試行|A/?Bテスト|experiment' },
    { id: 'PROOF.SCALE_DECISION', labelKey: 'story.role.proof.scaleDecision', question: L('何を満たせば展開するか', 'What must be true before scaling?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP'], presentationMode: 'TEXT', userAuthored: true, cues: '展開|拡大の判断|本格導入|scale' },
  ],
  stopRoles: {
    RECOGNITION: ['PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.BOUNDARY'],
    INTERPRETATION: ['PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.BOUNDARY'],
    SELECTION: ['PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.BOUNDARY'],
    FEASIBILITY: ['PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.COUNTER_EVIDENCE', 'PROOF.BOUNDARY', 'PROOF.EXPERIMENT', 'PROOF.SCALE_DECISION'],
    COMMITMENT: ['PROOF.CLAIM', 'PROOF.TEST', 'PROOF.EVIDENCE', 'PROOF.COUNTER_EVIDENCE', 'PROOF.BOUNDARY', 'PROOF.EXPERIMENT', 'PROOF.SCALE_DECISION'],
  },
  proofNeedRoles: {
    RELATIONSHIP: 'PROOF.TEST', SECOND_METRIC: 'PROOF.TEST', TARGET_GAP: 'PROOF.TEST',
    SEGMENT_DIFFERENCE: 'PROOF.BOUNDARY', POSITIONING: 'PROOF.BOUNDARY',
    OVERALL_CHANGE: 'PROOF.EVIDENCE', GROWTH_SPEED: 'PROOF.EVIDENCE', CONTRIBUTION: 'PROOF.EVIDENCE', CURRENT_MIX: 'PROOF.EVIDENCE',
    MIX_CHANGE: 'PROOF.EVIDENCE', SIZE_CONTEXT: 'PROOF.EVIDENCE', RANKING: 'PROOF.EVIDENCE', ITEM_SHARE: 'PROOF.EVIDENCE', BRIDGE: 'PROOF.EVIDENCE',
  },
  sharedProofNeedRoles: {
    RELATIONSHIP: ['PROOF.TEST', 'PROOF.EVIDENCE'], SECOND_METRIC: ['PROOF.TEST', 'PROOF.COUNTER_EVIDENCE'],
    TARGET_GAP: ['PROOF.TEST', 'PROOF.COUNTER_EVIDENCE'], SEGMENT_DIFFERENCE: ['PROOF.BOUNDARY', 'PROOF.COUNTER_EVIDENCE'],
  },
  defaultProofNeeds: {},
} as const satisfies RouteDef;

const BUSINESS_CASE_ROUTE = {
  id: 'BUSINESS_CASE',
  roleQuestionFirst: true,
  primaryYes: ['FEASIBILITY', 'COMMITMENT'],
  outlineRoles: {
    STORY_TABLE_KPI: 'BUSINESS_CASE.VALUE_POOL', STORY_TEXT_NUMBERS: 'BUSINESS_CASE.VALUE_POOL', GRAPH_TREND: 'BUSINESS_CASE.VALUE_POOL',
    STORY_TABLE_DELTA: 'BUSINESS_CASE.ECONOMICS', STORY_TABLE_HEATMAP: 'BUSINESS_CASE.SCENARIOS', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'BUSINESS_CASE.RISKS',
    STORY_TABLE_BASIC: 'BUSINESS_CASE.ASSUMPTIONS', STORY_TEXT_TWO_COLUMN: 'BUSINESS_CASE.SCENARIOS', STORY_TEXT_BULLETS: 'BUSINESS_CASE.ASSUMPTIONS',
    STORY_TABLE_COMPARISON: 'BUSINESS_CASE.ECONOMICS', STORY_TEXT_CONCLUSION_REASONS: 'BUSINESS_CASE.OPPORTUNITY', STORY_TEXT_NEXT_ACTIONS: 'BUSINESS_CASE.ASK',
  },
  strictStop: true,
  roles: [
    { id: 'BUSINESS_CASE.OPPORTUNITY', labelKey: 'story.role.businessCase.opportunity', question: L('どんな機会・課題へ投資するか', 'What opportunity or problem is being addressed?'), priority: 'REQUIRED', proofNeeds: ['SIZE_CONTEXT', 'TARGET_GAP'], singleSlide: true },
    { id: 'BUSINESS_CASE.VALUE_POOL', labelKey: 'story.role.businessCase.valuePool', question: L('獲得可能な価値はどの程度か', 'How much value may be addressable?'), priority: 'REQUIRED', proofNeeds: ['SIZE_CONTEXT', 'GROWTH_SPEED', 'SECOND_METRIC'], singleSlide: true },
    { id: 'BUSINESS_CASE.ECONOMICS', labelKey: 'story.role.businessCase.economics', question: L('費用・便益・回収はどう見込むか', 'What are the costs, benefits, and payback?'), priority: 'REQUIRED', proofNeeds: ['BRIDGE', 'SECOND_METRIC'], cues: '採算|費用|回収|投資対効果|roi|payback' },
    { id: 'BUSINESS_CASE.ASSUMPTIONS', labelKey: 'story.role.businessCase.assumptions', question: L('判断を左右する前提は何か', 'Which assumptions drive the case?'), priority: 'REQUIRED', proofNeeds: ['SECOND_METRIC', 'TARGET_GAP'], section: 'SUPPORTING', singleSlide: true, cues: '前提|assumption' },
    { id: 'BUSINESS_CASE.SCENARIOS', labelKey: 'story.role.businessCase.scenarios', question: L('前提が変わると結果はどう動くか', 'How do outcomes change under different assumptions?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', cues: 'シナリオ|感度|scenario' },
    { id: 'BUSINESS_CASE.RISKS', labelKey: 'story.role.businessCase.risks', question: L('下振れ要因と影響は何か', 'What could go wrong, and with what impact?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', cues: 'リスク|下振れ|risk' },
    { id: 'BUSINESS_CASE.STAGE_GATES', labelKey: 'story.role.businessCase.stageGates', question: L('どの条件で次段階へ進むか', 'What conditions allow the next stage?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP'], presentationMode: 'TEXT', userAuthored: true, cues: '段階|ゲート|stage' },
    { id: 'BUSINESS_CASE.ASK', labelKey: 'story.role.businessCase.ask', question: L('何を承認してほしいか', 'What approval is requested?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, noForcedSlide: true },
  ],
  stopRoles: {
    RECOGNITION: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL'],
    INTERPRETATION: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL'],
    SELECTION: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL'],
    FEASIBILITY: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL', 'BUSINESS_CASE.ECONOMICS', 'BUSINESS_CASE.ASSUMPTIONS'],
    COMMITMENT: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL', 'BUSINESS_CASE.ECONOMICS', 'BUSINESS_CASE.ASSUMPTIONS', 'BUSINESS_CASE.SCENARIOS', 'BUSINESS_CASE.RISKS', 'BUSINESS_CASE.STAGE_GATES', 'BUSINESS_CASE.ASK'],
  },
  proofNeedRoles: {
    TARGET_GAP: 'BUSINESS_CASE.OPPORTUNITY', SIZE_CONTEXT: 'BUSINESS_CASE.OPPORTUNITY',
    GROWTH_SPEED: 'BUSINESS_CASE.VALUE_POOL', OVERALL_CHANGE: 'BUSINESS_CASE.VALUE_POOL', CURRENT_MIX: 'BUSINESS_CASE.VALUE_POOL', RANKING: 'BUSINESS_CASE.VALUE_POOL', ITEM_SHARE: 'BUSINESS_CASE.VALUE_POOL',
    BRIDGE: 'BUSINESS_CASE.ECONOMICS', CONTRIBUTION: 'BUSINESS_CASE.ECONOMICS', SECOND_METRIC: 'BUSINESS_CASE.ECONOMICS',
    RELATIONSHIP: 'BUSINESS_CASE.ASSUMPTIONS', POSITIONING: 'BUSINESS_CASE.ASSUMPTIONS', SEGMENT_DIFFERENCE: 'BUSINESS_CASE.ASSUMPTIONS', MIX_CHANGE: 'BUSINESS_CASE.ASSUMPTIONS',
  },
  sharedProofNeedRoles: {
    SIZE_CONTEXT: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.VALUE_POOL'],
    SECOND_METRIC: ['BUSINESS_CASE.ECONOMICS', 'BUSINESS_CASE.ASSUMPTIONS'],
    TARGET_GAP: ['BUSINESS_CASE.OPPORTUNITY', 'BUSINESS_CASE.STAGE_GATES'],
  },
  defaultProofNeeds: {},
} as const satisfies RouteDef;

const TRANSFORMATION_ROUTE = {
  id: 'TRANSFORMATION',
  roleQuestionFirst: true,
  primaryYes: ['FEASIBILITY', 'COMMITMENT'],
  outlineRoles: {
    STORY_TABLE_KPI: 'TRANSFORMATION.BASELINE', STORY_TEXT_NUMBERS: 'TRANSFORMATION.BASELINE', GRAPH_TREND: 'TRANSFORMATION.BASELINE',
    STORY_TABLE_DELTA: 'TRANSFORMATION.GAP', STORY_TABLE_HEATMAP: 'TRANSFORMATION.INITIATIVES', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'TRANSFORMATION.INITIATIVES',
    STORY_TABLE_BASIC: 'TRANSFORMATION.INITIATIVES', STORY_TEXT_TWO_COLUMN: 'TRANSFORMATION.SEQUENCE', STORY_TEXT_BULLETS: 'TRANSFORMATION.OWNERSHIP',
    STORY_TABLE_COMPARISON: 'TRANSFORMATION.GAP', STORY_TEXT_CONCLUSION_REASONS: 'TRANSFORMATION.AMBITION', STORY_TEXT_NEXT_ACTIONS: 'TRANSFORMATION.SEQUENCE',
  },
  strictStop: true,
  roles: [
    { id: 'TRANSFORMATION.AMBITION', labelKey: 'story.role.transformation.ambition', question: L('何をどこまで変えるか', 'What should change, and by how much?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true },
    { id: 'TRANSFORMATION.BASELINE', labelKey: 'story.role.transformation.baseline', question: L('現在地はどこか', 'What is the current baseline?'), priority: 'REQUIRED', proofNeeds: ['OVERALL_CHANGE', 'SIZE_CONTEXT'] },
    { id: 'TRANSFORMATION.GAP', labelKey: 'story.role.transformation.gap', question: L('目指す姿まで何が足りないか', 'What gap separates the baseline from the ambition?'), priority: 'REQUIRED', proofNeeds: ['TARGET_GAP', 'BRIDGE'] },
    { id: 'TRANSFORMATION.INITIATIVES', labelKey: 'story.role.transformation.initiatives', question: L('どの施策でGapを埋めるか', 'Which initiatives could close the gap?'), priority: 'REQUIRED', proofNeeds: ['CONTRIBUTION', 'POSITIONING'], presentationMode: 'TEXT', userAuthored: true },
    { id: 'TRANSFORMATION.SEQUENCE', labelKey: 'story.role.transformation.sequence', question: L('何をどの順で進めるか', 'In what sequence should the work proceed?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true },
    { id: 'TRANSFORMATION.OWNERSHIP', labelKey: 'story.role.transformation.ownership', question: L('誰が何に責任を持つか', 'Who owns each part?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, cues: '担当|責任者|オーナー|体制|誰が|ownership|owner' },
    { id: 'TRANSFORMATION.MILESTONES', labelKey: 'story.role.transformation.milestones', question: L('どの節目で進捗を確かめるか', 'At which milestones will progress be checked?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP'], presentationMode: 'TEXT', userAuthored: true, cues: '節目|マイルストーン|中間目標|進捗確認|milestone' },
    { id: 'TRANSFORMATION.GOVERNANCE', labelKey: 'story.role.transformation.governance', question: L('どのように判断・修正を続けるか', 'How will decisions and course corrections be governed?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, cues: '意思決定|軌道修正|ガバナンス|推進方法|governance' },
  ],
  stopRoles: {
    RECOGNITION: ['TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP'],
    INTERPRETATION: ['TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP'],
    SELECTION: ['TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP'],
    FEASIBILITY: ['TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP', 'TRANSFORMATION.INITIATIVES', 'TRANSFORMATION.SEQUENCE'],
    COMMITMENT: ['TRANSFORMATION.AMBITION', 'TRANSFORMATION.BASELINE', 'TRANSFORMATION.GAP', 'TRANSFORMATION.INITIATIVES', 'TRANSFORMATION.SEQUENCE', 'TRANSFORMATION.OWNERSHIP', 'TRANSFORMATION.MILESTONES', 'TRANSFORMATION.GOVERNANCE'],
  },
  proofNeedRoles: {
    TARGET_GAP: 'TRANSFORMATION.GAP',
    OVERALL_CHANGE: 'TRANSFORMATION.BASELINE', SIZE_CONTEXT: 'TRANSFORMATION.BASELINE', GROWTH_SPEED: 'TRANSFORMATION.BASELINE', CURRENT_MIX: 'TRANSFORMATION.BASELINE',
    BRIDGE: 'TRANSFORMATION.GAP', MIX_CHANGE: 'TRANSFORMATION.GAP', SEGMENT_DIFFERENCE: 'TRANSFORMATION.GAP', SECOND_METRIC: 'TRANSFORMATION.GAP',
    CONTRIBUTION: 'TRANSFORMATION.INITIATIVES', POSITIONING: 'TRANSFORMATION.INITIATIVES', RELATIONSHIP: 'TRANSFORMATION.INITIATIVES', RANKING: 'TRANSFORMATION.INITIATIVES', ITEM_SHARE: 'TRANSFORMATION.INITIATIVES',
  },
  sharedProofNeedRoles: {},
  defaultProofNeeds: {},
} as const satisfies RouteDef;

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
  roleQuestionFirst: true,
  primaryYes: ['SELECTION', 'COMMITMENT'],
  outlineRoles: {
    STORY_TABLE_KPI: 'CHOICE.CRITERIA', STORY_TEXT_NUMBERS: 'CHOICE.CRITERIA', GRAPH_TREND: 'CHOICE.CRITERIA',
    STORY_TABLE_DELTA: 'CHOICE.TRADE_OFFS', STORY_TABLE_HEATMAP: 'CHOICE.TRADE_OFFS', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'CHOICE.TRADE_OFFS',
    STORY_TABLE_BASIC: 'CHOICE.OPTIONS', STORY_TEXT_TWO_COLUMN: 'CHOICE.TRADE_OFFS', STORY_TEXT_BULLETS: 'CHOICE.OPTIONS',
    STORY_TABLE_COMPARISON: 'CHOICE.TRADE_OFFS', STORY_TEXT_CONCLUSION_REASONS: 'CHOICE.RECOMMENDATION', STORY_TEXT_NEXT_ACTIONS: 'CHOICE.COMMITMENT',
  },
  strictStop: true,
  roles: [
    { id: 'CHOICE.DECISION', labelKey: 'story.role.choice.decision', question: L('何を選ぶ必要があるか', 'What needs to be chosen?'), priority: 'REQUIRED', proofNeeds: [], settingOnly: true },
    { id: 'CHOICE.CRITERIA', labelKey: 'story.role.choice.criteria', question: L('何を基準に比べるか', 'What criteria should be used?'), priority: 'REQUIRED', proofNeeds: ['SECOND_METRIC', 'TARGET_GAP', 'POSITIONING'] },
    { id: 'CHOICE.OPTIONS', labelKey: 'story.role.choice.options', question: L('比べる選択肢は何か', 'What options are being compared?'), priority: 'REQUIRED', proofNeeds: ['RANKING', 'SIZE_CONTEXT', 'POSITIONING'] },
    { id: 'CHOICE.TRADE_OFFS', labelKey: 'story.role.choice.tradeOffs', question: L('選択肢ごとの強み・弱みは何か', 'What are the trade-offs of each option?'), priority: 'REQUIRED', proofNeeds: ['SECOND_METRIC', 'POSITIONING', 'TARGET_GAP'] },
    { id: 'CHOICE.RECOMMENDATION', labelKey: 'story.role.choice.recommendation', question: L('どの案を選ぶか', 'Which option do you recommend?'), priority: 'REQUIRED', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, noForcedSlide: true },
    { id: 'CHOICE.CONDITIONS', labelKey: 'story.role.choice.conditions', question: L('その選択が成立する条件は何か', 'Under what conditions does the choice hold?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP', 'SECOND_METRIC'], cues: '成立条件|前提条件|条件付き' },
    { id: 'CHOICE.COMMITMENT', labelKey: 'story.role.choice.commitment', question: L('何をいつ決めるか', 'What will be committed, and when?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true },
  ],
  stopRoles: {
    RECOGNITION: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS'],
    INTERPRETATION: ['CHOICE.CRITERIA', 'CHOICE.OPTIONS', 'CHOICE.TRADE_OFFS'],
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
    { id: 'DIAGNOSIS.DRIVER', labelKey: 'story.role.diagnosis.driver', question: L('何が増減へ寄与し、何と関連しているか', 'What contributes to the change or moves with it?'), priority: 'CONDITIONAL', proofNeeds: ['CONTRIBUTION', 'BRIDGE', 'RELATIONSHIP', 'SECOND_METRIC'], singleSlide: true },
    { id: 'DIAGNOSIS.ROOT_CAUSE', labelKey: 'story.role.diagnosis.rootCause', question: L('原因と言えるには何を追加で確かめる必要があるか', 'What else must be tested before calling it a cause?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', coachingOnSignal: 'ROOT_CAUSE', cues: '原因と言え|原因として|原因の検証|因果|追加で確かめ|確かめる必要|root.?cause' },
    { id: 'DIAGNOSIS.ACTIONABILITY', labelKey: 'story.role.diagnosis.actionability', question: L('どこまで再現・修正・緩和できるか', 'What can be replicated, corrected, or mitigated?'), priority: 'CONDITIONAL', proofNeeds: ['TARGET_GAP', 'POSITIONING'], presentationMode: 'TEXT' },
    { id: 'DIAGNOSIS.ACTION', labelKey: 'story.role.diagnosis.action', question: L('次に何を試す・確認するか', 'What should be tried or checked next?'), priority: 'CONDITIONAL', proofNeeds: [], presentationMode: 'TEXT', userAuthored: true, noForcedSlide: true, cues: '次の検証|次に確認|次に何を|次の打ち手' },
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
export const STORY_ROUTES = { ANSWER_FIRST: ANSWER_FIRST_ROUTE, AIMED: AIMED_ROUTE, DIAGNOSIS: DIAGNOSIS_ROUTE, CHOICE: CHOICE_ROUTE, URGENCY: URGENCY_ROUTE, PROOF: PROOF_ROUTE, BUSINESS_CASE: BUSINESS_CASE_ROUTE, TRANSFORMATION: TRANSFORMATION_ROUTE } as const satisfies Partial<Record<StoryRouteId, RouteDef>>;

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
