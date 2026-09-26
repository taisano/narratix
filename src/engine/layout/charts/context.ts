import type { ComplementId, ControlId, Locale } from '@/registry';
import type { NumberFormat } from '../../format';
import type { Rect, SceneItem, SceneWarning } from '../../scene';
import type { Matrix } from '../../transform/matrix';
import type { PanelAnchors } from '../anchors';

/** チャートの配置関数に渡す材料。配置関数はこれだけを見て Scene のアイテムを返す */
export interface ChartCtx {
  rect: Rect;
  /** transform と行列の入れ替えを済ませた表。行＝横軸の項目、列＝系列 */
  matrix: Matrix;
  locale: Locale;
  /** 設定値（未指定ならレジストリの既定値） */
  control: <T = string>(id: ControlId) => T | undefined;
  /** チャート内の補完パーツがオンか */
  complement: (id: ComplementId) => boolean;
  unit: string;
  /** 列（系列）が何を表すか。入れ替え後の意味 */
  colsLabel: string;
  /** 揃え先のパネルの位置情報 */
  alignTarget: (axis: 'columns' | 'rows' | 'y_scale' | 'x_scale') => PanelAnchors | undefined;
  /** 自分に揃えてくるパネルがあるか */
  alignedFrom: (axis: 'columns' | 'rows' | 'y_scale' | 'x_scale') => boolean;
  /** 自分に列で揃える表の行ラベル（左の余白の計算用） */
  alignedTableLabels: () => string[];
  warn: (w: SceneWarning) => void;
  /** 構成系（Mekko・積み上げ）の配色 */
  palette: { series: string[]; greys: string[] };
}

export type ChartLayout = (ctx: ChartCtx) => { items: SceneItem[]; anchors: PanelAnchors };

export interface ChartEnv {
  numberFormat: NumberFormat;
  gridlines: 'off' | 'light' | 'on';
  /** 値ラベルを1つでも出すか（余白の取り方に使う） */
  dataLabels: boolean;
  /** 値ラベルの出し方：なし／すべて／最初と最後／強調した系列（項目）だけ */
  labelMode: LabelMode;
  highlight: string | null;
}

export type LabelMode = 'off' | 'all' | 'ends' | 'highlight';

/**
 * その点（ci 番目）に値ラベルを出すか。
 * ends：その系列で値のある最初と最後の点。highlight：強調した系列（項目）だけ（強調が無ければ出さない）
 */
export function showLabel(env: ChartEnv, ci: number, values: readonly (number | null | undefined)[], emphasized: boolean): boolean {
  switch (env.labelMode) {
    case 'all': return true;
    case 'highlight': return emphasized;
    case 'ends': {
      const idx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
      return ci === idx[0] || ci === idx[idx.length - 1];
    }
    default: return false;
  }
}

const LABEL_MODES: LabelMode[] = ['off', 'all', 'ends', 'highlight'];
const labelsOf = (v: string | undefined): Pick<ChartEnv, 'dataLabels' | 'labelMode'> => {
  const labelMode = LABEL_MODES.includes(v as LabelMode) ? (v as LabelMode) : 'off';
  return { labelMode, dataLabels: labelMode !== 'off' };
};

export function envOf(ctx: ChartCtx): ChartEnv {
  const hl = ctx.control<string>('highlight');
  return {
    numberFormat: (ctx.control<NumberFormat>('number_format') ?? 'raw'),
    gridlines: (ctx.control<'off' | 'light' | 'on'>('gridlines') ?? 'off'),
    ...labelsOf(ctx.control<string>('data_labels')),
    highlight: hl && ctx.matrix.cols.includes(hl) ? hl : null,
  };
}

export interface Series {
  name: string;
  values: (number | null)[];
}

/** 表 → 系列（列ごと）。数値でない値は null */
export function seriesOf(m: Matrix): Series[] {
  return m.cols.map((name, k) => ({
    name,
    values: m.rows.map((_, i) => {
      const v = m.current.values[i]?.[k];
      return v == null || !Number.isFinite(v) ? null : v;
    }),
  }));
}
