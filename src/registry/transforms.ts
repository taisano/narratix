import type { TransformId, TableId, ExportId } from './ids';
import type { TransformDef, TableDef, ExportDef } from './types';

const L = (ja: string, en: string) => ({ ja, en });

/** データ変換（registry-spec.md「データ変換（transform）」）。パラメータの形は viewspec.ts の zod で定義。 */
export const TRANSFORMS: Record<TransformId, TransformDef> = {
  transpose: { id: 'transpose', label: L('行と列の入れ替え', 'Swap rows and columns'), requiresBase: false },
  aggregate_rows: { id: 'aggregate_rows', label: L('行を合計', 'Aggregate rows'), requiresBase: false },
  select_periods: { id: 'select_periods', label: L('期間を選ぶ', 'Select periods'), requiresBase: false },
  growth: { id: 'growth', label: L('成長率', 'Growth'), requiresBase: true },
  share: { id: 'share', label: L('構成比', 'Share'), requiresBase: false },
  delta_share: { id: 'delta_share', label: L('構成比の変化（pt）', 'Share change (pt)'), requiresBase: true },
  filter: { id: 'filter', label: L('絞り込み', 'Filter'), requiresBase: false },
  sort: { id: 'sort', label: L('並び替え', 'Sort'), requiresBase: false },
  endpoints: { id: 'endpoints', label: L('最初と最後の時点だけ', 'First and last period only'), requiresBase: false },
  latest: { id: 'latest', label: L('最新の時点だけ', 'Latest period only'), requiresBase: false },
};

export const TABLES: Record<TableId, TableDef> = {
  growth_table: { id: 'growth_table', label: L('成長率表', 'Growth table'), requiresBase: true, covers: ['growth'] },
  data_table: { id: 'data_table', label: L('データ表', 'Data table'), requiresBase: false, covers: ['level'] },
  /** 系列ごとの CAGR（行＝年の最初→最後で計算。比較期間のデータは使わない） */
  cagr_table: { id: 'cagr_table', label: L('CAGR表', 'CAGR table'), requiresBase: false, covers: ['growth'] },
};

/** 出力方式（registry-spec.md「出力方式」） */
export const EXPORTS: Record<ExportId, ExportDef> = {
  shapes: { id: 'shapes', label: L('図形で組む', 'Shapes'), userChoice: 'look' },
  native: { id: 'native', label: L('PowerPointのグラフ', 'Native chart'), userChoice: 'data' },
  table: { id: 'table', label: L('PowerPointの表', 'Table'), userChoice: 'look' },
  svg: { id: 'svg', label: L('SVG画像', 'SVG image'), userChoice: 'image' },
  png: { id: 'png', label: L('高解像度PNG画像', 'PNG image'), userChoice: 'image' },
  thinkcell: { id: 'thinkcell', label: L('think-cell用データ', 'think-cell data'), userChoice: null },
};
