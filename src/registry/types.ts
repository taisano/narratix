import type { LocalizedText, Locale } from './locale';
import type {
  AspectId, ChartTypeId, ComplementId, ControlId, DataSchemaId, ExportId, LayoutId,
  PanelKind, PurposeId, TableId, TransformId,
} from './ids';

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
}

export interface ExportDef {
  id: ExportId;
  label: LocalizedText;
  /** ユーザーに見せる3択（見た目優先／データ編集優先／画像）。null は将来オプション */
  userChoice: 'look' | 'data' | 'image' | null;
}
