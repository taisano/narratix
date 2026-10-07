/**
 * 配置結果。単位はすべてインチ（16:9 = 13.333 × 7.5）。
 * SVG 描画と PPTX 出力はこれを描くだけで、チャート固有のルールを持たない。
 */
export interface TextLine {
  t: string;
  size: number; // pt
  bold?: boolean;
  color?: string;
  /** 同じ行の後ろに続ける、大きさの違う文字（KPI の「1475」の後ろの「億円」）。幅の見積もりに頼らず、描く側が続けて並べるので重ならない */
  tail?: { t: string; size: number; bold?: boolean; color?: string };
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
  /** 行ごとの高さ（あれば rowH より優先。折り返した行を高くする） */
  rowHs?: number[];
  rows: TableCell[][];
  /** セルの罫線（未指定なら白 1pt：揃えた表の区切り） */
  border?: { color: string; pt: number };
  /** 罫線の引き方。all＝全部（今まで）、rows＝行の区切り（横線）だけ */
  grid?: 'all' | 'rows';
  /** セルの左右の余白（インチ。未指定は 0.05） */
  pad?: number;
}

/** 表の行 i の高さ */
export const tableRowH = (t: TableItem, i: number): number => t.rowHs?.[i] ?? t.rowH;

/** 直線（目盛線・折れ線の線分・参照線） */
export interface LineItem {
  kind: 'line';
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  /** 太さ（pt） */
  width: number;
  /** true または 'dash'＝破線、'dot'＝点線 */
  dash?: boolean | 'dash' | 'dot';
}

/** 楕円（折れ線のマーカー） */
export interface EllipseItem {
  kind: 'ellipse';
  x: number; y: number; w: number; h: number;
  fill: string;
  /** マーカーの形（無ければ丸）。四角・ひし形は折れ線の系列を色以外でも見分けるため */
  shape?: 'circle' | 'square' | 'diamond';
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
