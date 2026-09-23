import { CHART_TYPES } from './charts';
import type { ChartTypeId, DataSchemaId } from './ids';
import { PURPOSES } from './purposes';

/**
 * チャートが受け取れるデータセットのスキーマ。
 * MEKKO は MATRIX と同じ「行×列の実数」なので、MATRIX 系チャートでも描ける（p05 の左の合計棒など）。
 */
export const SCHEMA_COMPAT: Record<DataSchemaId, DataSchemaId[]> = {
  MATRIX_TIME_SERIES: ['MATRIX_TIME_SERIES', 'MEKKO'],
  MEKKO: ['MEKKO'],
  DRIVER_BRIDGE: ['DRIVER_BRIDGE'],
  BUBBLE: ['BUBBLE'],
  EVALUATION: ['EVALUATION'],
};

export function chartAcceptsSchema(chart: ChartTypeId, datasetSchema: DataSchemaId): boolean {
  const chartSchema = PURPOSES[CHART_TYPES[chart].purpose].schema;
  return SCHEMA_COMPAT[chartSchema].includes(datasetSchema);
}
