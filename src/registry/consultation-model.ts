import { z } from 'zod';

/**
 * Stage 3: 5層相談分析モデル
 * 意思決定ジョブ → ビジネス質問 → 分析関係 → データトポロジー → 提示形式
 */

// Layer 1: Decision Job
export const DECISION_JOB_IDS = [
  'understand-status',
  'identify-issue',
  'evaluate-options',
  'monitor-performance',
  'optimize-decision'
] as const;
export type DecisionJobId = (typeof DECISION_JOB_IDS)[number];

// Layer 2: Business Question
export const BUSINESS_QUESTION_IDS = [
  'what-happened',
  'why-did-it-happen',
  'what-should-we-do',
  'how-well-are-we-doing',
  'what-will-happen'
] as const;
export type BusinessQuestionId = (typeof BUSINESS_QUESTION_IDS)[number];

// Layer 3: Analytical Relationship
export const ANALYTICAL_RELATIONSHIP_IDS = [
  'composition',
  'comparison',
  'trend',
  'correlation',
  'distribution'
] as const;
export type AnalyticalRelationshipId = (typeof ANALYTICAL_RELATIONSHIP_IDS)[number];

// Layer 4: Data Topology
export const DimensionProfileSchema = z.object({
  name: z.string(),
  cardinality: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  role: z.enum(['CATEGORICAL', 'TEMPORAL', 'GEOGRAPHIC']),
  hierarchy: z.boolean().default(false),
});
export type DimensionProfile = z.infer<typeof DimensionProfileSchema>;

export const MeasureProfileSchema = z.object({
  name: z.string(),
  type: z.enum(['ADDITIVE', 'NON_ADDITIVE', 'RATE', 'INDEX']),
  semantics: z.enum(['COUNT', 'SUM', 'AVERAGE', 'SHARE', 'DELTA']),
});
export type MeasureProfile = z.infer<typeof MeasureProfileSchema>;

// Layer 5: Presentation Form
export const ConsultationAnalysisV2Schema = z.object({
  decision_job: z.enum(DECISION_JOB_IDS).nullable().default(null),
  business_question: z.enum(BUSINESS_QUESTION_IDS).nullable().default(null),
  analytical_relationship: z.enum(ANALYTICAL_RELATIONSHIP_IDS).nullable().default(null),
  dimensions: z.array(DimensionProfileSchema).default([]),
  measures: z.array(MeasureProfileSchema).default([]),
  period_count: z.number().int().min(1).default(1),
  observed_data_stats: z.object({
    row_count: z.number().int(),
    column_count: z.number().int(),
  }).nullable().default(null),
});

export type ConsultationAnalysisV2 = z.infer<typeof ConsultationAnalysisV2Schema>;

/**
 * AI相談の既存データからV2分析を安全に変換
 * 推測データは一切追加しない（必要なら明示的に null）
 */
export function analysisFromLegacy(legacy: any): ConsultationAnalysisV2 {
  return {
    decision_job: null,
    business_question: null,
    analytical_relationship: null,
    dimensions: [],
    measures: [],
    period_count: 1,
    observed_data_stats: null,
  };
}

/**
 * 実際のデータ入力後、データトポロジーを更新
 * 観測データから導出される情報のみを記録
 */
export function topologyFromObservedData(
  rows: any[],
  columns: string[]
): Pick<ConsultationAnalysisV2, 'dimensions' | 'measures' | 'observed_data_stats'> {
  return {
    dimensions: [],
    measures: [],
    observed_data_stats: {
      row_count: rows.length,
      column_count: columns.length,
    },
  };
}
