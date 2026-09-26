import type { Dataset } from '@/registry';
import type { Locale } from '@/registry/locale';

/**
 * 紹介トップの Mekko の見本：架空企業6部門の生成AI利用（デモ用ダミーデータ）。
 * Tai さんが作ったスライド（2026-09）と同じ表示になる数値（セルの%・pt・CAGR・全体の構成比がすべて一致）。
 * 行＝部門（幅は2026年の利用時間）、列＝用途。
 */
const V24 = [[118, 60, 33, 148, 41], [99, 102, 39, 20, 20], [51, 68, 59, 11, 21], [51, 49, 70, 4, 16], [31, 40, 20, 60, 9], [60, 30, 41, 5, 14]];
const V26 = [[261, 180, 87, 424, 148], [297, 362, 142, 100, 99], [165, 302, 278, 55, 100], [183, 207, 271, 32, 107], [120, 153, 101, 250, 126], [217, 170, 184, 40, 89]];

const TEXT = {
  ja: {
    rows: ['開発', 'マーケティング', '営業', '人事', '財務', '法務'],
    cols: ['リサーチ', '資料作成', '会議・要約', '分析・コード', '定型業務'],
    dims: { rows: '部門', cols: '用途' },
    unit: '時間／月',
    title: '生成AIの利用は2年で3.8倍。\n開発・マーケが拡大を牽引し、用途は「分析・コード」と「資料作成」へ',
    source: '出典：架空企業6部門の生成AI利用ログ（デモ用ダミーデータ）',
  },
  en: {
    rows: ['Development', 'Marketing', 'Sales', 'HR', 'Finance', 'Legal'],
    cols: ['Research', 'Presentation Creation', 'Meetings & Summaries', 'Analytics & Coding', 'Routine Tasks'],
    dims: { rows: 'Department', cols: 'Use case' },
    unit: 'hours/month',
    title: 'Generative AI usage grew 3.8× in two years, led by Development and Marketing,\nwith growth concentrated in Analytics & Coding and Presentation Creation',
    source: 'Source: Generative AI usage logs across six departments at a fictional company (dummy data for demonstration)',
  },
} as const;

export function genAiMekko(locale: Locale): { dataset: Dataset; title: string; source: string; analysisCol: string } {
  const x = TEXT[locale];
  return {
    dataset: {
      schema: 'MEKKO', unit: x.unit, dimensions: { ...x.dims }, rows: [...x.rows], cols: [...x.cols],
      periods: { current: { label: '2026', values: V26.map((r) => [...r]) }, base: { label: '2024', values: V24.map((r) => [...r]) } },
    },
    title: x.title, source: x.source, analysisCol: x.cols[3],
  };
}
