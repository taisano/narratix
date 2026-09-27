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
/** 英語のスライド用の見本の出典 */
export const SAMPLE_SOURCE_EN = 'Source: Sample data (replace with your own)';
/** 見本の出典（そのまま出力しないよう、出力の前に確かめる） */
export const SAMPLE_SOURCES: readonly string[] = [SAMPLE_SOURCE, TREND_SOURCE, SAMPLE_SOURCE_EN];

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
  dimensions: { rows: '製品', cols: '指標', group: '事業' },
  groups: ['消費財', '消費財', '産業財', '消費財', '産業財', '産業財', '消費財', '産業財'],
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

// ──────────── 英語のスライド用の見本 ────────────
// 数字は日本語の見本と同じ。項目名・単位・タイトルだけを英語にする（英語の画面でも見本が読めるように）

/** 見本の項目名・単位の英語 */
const SAMPLE_EN: Record<string, string> = {
  '百万ドル': '$M', '億円': '$M', '地域': 'Region', '形状': 'Type', '年': 'Year', '項目': 'Item', '金額': 'Amount',
  '製品': 'Product', '指標': 'Metric', '事業': 'Business',
  '北米': 'North America', '欧州': 'Europe', '中国': 'China', '日本': 'Japan', '東南アジア': 'Southeast Asia',
  'シングル': 'Single', 'デュアル': 'Dual', 'オーブン型': 'Oven', '窓付き': 'Window',
  '2024年度 営業利益': 'FY2024 operating profit', '販売数量の増加': 'Higher volume', '価格改定': 'Price increase',
  '原材料費の上昇': 'Higher material costs', '人件費の増加': 'Higher labor costs', '為替の影響': 'FX impact', '2025年度 営業利益': 'FY2025 operating profit',
  '消費財': 'Consumer', '産業財': 'Industrial',
  '製品A': 'Product A', '製品B': 'Product B', '製品C': 'Product C', '製品D': 'Product D',
  '製品E': 'Product E', '製品F': 'Product F', '製品G': 'Product G', '製品H': 'Product H',
  '市場成長率（%）': 'Market growth (%)', '営業利益率（%）': 'Operating margin (%)', '売上（億円）': 'Sales ($M)',
};
/** 見本の名前を英語にする（見本に無い名前はそのまま） */
export const sampleNameEn = (x: string): string => SAMPLE_EN[x] ?? x;

/** 見本のデータを英語にする（数字はそのまま） */
export function sampleDatasetEn(d: Dataset): Dataset {
  const tr = sampleNameEn;
  return {
    ...d,
    unit: d.unit ? tr(d.unit) : d.unit,
    ...(d.dimensions ? { dimensions: Object.fromEntries(Object.entries(d.dimensions).map(([k, v]) => [k, typeof v === 'string' ? tr(v) : v])) as Dataset['dimensions'] } : {}),
    rows: d.rows.map(tr),
    cols: d.cols.map(tr),
    ...(d.groups ? { groups: d.groups.map((g) => (g == null ? g : tr(g))) } : {}),
  };
}

export const SAMPLE_TITLE_EN = 'Dual baskets grew in every region, with the large China and North America markets driving most of the growth';
export const TREND_TITLE_EN = 'China and Southeast Asia led growth, narrowing the gap with North America by 2025';
export const BRIDGE_TITLE_EN = 'Higher volume and pricing offset rising material costs, lifting operating profit by $28M';
export const RELATION_TITLE_EN = 'Products in faster-growing markets also earn higher margins';

// ──────────── 2指標スロープの見本 ────────────
// 年×地域の表を2つ（左＝売上、右＝営業利益）。表の名前が指標の名前（括弧の中が単位）

const PAIR_PROFIT: (number | null)[][] = [
  [38, 25, 20, 9, 4],
  [40, 25, 22, 10, 5],
  [42, 24, 23, 11, 6],
  [44, 24, 24, 12, 8],
  [47, 23, 24, 14, 10],
];
export const PAIR_TITLE = '北米は売上・利益ともに伸び、日本は売上が横ばいでも利益を伸ばした';
export const PAIR_TITLE_EN = 'North America grew both sales and profit; Japan grew profit on flat sales';
const PAIR_LABELS = { ja: ['売上（億円）', '営業利益（億円）'], en: ['Sales ($M)', 'Operating profit ($M)'] } as const;

/** 2指標スロープの見本（左＝売上、右＝営業利益。年と地域は推移の見本と同じ） */
export function pairSampleDataset(locale: 'ja' | 'en'): Dataset {
  const base: Dataset = {
    ...TREND_SAMPLE, unit: '',
    periods: {
      current: { label: PAIR_LABELS[locale][0], values: TREND_SAMPLE.periods.current.values },
      base: { label: PAIR_LABELS[locale][1], values: PAIR_PROFIT },
    },
  };
  const d = locale === 'en' ? sampleDatasetEn(base) : base;
  return structuredClone({ ...d, unit: '' });
}

export const COMBO_TITLE = '売上は予算を上回って伸び、利益率も5pt改善して成長の質が高まった';
export const COMBO_TITLE_EN = 'Sales beat budget while operating margin improved 5pt, lifting the quality of growth';

/** 縦棒＋折れ線の見本（四半期×売上実績・売上予算・粗利率・営業利益率）。率の列は名前から折れ線・右軸になる */
export function comboSampleDataset(locale: 'ja' | 'en'): Dataset {
  const en = locale === 'en';
  return structuredClone({
    schema: 'MATRIX_TIME_SERIES',
    unit: en ? '$M' : '億円',
    dimensions: { rows: en ? 'Quarter' : '四半期', cols: en ? 'Metric' : '指標' },
    rows: ['2025 Q1', '2025 Q2', '2025 Q3', '2025 Q4'],
    cols: en ? ['Sales (actual)', 'Sales (budget)', 'Gross margin', 'Operating margin'] : ['売上実績', '売上予算', '粗利率', '営業利益率'],
    periods: {
      current: { label: '', values: [[80, 85, 32, 12], [92, 90, 34, 14], [105, 100, 33, 13], [125, 115, 37, 17]] },
      base: { label: '', values: [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]] },
    },
  } as Dataset);
}
