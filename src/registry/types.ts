import type { LocalizedText, Locale } from './locale';
import type {
  AspectId, AudienceId, ChartTypeId, ComplementId, CompositionType, ControlId, DataSchemaId, DerivedMetricId, ExportId, LayoutId,
  PanelKind, PurposeId, RecipeId, RecipeStatus, TableId, TransformId,
} from './ids';
import type { Panel, ViewSpec } from './viewspec';

/** 既存＝NarratiX のコードにあるもの、新規＝Web版で追加、隠れ＝既存だが UI から到達不能だった */
export type Origin = 'existing' | 'new' | 'existing_hidden';

export interface DataSchemaDef {
  id: DataSchemaId;
  label: LocalizedText;
  structure: LocalizedText;
  /** 比較期間（base）を任意で持てるか。全スキーマ共通で true */
  supportsBase: boolean;
}

export interface PurposeDef {
  id: PurposeId;
  label: LocalizedText;
  question: LocalizedText;
  schema: DataSchemaId;
  wishPhrases: Partial<Record<Locale, string[]>>;
}

export interface AspectDef {
  id: AspectId;
  label: LocalizedText;
}

export interface ChartTypeDef {
  id: ChartTypeId;
  purpose: PurposeId;
  label: LocalizedText;
  origin: Origin;
  shows: AspectId[];
  cannotShow: AspectId[];
  /** 推奨する補完パーツ（画面で「＋追加」として提案する） */
  complements: ComplementId[];
  requires: { base: boolean };
  renderer: string;
  exports: ExportId[];
  defaultExport: ExportId;
  messageExamples: Partial<Record<Locale, string[]>>;
}

export type ControlType = 'text' | 'select' | 'toggle' | 'data_select' | 'data_multi_select';

export interface ControlOption {
  value: string;
  label: LocalizedText;
}

export interface ControlDef {
  id: ControlId;
  label: LocalizedText;
  type: ControlType;
  /** type が select のときの選択肢 */
  options?: ControlOption[];
  defaultValue?: string | boolean;
  /**
   * data_select / data_multi_select の候補がどこから来るか（軸の入れ替え後の表で）。
   * rows＝横軸の項目（多くは期間）、cols＝系列
   */
  dataSource?: 'rows' | 'cols';
  appliesTo: readonly ChartTypeId[];
  origin: Origin;
}

/** チャートの中に描く（パネル内オプション）か、揃えの指定を持った別パネルとして足すか */
export type ComplementPlacement = 'in_chart' | 'panel';

export interface ComplementDef {
  id: ComplementId;
  label: LocalizedText;
  covers: AspectId[];
  placement: ComplementPlacement;
  appliesTo: readonly ChartTypeId[];
  /**
   * 比較期間の要否。always=必須、never=不要、
   * when_growth=成長率を出す場合のみ、when_previous_year=前年を基準にする場合のみ
   */
  requiresBase: 'always' | 'never' | 'when_growth' | 'when_previous_year';
  /** 必要な時点数（sparkline は3時点以上） */
  minPeriods?: number;
  /** placement=panel のとき、追加すると切り替わるレイアウトと置き場所（チャートごとに上書き可） */
  panel?: {
    kind: PanelKind;
    table?: TableId;
    default: ComplementPanelPlacement;
    byChart?: Partial<Record<ChartTypeId, ComplementPanelPlacement>>;
  };
  suggestText: LocalizedText;
}

export interface ComplementPanelPlacement {
  layout: LayoutId;
  /** 元のチャートを置くスロット */
  hostSlot: string;
  /** 補完パネルを置くスロット */
  slot: string;
  ratios?: number[];
  align: 'columns' | 'rows' | null;
}

/** レイアウトの分割木。ratio は ViewSpec.layout.ratios の添字、'equal' は等分 */
export type LayoutNode =
  | { slot: string }
  | { split: 'cols' | 'rows'; ratio: number | 'equal'; children: LayoutNode[] };

export interface LayoutRatioParam {
  label: LocalizedText;
  default: number;
  min: number;
  max: number;
}

export interface SlideLayoutDef {
  id: LayoutId;
  label: LocalizedText;
  useCase: LocalizedText;
  slots: string[];
  tree: LayoutNode;
  ratios: LayoutRatioParam[];
}

export interface TransformDef {
  id: TransformId;
  label: LocalizedText;
  requiresBase: boolean;
}

export interface TableDef {
  id: TableId;
  label: LocalizedText;
  requiresBase: boolean;
  /** その表で見せられる要素（レシピの「見せられる」を組み立てる時に使う） */
  covers: AspectId[];
}

export interface ExportDef {
  id: ExportId;
  label: LocalizedText;
  /** ユーザーに見せる3択（見た目優先／データ編集優先／画像）。null は将来オプション */
  userChoice: 'look' | 'data' | 'image' | null;
}

/**
 * 推薦レシピ（伝え方の切り口）。docs/consultation-flow.md の「推薦データベース仕様」。
 * 説明文はここに1回だけ書き、3つの入り口すべてで使う。AI は recipe_id を選ぶだけで、文言は作らない。
 */
export interface RecipeDef {
  id: RecipeId;
  name: LocalizedText;
  /** 答える問い（データを見る前の、問いの形） */
  question: LocalizedText;
  /** 対応する目的。先頭が主な目的 */
  goals: PurposeId[];
  composition: CompositionType;
  /** 1枚の組み立て（レイアウトとパネル）。ViewSpec の layout・panels になる */
  view: { layout: ViewSpec['layout']; panels: Panel[] };
  /** 必要なデータの形（このスキーマ、またはこれを描けるスキーマのデータ） */
  schema: DataSchemaId;
  requirements: RecipeRequirements;
  derived: DerivedMetricId[];
  /** 正確な数値を読める（表や値ラベルがある） */
  exactValues: boolean;
  /** 読み取りの負荷 */
  readingLoad: 'low' | 'medium' | 'high';
  audience: AudienceId[];
  /** 相談文の言い回し（ルール版の分類と、推薦理由の照合に使う） */
  keywords: Partial<Record<'ja' | 'en', string[]>>;
  reason: LocalizedText;
  strength: LocalizedText;
  limitation: LocalizedText;
  /** レシピだけの「見えにくいこと」（チャートの cannotShow に足す） */
  extraCannotShow?: AspectId[];
  /** 同点のときの並び（大きいほど先） */
  priority: number;
  status: RecipeStatus;
}

export interface RecipeRequirements {
  /** 行が年（1900〜2100 の整数が2つ以上）であること。CAGR・開始年と終了年の比較で必要 */
  timeAxis?: boolean;
  /** 比較期間（base）のデータが必要 */
  base?: boolean;
  /** 行（期間や項目）の最小数 */
  minRows?: number;
  /** 系列（列）がこれを超えると読みにくい（警告） */
  maxSeries?: number;
}
