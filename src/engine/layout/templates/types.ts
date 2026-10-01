/**
 * 表・言葉の型の中身（Content）と見せ方（Look）。データ（Dataset）とは別に、スライドごとに持つ。
 * 中身＝中央の下で入れるもの、見せ方＝右で選ぶもの（docs/story-spec.md 9.4）
 */

// ──────────── 比較表 ────────────

/** 比較表の中身。cells[行][列] は入力した文字のまま（数の形は見せ方で決める） */
export interface ComparisonContent {
  cells: string[][];
  /** 1行目を列見出し（比較対象）として扱う */
  headerRow: boolean;
  /** 1列目を比較項目として扱う */
  headerCol: boolean;
  /** タイトルの下の短い補足 */
  lead: string;
  /** 表の下の注記 */
  note: string;
}

/** 数の形。auto＝入れたまま */
export type NumberKind = 'auto' | 'int' | 'dec' | 'pct' | 'currency';
export interface NumberFormatDef {
  kind: NumberKind;
  /** 小数の桁（dec・pct・currency） */
  digits?: number;
  /** 通貨の記号（currency） */
  symbol?: string;
  /** 単位（後ろに付ける。例：億円、万人） */
  unit?: string;
}

export type Emphasis =
  | { kind: 'none' }
  | { kind: 'col'; index: number }
  | { kind: 'row'; index: number }
  | { kind: 'cell'; row: number; col: number };

export interface ComparisonLook {
  emphasis: Emphasis;
  showLead: boolean;
  showSource: boolean;
  /** 行の区切り線 */
  rowLines: boolean;
  /** 見出しの行の背景（濃い紺） */
  headerFill: boolean;
  /** 数の形を決める単位。row＝比較項目（行）ごと、col＝列ごと */
  formatAxis: 'row' | 'col';
  /** 行または列の位置 → 数の形 */
  formats: Record<string, NumberFormatDef>;
  /** 本文のセルの文字の揃え。auto＝数は右・短い評価の語は中央・文は左（比較項目の列はいつも左） */
  align?: TextAlign | 'auto';
}

/** 文字の揃え */
export type TextAlign = 'left' | 'center' | 'right';

// ──────────── 結論＋3つの根拠 ────────────

export interface Reason {
  id: string;
  heading: string;
  body: string;
  /** 参照するスライドの id（無ければ null） */
  ref: string | null;
}

/** 結論はメッセージタイトル（スライドの title）。ここには持たない */
export interface ConclusionContent {
  reasons: Reason[];
  /** 前提・留意点 */
  caveat: string;
}

export interface ConclusionLook {
  layout: 'horizontal' | 'vertical';
  /** 強調する根拠の位置（無し＝null） */
  emphasis: number | null;
  showNumbers: boolean;
  showRefs: boolean;
  showCaveat: boolean;
  /** カードの中の文字の揃え（無ければ左） */
  align?: TextAlign;
}

/** スライドごとの中身・見せ方（型ごとに持つ。型を行き来しても失わない） */
export interface TemplateContent {
  comparison?: ComparisonContent;
  conclusion?: ConclusionContent;
}
export interface TemplateLook {
  comparison?: ComparisonLook;
  conclusion?: ConclusionLook;
}
