import type { ChartTypeId, RecipeId } from './ids';
import type { StoryTemplateId } from './storyTemplates';
import { analysisFromLegacy, ConsultationAnalysisV2Schema, type ConsultationAnalysisV2 } from './consultation-model';
import type { ConsultationClassification, GoalCode } from './consultation';

/** チャート・表・言葉を同列で選ぶ、AIから独立した決定的な推薦層。 */
export const PRESENTATION_FORM_IDS = [
  'CHART', 'TABLE', 'MATRIX', 'HEATMAP_TABLE', 'KPI_SCORECARD',
  'DECISION_MATRIX', 'PROCESS', 'TIMELINE', 'TEXT', 'HYBRID',
] as const;
export type PresentationForm = (typeof PRESENTATION_FORM_IDS)[number];

export const IMPLEMENTATION_STATUS_IDS = ['SUPPORTED', 'ALTERNATIVE', 'UNSUPPORTED'] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUS_IDS)[number];

export const PRESENTATION_CANDIDATE_IDS = [
  // P0
  'MATRIX_DELTA_SHARE', 'CROSSTAB_TABLE', 'HEATMAP_VALUE_TABLE', 'SMALL_MULTIPLES',
  // 既存表現への接続
  'MIX_PAIR_SHARE', 'TREND_SHARE', 'TREND_LINE', 'DELTA_TABLE', 'BAR_RANK', 'SCATTER',
  // P1（語彙には登録するが、未実装を明示する）
  'HISTOGRAM', 'BOX_PLOT', 'DOT_PLOT', 'RANGE_PLOT', 'SCENARIO_TABLE',
  'FORECAST_RANGE', 'FAN_CHART', 'TORNADO', 'DECISION_MATRIX', 'RISK_MATRIX',
  'ROADMAP', 'MILESTONE_TABLE',
] as const;
export type PresentationCandidateId = (typeof PRESENTATION_CANDIDATE_IDS)[number];

export type PresentationTarget =
  | { kind: 'recipe'; id: RecipeId }
  | { kind: 'template'; id: StoryTemplateId; semanticBuilder?: 'matrix_delta_share' }
  | { kind: 'chart'; id: ChartTypeId }
  | null;

export interface PresentationCandidateDef {
  id: PresentationCandidateId;
  form: PresentationForm;
  status: ImplementationStatus;
  target: PresentationTarget;
  phase: 'P0' | 'P1' | 'P2';
}

/**
 * 実装状態は「レジストリに語がある」ことと分ける。
 * ALTERNATIVE は、近い既存部品はあるが目的どおりの自動生成までつながっていない状態。
 */
export const PRESENTATION_CATALOG: Record<PresentationCandidateId, PresentationCandidateDef> = {
  MATRIX_DELTA_SHARE: { id: 'MATRIX_DELTA_SHARE', form: 'MATRIX', status: 'SUPPORTED', target: { kind: 'template', id: 'STORY_TABLE_BASIC', semanticBuilder: 'matrix_delta_share' }, phase: 'P0' },
  CROSSTAB_TABLE: { id: 'CROSSTAB_TABLE', form: 'MATRIX', status: 'SUPPORTED', target: { kind: 'template', id: 'STORY_TABLE_BASIC' }, phase: 'P0' },
  HEATMAP_VALUE_TABLE: { id: 'HEATMAP_VALUE_TABLE', form: 'HEATMAP_TABLE', status: 'SUPPORTED', target: { kind: 'template', id: 'STORY_TABLE_HEATMAP' }, phase: 'P0' },
  SMALL_MULTIPLES: { id: 'SMALL_MULTIPLES', form: 'CHART', status: 'ALTERNATIVE', target: { kind: 'chart', id: 'small_multiples_bar' }, phase: 'P0' },
  MIX_PAIR_SHARE: { id: 'MIX_PAIR_SHARE', form: 'CHART', status: 'SUPPORTED', target: { kind: 'recipe', id: 'MIX_PAIR_SHARE' }, phase: 'P0' },
  TREND_SHARE: { id: 'TREND_SHARE', form: 'CHART', status: 'SUPPORTED', target: { kind: 'recipe', id: 'TREND_SHARE' }, phase: 'P0' },
  TREND_LINE: { id: 'TREND_LINE', form: 'CHART', status: 'SUPPORTED', target: { kind: 'recipe', id: 'TREND_LINE' }, phase: 'P0' },
  DELTA_TABLE: { id: 'DELTA_TABLE', form: 'TABLE', status: 'SUPPORTED', target: { kind: 'template', id: 'STORY_TABLE_DELTA' }, phase: 'P0' },
  BAR_RANK: { id: 'BAR_RANK', form: 'CHART', status: 'SUPPORTED', target: { kind: 'recipe', id: 'COMP_RANK' }, phase: 'P0' },
  SCATTER: { id: 'SCATTER', form: 'CHART', status: 'SUPPORTED', target: { kind: 'recipe', id: 'REL_SCATTER' }, phase: 'P0' },
  HISTOGRAM: { id: 'HISTOGRAM', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  BOX_PLOT: { id: 'BOX_PLOT', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  DOT_PLOT: { id: 'DOT_PLOT', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  RANGE_PLOT: { id: 'RANGE_PLOT', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  SCENARIO_TABLE: { id: 'SCENARIO_TABLE', form: 'TABLE', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  FORECAST_RANGE: { id: 'FORECAST_RANGE', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  FAN_CHART: { id: 'FAN_CHART', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  TORNADO: { id: 'TORNADO', form: 'CHART', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  DECISION_MATRIX: { id: 'DECISION_MATRIX', form: 'DECISION_MATRIX', status: 'ALTERNATIVE', target: { kind: 'template', id: 'STORY_TABLE_COMPARISON' }, phase: 'P1' },
  RISK_MATRIX: { id: 'RISK_MATRIX', form: 'DECISION_MATRIX', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  ROADMAP: { id: 'ROADMAP', form: 'TIMELINE', status: 'UNSUPPORTED', target: null, phase: 'P1' },
  MILESTONE_TABLE: { id: 'MILESTONE_TABLE', form: 'TABLE', status: 'UNSUPPORTED', target: null, phase: 'P1' },
};

export interface RankedPresentation extends PresentationCandidateDef {
  rank: number;
  reasonCodes: string[];
  /** 高密度でも元データを削らず、表示だけを分ける。 */
  densityOptions?: ('TOP_N' | 'FILTER' | 'SMALL_MULTIPLES' | 'MULTIPLE_SLIDES')[];
}

export interface PresentationRecommendation {
  action: 'RECOMMEND' | 'CLARIFY';
  missingInfo: ('SHARE_BASIS')[];
  candidates: RankedPresentation[];
  excluded: PresentationCandidateId[];
  criticalThinkingNotes: string[];
}

export type ConsultationWithV2 = ConsultationClassification & { analysis_v2?: ConsultationAnalysisV2 | null };

const unique = <T,>(xs: T[]) => [...new Set(xs)];
const def = (id: PresentationCandidateId, reasonCodes: string[], densityOptions?: RankedPresentation['densityOptions']): RankedPresentation => ({
  ...PRESENTATION_CATALOG[id], rank: 0, reasonCodes, ...(densityOptions ? { densityOptions } : {}),
});

function analysisOf(c: ConsultationWithV2): ConsultationAnalysisV2 {
  if (c.analysis_v2) return ConsultationAnalysisV2Schema.parse(c.analysis_v2);
  return analysisFromLegacy(c);
}

const semanticSet = (a: ConsultationAnalysisV2) => new Set(a.measures.map((m) => m.semantic));
const relationSet = (a: ConsultationAnalysisV2) => new Set(a.analytical_relationships);
const valueSet = (a: ConsultationAnalysisV2) => new Set(a.value_semantics);
const nonTimeDimensions = (a: ConsultationAnalysisV2) => a.dimensions.filter((d) => d.role !== 'TIME');
const maxCardinality = (a: ConsultationAnalysisV2) => Math.max(0, ...nonTimeDimensions(a).map((d) => d.cardinality ?? 0));

/** Critical Thinking上の境界を、推薦とは別の定型Ruleで返す。結論やActionは生成しない。 */
export function criticalThinkingNotes(a: ConsultationAnalysisV2): string[] {
  const out: string[] = [];
  if (a.critical_thinking.causal_claim === true && a.analytical_relationships.includes('RELATIONSHIP')) {
    out.push('RELATIONSHIP_IS_NOT_CAUSATION');
  }
  if (a.data_stage === 'MIXED' || (a.analytical_relationships.includes('SCENARIO') && a.analytical_relationships.includes('CHANGE_OVER_TIME'))) {
    out.push('SEPARATE_ACTUAL_FORECAST_SCENARIO');
  }
  if (a.critical_thinking.assumptions.length) out.push('SHOW_ASSUMPTIONS');
  if (a.critical_thinking.counterevidence.length || a.critical_thinking.alternative_interpretations.length) out.push('SHOW_DECISION_CHANGING_ALTERNATIVES');
  if (a.critical_thinking.conclusion_kind === 'PROPOSED') out.push('DO_NOT_PRESENT_PROPOSAL_AS_EVIDENCE');
  return out;
}

/**
 * AIが返した分類から、表を含む表現を決める。
 * 文言のキーワードではなく、期間・ディメンション・指標意味・必要値・密度だけを見る。
 */
export function rankPresentations(c: ConsultationWithV2): PresentationRecommendation {
  const a = analysisOf(c);
  const rel = relationSet(a);
  const sem = semanticSet(a);
  const values = valueSet(a);
  const dims = nonTimeDimensions(a);
  const periods = a.period_count ?? (c.time_mode === 'TWO_POINT' ? 2 : null);
  const cells = a.cell_count ?? dims.reduce((n, d) => n * (d.cardinality ?? 1), 1);
  const dense = cells >= 24 || maxCardinality(a) > 8;
  const exact = a.exact_values === true || c.needs_exact_values === true;
  const levelAndDelta = values.has('LEVEL') && values.has('DELTA');
  const shareOrRate = sem.has('SHARE') || sem.has('RATE');
  const out: RankedPresentation[] = [];
  const excluded: PresentationCandidateId[] = [];

  const finish = (action: PresentationRecommendation['action'] = 'RECOMMEND', missingInfo: PresentationRecommendation['missingInfo'] = []): PresentationRecommendation => ({
    action,
    missingInfo,
    candidates: unique(out.map((x) => x.id)).map((id, i) => ({ ...out.find((x) => x.id === id)!, rank: i + 1 })),
    excluded: unique(excluded),
    criticalThinkingNotes: criticalThinkingNotes(a),
  });

  // P0最優先：2時点×2非時間ディメンション×シェア/率×水準+増減×正確な一覧。
  if (periods === 2 && dims.length >= 2 && shareOrRate && levelAndDelta && (exact || rel.has('CROSS_TAB'))) {
    if (sem.has('SHARE') && !a.share_basis?.trim()) return finish('CLARIFY', ['SHARE_BASIS']);
    out.push(def('MATRIX_DELTA_SHARE', ['TWO_POINT', 'TWO_DIMENSIONS', 'LEVEL_AND_DELTA', exact ? 'EXACT_VALUES' : 'CROSS_TAB'], dense ? ['TOP_N', 'FILTER', 'SMALL_MULTIPLES', 'MULTIPLE_SLIDES'] : undefined));
    if (dense) out.push(def('HEATMAP_VALUE_TABLE', ['HIGH_DENSITY', 'PATTERN_SCAN'], ['FILTER', 'MULTIPLE_SLIDES']));
    out.push(def('CROSSTAB_TABLE', ['TWO_DIMENSIONS', 'EXACT_VALUES']));
    excluded.push('TREND_LINE');
    return finish();
  }

  // 分布は順位に縮約しない。現行に無い表現も未対応として返す。
  if (rel.has('DISTRIBUTION')) {
    out.push(def('BOX_PLOT', ['DISTRIBUTION', 'OUTLIERS']));
    out.push(def('HISTOGRAM', ['DISTRIBUTION', 'FREQUENCY']));
    out.push(def('DOT_PLOT', ['DISTRIBUTION', 'INDIVIDUAL_VALUES']));
    excluded.push('BAR_RANK');
    return finish();
  }

  // Scenarioと不確実性は、過去実績の通常線に縮約しない。
  if (rel.has('SCENARIO') || rel.has('UNCERTAINTY')) {
    out.push(def('SCENARIO_TABLE', ['SCENARIO', 'SEPARATE_CASES']));
    if (rel.has('UNCERTAINTY')) out.push(def('FORECAST_RANGE', ['UNCERTAINTY', 'FORECAST_RANGE']), def('FAN_CHART', ['UNCERTAINTY', 'MULTIPLE_INTERVALS']));
    excluded.push('TREND_LINE');
    return finish();
  }

  // 2つの非時間軸は、率を足し上げず、値を読めるクロス表を優先する。
  if (dims.length >= 2 && (exact || rel.has('CROSS_TAB') || sem.has('MARGIN') || sem.has('RATE'))) {
    out.push(def('CROSSTAB_TABLE', ['TWO_DIMENSIONS', 'EXACT_VALUES']));
    out.push(def('HEATMAP_VALUE_TABLE', ['TWO_DIMENSIONS', dense ? 'HIGH_DENSITY' : 'PATTERN_SCAN'], dense ? ['FILTER', 'MULTIPLE_SLIDES'] : undefined));
    if (dense) out.push(def('SMALL_MULTIPLES', ['HIGH_DENSITY', 'KEEP_DIMENSIONS'], ['FILTER', 'MULTIPLE_SLIDES']));
    if (a.measures.some((m) => m.additivity === 'NON_ADDITIVE') || sem.has('MARGIN') || sem.has('RATE')) excluded.push('TREND_SHARE', 'MIX_PAIR_SHARE');
    return finish();
  }

  // 1ディメンションの2時点構成比較。2次元マトリックスにはしない。
  if (periods === 2 && dims.length <= 1 && sem.has('SHARE')) {
    if (!a.share_basis?.trim()) return finish('CLARIFY', ['SHARE_BASIS']);
    out.push(def('MIX_PAIR_SHARE', ['TWO_POINT', 'ONE_DIMENSION', 'PART_TO_WHOLE']));
    if (levelAndDelta || exact) out.push(def('DELTA_TABLE', ['LEVEL_AND_DELTA', 'EXACT_VALUES']));
    excluded.push('MATRIX_DELTA_SHARE', 'TREND_LINE');
    return finish();
  }

  // 3時点以上の構成軌跡は100%積み上げ。折れ線は特定1項目に絞る時だけ。
  if ((periods ?? 0) >= 3 && sem.has('SHARE')) {
    out.push(def('TREND_SHARE', ['THREE_PLUS_PERIODS', 'PART_TO_WHOLE']));
    if (a.focused_item_count === 1) out.push(def('TREND_LINE', ['SINGLE_ITEM_FOCUS', 'THREE_PLUS_PERIODS']));
    else excluded.push('TREND_LINE');
    return finish();
  }

  if (rel.has('RELATIONSHIP')) out.push(def('SCATTER', ['RELATIONSHIP']));
  else if (rel.has('RANKING') || rel.has('MAGNITUDE')) out.push(def('BAR_RANK', ['MAGNITUDE_OR_RANKING']));
  else if (rel.has('CHANGE_OVER_TIME') && (periods ?? 0) >= 3) out.push(def('TREND_LINE', ['THREE_PLUS_PERIODS', 'CHANGE_OVER_TIME']));
  else if (rel.has('CROSS_TAB')) out.push(def('CROSSTAB_TABLE', ['CROSS_TAB']));
  return finish();
}

/** 互換テストや保存移行で使うための、primary_goalだけの最小分類。 */
export const legacyClassification = (primary_goal: GoalCode): Pick<ConsultationClassification, 'primary_goal'> => ({ primary_goal });

