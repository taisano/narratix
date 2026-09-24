import type { Dataset } from '@/registry';

/** 見本（reference/mekko-builder.html）と同じサンプル：エアフライヤーの地域×形状 */
export const SAMPLE_DATASET: Dataset = {
  schema: 'MEKKO',
  unit: '百万ドル',
  dimensions: { rows: '地域', cols: '形状' },
  rows: ['北米','欧州','中国','日本','東南アジア'],
  cols: ['シングル','デュアル','オーブン型','窓付き'],
  periods: {
    current: {
      label: '2025',
      values: [[1280, 1024, 512, 384],
        [1176, 728, 616, 280],
        [1080, 1368, 648, 504],
        [696, 216, 168, 120],
        [576, 336, 192, 96]],
    },
    base: {
      label: '2021',
      values: [[1261, 285, 366, 122],
        [1150, 238, 476, 119],
        [928, 371, 409, 149],
        [718, 82, 164, 62],
        [358, 54, 108, 22]],
    },
  },
};

export const SAMPLE_TITLE = 'デュアルバスケットが全地域で伸長。成長額は市場の大きい中国と北米が牽引している';
export const SAMPLE_SOURCE = '出典：サンプルデータ（実データに置き換えてください）';

/** 推移・比較のサンプル：年×地域の売上（2021→2025 と、比較用に 2020） */
export const TREND_SAMPLE: Dataset = {
  schema: 'MATRIX_TIME_SERIES',
  unit: '億円',
  dimensions: { rows: '年', cols: '地域' },
  rows: ['2021', '2022', '2023', '2024', '2025'],
  cols: ['北米', '欧州', '中国', '日本', '東南アジア'],
  periods: {
    current: {
      label: '2025',
      values: [[320, 280, 250, 120, 60],
        [345, 286, 290, 118, 72],
        [372, 295, 335, 121, 88],
        [398, 301, 372, 119, 104],
        [430, 310, 420, 122, 126]],
    },
    base: { label: '2020', values: [[null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]] },
  },
};

export const TREND_TITLE = '中国と東南アジアが成長を牽引し、2025年に北米との差が縮まった';
export const TREND_SOURCE = '出典：サンプルデータ（実データに置き換えてください）';
