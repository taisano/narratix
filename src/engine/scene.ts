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
  /** 回転（度、時計回り）。箱の中心を軸に回す（x, y, w, h は回す前の箱）。例：-90 で下から上へ読む縦書き */
  rotate?: number;
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

/** 直線（目盛線・折れ線の線分・参照線） */
export interface LineItem {
  kind: 'line';
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  /** 太さ（pt） */
  width: number;
  dash?: boolean;
}

/** 楕円（折れ線のマーカー） */
export interface EllipseItem {
  kind: 'ellipse';
  x: number; y: number; w: number; h: number;
  fill: string;
}

export type SceneItem = TextItem | BoxItem | TableItem | LineItem | EllipseItem;

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

/** 表以外のアイテムの外接矩形（線は両端から求める） */
export function itemBox(it: Exclude<SceneItem, TableItem>): Rect {
  if (it.kind === 'line') return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1) };
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}

/** アイテムに含まれる文字（テスト・検索用） */
export function itemTexts(it: SceneItem): string[] {
  if (it.kind === 'table') return it.rows.flatMap((r) => r.map((c) => c.text));
  if (it.kind === 'text' || it.kind === 'box') return (it.lines ?? []).map((l) => l.t);
  return [];
}
