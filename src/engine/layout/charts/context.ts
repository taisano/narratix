import { slideText } from '@/i18n/slide';
import type { ComplementId, ControlId, Locale } from '@/registry';
import { accentOf, type ChartPalette } from '../../theme';
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
  /** 配色（テーマと項目の数から。面の色・線の色・1色だけの時の色・グループの色） */
  palette: ChartPalette;
  /** 単位をチャートタイトルの行に出している（チャートの中の「単位：…」は出さない） */
  unitInHeader?: boolean;
}

/** チャートの右上の「単位：…」。チャートタイトルの行に単位を出している時は出さない（二重にしない） */
export function unitNote(ctx: Pick<ChartCtx, 'unit' | 'locale' | 'unitInHeader'>): string | null {
  return ctx.unit && !ctx.unitInHeader ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null;
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
  /** 強調色（Plus）。強調した項目だけこの色にし、ほかはテーマの色のまま。無ければ今まで通り（ほかを薄くする） */
  accent: string | null;
}

/**
 * 強調の色の決め方（全チャート共通）：
 * 強調なし → テーマの色。強調色あり → 強調した項目は強調色、ほかはテーマの色。強調色なし → 強調した項目は focus、ほかは dim
 */
export function emphasis(env: Pick<ChartEnv, 'highlight' | 'accent'>, name: string, base: string, dim: string, focus: string = base): string {
  if (!env.highlight) return base;
  if (name === env.highlight) return env.accent ?? focus;
  return env.accent ? base : dim;
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
    accent: hl ? accentOf(ctx.control<string>('highlight_color')) : null,
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
