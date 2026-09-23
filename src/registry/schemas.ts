import type { DataSchemaId } from './ids';
import type { DataSchemaDef } from './types';

export const DATA_SCHEMAS: Record<DataSchemaId, DataSchemaDef> = {
  MATRIX_TIME_SERIES: {
    id: 'MATRIX_TIME_SERIES',
    label: { ja: '時系列・比較の表', en: 'Matrix / time series' },
    structure: { ja: '行＝項目（期間またはカテゴリ）× 列＝系列', en: 'Rows = items (periods or categories) × columns = series' },
    supportsBase: true,
  },
  MEKKO: {
    id: 'MEKKO',
    label: { ja: '規模×構成の表', en: 'Mekko matrix' },
    structure: { ja: '行＝カテゴリ（地域など）× 列＝セグメント（形状など）、値は実数', en: 'Rows = categories × columns = segments, absolute values' },
    supportsBase: true,
  },
  DRIVER_BRIDGE: {
    id: 'DRIVER_BRIDGE',
    label: { ja: '始点・終点と要因', en: 'Driver bridge' },
    structure: { ja: '始点値、終点値、要因リスト（名前・値）', en: 'Start value, end value and a list of drivers' },
    supportsBase: true,
  },
  BUBBLE: {
    id: 'BUBBLE',
    label: { ja: '項目ごとの X・Y・サイズ', en: 'X / Y / size per item' },
    structure: { ja: '項目ごとに X、Y、サイズ（任意）、グループ（任意）', en: 'X, Y, optional size and group per item' },
    supportsBase: true,
  },
  EVALUATION: {
    id: 'EVALUATION',
    label: { ja: '項目×指標の評価表', en: 'Evaluation matrix' },
    structure: { ja: '行＝項目 × 列＝指標、指標ごとに方向と単位', en: 'Rows = items × columns = metrics, with direction and unit per metric' },
    supportsBase: true,
  },
};
