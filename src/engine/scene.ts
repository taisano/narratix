/**
 * 配置結果。単位はすべてインチ（16:9 = 13.333 × 7.5）。
 * SVG 描画と PPTX 出力はこれを描くだけで、チャート固有のルールを持たない。
 */
export interface TextLine {
  t: string;
  size: number; // pt
  bold?: boolean;
  color?: string;
}

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle';

export interface TextItem {
  kind: 'text';
  x: number; y: number; w: number; h: number;
  lines: TextLine[];
  align: HAlign;
  valign: VAlign;
}

export interface BoxItem {
  kind: 'box';
  x: number; y: number; w: number; h: number;
  fill: string;
  /** 枠線の色（区切りの白線など） */
  line?: string;
  lines?: TextLine[];
  align?: HAlign;
  valign?: VAlign;
}

export interface TableCell {
  text: string;
  fill: string | null;
  color: string;
  align: HAlign;
  size: number;
  bold: boolean;
}

export interface TableItem {
  kind: 'table';
  x: number; y: number;
  colW: number[];
  rowH: number;
  rows: TableCell[][];
  /** セルの罫線（未指定なら白 1pt：揃えた表の区切り） */
  border?: { color: string; pt: number };
}

export type SceneItem = TextItem | BoxItem | TableItem;

export interface SceneWarning {
  code: 'base_missing_rows' | 'period_order' | 'no_data';
  params?: Record<string, string | number>;
}

export interface Scene {
  width: number;
  height: number;
  items: SceneItem[];
  warnings: SceneWarning[];
}

export interface Rect { x: number; y: number; w: number; h: number }
