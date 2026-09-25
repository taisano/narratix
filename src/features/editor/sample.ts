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

/** 要因のサンプル：営業利益の前年からの増減（1行目＝始点、最後の行＝終点、あいだ＝要因） */
export const BRIDGE_SAMPLE: Dataset = {
  schema: 'DRIVER_BRIDGE',
  unit: '億円',
  dimensions: { rows: '項目', cols: '' },
  rows: ['2024年度 営業利益', '販売数量の増加', '価格改定', '原材料費の上昇', '人件費の増加', '為替の影響', '2025年度 営業利益'],
  cols: ['金額'],
  periods: {
    current: { label: '2025', values: [[120], [35], [18], [-22], [-9], [6], [148]] },
    base: { label: '', values: [[null], [null], [null], [null], [null], [null], [null]] },
  },
};
export const BRIDGE_TITLE = '販売数量と価格改定で原材料費の上昇を吸収し、営業利益は28億円増えた';

/** 関係のサンプル：製品ごとの市場成長率・営業利益率・売上（1列目＝X、2列目＝Y、3列目＝大きさ） */
export const RELATION_SAMPLE: Dataset = {
  schema: 'BUBBLE',
  unit: '',
  dimensions: { rows: '製品', cols: '指標' },
  rows: ['製品A', '製品B', '製品C', '製品D', '製品E', '製品F', '製品G', '製品H'],
  cols: ['市場成長率（%）', '営業利益率（%）', '売上（億円）'],
  periods: {
    current: {
      label: '2025',
      values: [[12.5, 18.2, 240], [8.1, 11.5, 420], [3.2, 6.8, 610], [15.8, 21.0, 90], [5.5, 9.1, 180], [1.2, 4.3, 350], [10.4, 14.9, 150], [6.9, 7.2, 60]],
    },
    base: { label: '', values: [[null, null, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null]] },
  },
};
export const RELATION_TITLE = '市場の伸びが大きい製品ほど、利益率も高い';
