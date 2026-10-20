import { kindOf, primaryMetricOf, type AiRoleResponse } from './columnRoles';

/**
 * 列対応から決まる「形」（コードが決める。AI は決めない）。1つの列対応が複数の形に当てはまる。
 * 段階 1a で作るのは item_metric・time_metric。他は段階 1b・1c
 */
export const DRAFT_SHAPES = ['item_metric', 'time_metric', 'item_compare', 'relation', 'exact_table', 'time_kpi'] as const;
export type DraftShape = (typeof DRAFT_SHAPES)[number];

export function shapesOf(map: Pick<AiRoleResponse, 'assignments' | 'time' | 'primaryMetric'>): DraftShape[] {
  const has = (...r: string[]) => map.assignments.some((a) => r.includes(a.role));
  const metrics = map.assignments.filter((a) => a.role === 'metric');
  const out: DraftShape[] = [];
  const timed = !!map.time;
  if (timed && (map.time!.orientation === 'columns' || has('metric', 'seriesValue'))) out.push('time_metric');
  if (!timed && has('item') && metrics.length >= 1) out.push('item_metric');
  if (!timed && has('item') && has('compare')) out.push('item_compare');
  if (!timed && has('item') && metrics.length >= 2) out.push('relation');
  if (out.length || primaryMetricOf(map) != null) out.push('exact_table');
  return out;
}

export const hasDeltaOnly = (map: Pick<AiRoleResponse, 'assignments'>): boolean => {
  const ms = map.assignments.filter((a) => a.role === 'metric');
  return ms.length > 0 && ms.every((a) => kindOf(a) !== 'level');
};
