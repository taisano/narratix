import type { ExecBlockId, IiaColId } from '@/registry';
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

/**
 * ヒートマップ型の表の見せ方。中身は比較表と共有（content.comparison）。
 * scale＝色の濃さを比べる範囲（行ごと／列ごと／表全体）、direction＝大きいほど濃い／小さいほど濃い／プラス・マイナス
 */
export interface HeatLook extends Omit<ComparisonLook, 'emphasis'> {
  scale: 'row' | 'col' | 'all';
  direction: 'high' | 'low' | 'diverging';
  showLegend: boolean;
}

// ──────────── KPI スコアカード ────────────

/** 増減の良し悪し：上がると良い／下がると良い／色を付けない */
export type GoodDirection = 'up' | 'down' | 'none';

export interface Kpi {
  id: string;
  name: string;
  /** 今の値（入れた文字のまま。数として読む） */
  value: string;
  unit: string;
  /** 対象期間（例：2024年） */
  period: string;
  /** 比較の値（空なら増減を出さない） */
  compare: string;
  /** 比較基準（例：前年比、計画比） */
  basis: string;
  good: GoodDirection;
}

export interface KpiContent {
  kpis: Kpi[];
  /** カードの下の注記 */
  note: string;
}

export interface KpiLook {
  /** 増減の出し方：差／率／両方（% の指標の差は pt） */
  delta: 'diff' | 'pct' | 'both';
  /** 強調する KPI の id（無し＝null） */
  emphasis: string | null;
  /** 並べ方：auto＝4つまで1段、5つから2段 */
  rows: 'auto' | 'one' | 'two';
  align?: TextAlign;
  showPeriod: boolean;
  showBasis: boolean;
  showDelta: boolean;
  /** KPI の id → 数の形 */
  formats: Record<string, NumberFormatDef>;
}

// ──────────── 課題→示唆→アクション ────────────

export interface IiaItem {
  id: string;
  text: string;
  /** アクションの担当・期限（任意。アクションの枠だけ使う） */
  owner: string;
  due: string;
}
export interface IiaColumn {
  id: IiaColId;
  /** 見出し（空なら既定の名前） */
  label: string;
  items: IiaItem[];
  refs: string[];
}
export interface IiaContent { cols: IiaColumn[] }
export interface IiaLook {
  layout: 'horizontal' | 'vertical';
  emphasis: IiaColId | null;
  align?: TextAlign;
  showNumbers: boolean;
  /** アクションの担当・期限を出す */
  showOwner: boolean;
  /** 参照スライドを注記で出す（見出しの後ろに *1） */
  showRefs: boolean;
}

// ──────────── 増減付き表 ────────────

export interface DeltaRow {
  id: string;
  name: string;
  /** 今の値・比較1の値・比較2の値（入れた文字のまま） */
  value: string;
  c1: string;
  c2: string;
}
export interface DeltaContent {
  rows: DeltaRow[];
  /** 列の見出し：項目・今・比較1・比較2（比較2は、値が1つでもあれば使う） */
  heads: { name: string; value: string; c1: string; c2: string };
  /** 単位（表全体で1つ） */
  unit: string;
  lead: string;
  note: string;
}
export type DeltaMode = 'diff' | 'pct' | 'both';
export interface DeltaLook {
  /** 比較1・比較2の増減の出し方 */
  delta1: DeltaMode;
  delta2: DeltaMode;
  /** 比較の値の列を出す */
  showCompare: boolean;
  /** 合計の行（アプリが計算。足せない単位では出さない） */
  total: boolean;
  /** 並べ方：入れた順／今の値の大きい順／増減（比較1の差）の大きい順 */
  sort: 'input' | 'value' | 'delta';
  /** 強調する行の id */
  emphasis: string | null;
  good: GoodDirection;
  /** 値の列（今・比較）の数の形 */
  format?: NumberFormatDef;
  align?: TextAlign | 'auto';
  showLead: boolean;
  showSource: boolean;
  rowLines: boolean;
  headerFill: boolean;
}

// ──────────── Executive Summary ────────────

export interface ExecBlock {
  id: ExecBlockId;
  /** 項目名（空なら既定の名前） */
  label: string;
  body: string;
  /** 参照するスライドの id */
  refs: string[];
}
export interface ExecContent {
  /** 書き方：fixed＝定型（5項目）、free＝自由に書く。どちらの中身も持ち、切り替えても失わない */
  mode?: 'fixed' | 'free';
  blocks: ExecBlock[];
  /** 自由に書く時の本文と参照スライド */
  free?: { body: string; refs: string[] };
}
export interface ExecLook {
  align?: TextAlign;
  /** 強調する項目（無し＝null。定型の時だけ） */
  emphasis: ExecBlockId | null;
  showLabels: boolean;
  /** 参照スライドを注記で出す（本文の後ろに *1、下に「*1 スライド 2・3」）。初めは出さない */
  showRefs: boolean;
}

/** スライドごとの中身・見せ方（型ごとに持つ。型を行き来しても失わない） */
export interface TemplateContent {
  comparison?: ComparisonContent;
  kpi?: KpiContent;
  conclusion?: ConclusionContent;
  exec?: ExecContent;
  delta?: DeltaContent;
  iia?: IiaContent;
}
export interface TemplateLook {
  comparison?: ComparisonLook;
  kpi?: KpiLook;
  conclusion?: ConclusionLook;
  exec?: ExecLook;
  delta?: DeltaLook;
  iia?: IiaLook;
  heatmap?: HeatLook;
}
