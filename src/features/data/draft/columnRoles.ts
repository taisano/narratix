import { z } from 'zod';

/**
 * 実データ下書きの「列対応」（docs/data-driven-draft-design.md 4章）。
 * 列の意味だけを持ち、チャートの名前は持たない。同じ列対応から、候補（折れ線・縦棒・表・散布図…）をコードが作る。
 * X・Y・サイズは列の恒久的な役割ではなく、候補ごとの割り当て（CandidateBinding）。
 */

export const COLUMN_ROLES = [
  'item',        // 行の名前（国・商品・顧客など）
  'time',        // 時間（縦に並ぶ年・月、または横に並ぶ期間の見出し）
  'series',      // 行を系列に分ける文字の列（縦持ち：月・商品・実績 の「商品」）
  'seriesValue', // それぞれが1つの系列である数値の列（横持ち：月×国 の「国」の列）
  'group',       // グループ（地域・分類。並べ替えや色分け）
  'metric',      // 数値の指標（値の意味は valueKind）
  'compare',     // 比べる側の水準の列（予算・計画・前年の水準など）。compareOf が必須
  'unused',
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** 値の意味。差や率を水準と取り違えないための印 */
export const VALUE_KINDS = ['level', 'deltaAbsolute', 'deltaPoint', 'growthRate'] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

export const COMPARE_KINDS = ['priorYear', 'priorPeriod', 'budget', 'plan', 'target', 'forecast', 'other'] as const;
export type CompareKind = (typeof COMPARE_KINDS)[number];

export const PERIOD_KINDS = ['month', 'quarter', 'fiscalYear', 'year', 'date', 'unknown'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

const Col = z.number().int().min(0).max(999);

/** 時間の定義：期間が縦（rows：1列に並ぶ）か横（columns：複数列の見出しに並ぶ）か */
export const TimeDefSchema = z.object({
  orientation: z.enum(['rows', 'columns']),
  /** rows＝期間が入っている列（1つ）。columns＝見出しが期間である列（2つ以上） */
  at: z.array(Col).min(1).max(200),
  periodKind: z.enum(PERIOD_KINDS),
}).strict();
export type TimeDef = z.infer<typeof TimeDefSchema>;

export const AssignmentSchema = z.object({
  col: Col,
  role: z.enum(COLUMN_ROLES),
  /** metric・seriesValue・compare の値の意味。無ければ level */
  valueKind: z.enum(VALUE_KINDS).optional(),
  unit: z.string().max(20).optional(),
  compareKind: z.enum(COMPARE_KINDS).optional(),
  /** compare の比べる相手（水準の metric の列）。相手の列が実在する時だけ compare を使う */
  compareOf: Col.optional(),
}).strict();
export type Assignment = z.infer<typeof AssignmentSchema>;

/** 差分から水準を逆算した値。ユーザーが確認するまで候補に使わない */
export const DerivedSpecSchema = z.object({
  kind: z.literal('priorLevelFromDelta'),
  level: Col,
  delta: Col,
  confirmed: z.boolean(),
}).strict();
export type DerivedSpec = z.infer<typeof DerivedSpecSchema>;

/** AI が返してよいもの（列番号と役割だけ。数値や項目名は持てない） */
export const AiRoleResponseSchema = z.object({
  version: z.literal(1),
  time: TimeDefSchema.optional(),
  assignments: z.array(AssignmentSchema).max(200),
  /** 主指標（任意）。質問に合う指標の列 */
  primaryMetric: Col.optional(),
  /** 候補ごとの割り当ての手がかり（恒久的な役割ではない） */
  hints: z.object({ secondaryMetric: Col.optional(), scaleMetric: Col.optional() }).strict().optional(),
  notes: z.array(z.string().max(200)).max(5).optional(),
}).strict();
export type AiRoleResponse = z.infer<typeof AiRoleResponseSchema>;

export const ColumnRoleMapSchema = AiRoleResponseSchema.extend({
  derived: z.array(DerivedSpecSchema).max(20).optional(),
  /** 誰が決めたか：ユーザーの指定は常に優先 */
  source: z.enum(['ai', 'rules', 'user']),
}).strict();
export type ColumnRoleMap = z.infer<typeof ColumnRoleMapSchema>;

/** 候補ごとの割り当て（散布図・バブルなど）。共通の列対応は変えない */
export interface CandidateBinding {
  primary?: number;
  x?: number;
  y?: number;
  size?: number;
}

const ROLE_COLS = (m: { assignments: Assignment[] }, ...roles: ColumnRole[]) =>
  m.assignments.filter((a) => roles.includes(a.role)).map((a) => a.col);
export const kindOf = (a: Assignment): ValueKind => a.valueKind ?? 'level';

/**
 * 主指標：AI の指定が有効（指標の列）ならそれ。無い・不正なら元の列順で最初の水準指標。
 * 水準の指標が無い時だけ、最初の指標（理由は呼び出し側が notes に残す）
 */
export function primaryMetricOf(map: Pick<AiRoleResponse, 'assignments' | 'primaryMetric'>): number | null {
  const metrics = map.assignments.filter((a) => a.role === 'metric' || a.role === 'seriesValue');
  if (map.primaryMetric != null && metrics.some((a) => a.col === map.primaryMetric)) return map.primaryMetric;
  const sorted = [...metrics].sort((a, b) => a.col - b.col);
  return (sorted.find((a) => kindOf(a) === 'level') ?? sorted[0])?.col ?? null;
}

/** 関係（散布図・バブル）の割り当て。X＝主指標、Y＝第2指標、サイズ＝規模指標。足りなければ列順で補う */
export function relationBinding(map: AiRoleResponse): CandidateBinding | null {
  const metrics = map.assignments.filter((a) => a.role === 'metric').sort((a, b) => a.col - b.col);
  const valid = (c?: number) => (c != null && metrics.some((a) => a.col === c) ? c : undefined);
  const primary = primaryMetricOf(map);
  if (primary == null || metrics.length < 2) return null;
  const x = primary;
  const y = valid(map.hints?.secondaryMetric) !== x ? valid(map.hints?.secondaryMetric) : undefined;
  const yy = y ?? metrics.find((a) => a.col !== x)?.col;
  if (yy == null) return null;
  const s0 = valid(map.hints?.scaleMetric);
  const size = s0 != null && s0 !== x && s0 !== yy ? s0 : metrics.find((a) => a.col !== x && a.col !== yy && kindOf(a) === 'level')?.col;
  return { primary, x, y: yy, ...(size != null ? { size } : {}) };
}

export const rolesOf = ROLE_COLS;
