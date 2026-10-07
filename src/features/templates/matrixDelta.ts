import type { ComparisonContent } from '@/engine/layout/templates';
import type { Locale } from '@/registry';

/** MATRIX_DELTA_SHAREを既存の基本表Rendererへ渡すための、意味を保った入力。 */
export interface MatrixDeltaInput {
  rowDimension: string;
  columnDimension: string;
  rows: string[];
  columns: string[];
  baselineLabel: string;
  currentLabel: string;
  baseline: (number | null)[][];
  current: (number | null)[][];
  /** 各セルのシェアの分母。空文字は受け付けない。 */
  shareBasis: string;
  /** ratio: 0.35 = 35%、percent: 35 = 35%。推測で変換しない。 */
  inputScale: 'ratio' | 'percent';
  locale: Locale;
  digits?: number;
}

export interface MatrixDeltaBuildResult {
  content: ComparisonContent;
  /** 元データを削らず、表示方法だけを変える提案。 */
  density: { cellCount: number; dense: boolean; options: ('TOP_N' | 'FILTER' | 'SMALL_MULTIPLES' | 'MULTIPLE_SLIDES')[] };
}

const sameShape = (values: (number | null)[][], rows: number, cols: number) =>
  values.length === rows && values.every((r) => r.length === cols);

const n = (value: number, digits: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

/**
 * セルを「最新シェア\n（前時点からの増減pt）」へ変換する。
 * 集約・Top N・欠損補完は行わない。色が無くても値と増減を読める文字を作る。
 */
export function buildMatrixDeltaShare(input: MatrixDeltaInput): MatrixDeltaBuildResult {
  const basis = input.shareBasis.trim();
  if (!basis) throw new Error('share_basis is required');
  if (!sameShape(input.baseline, input.rows.length, input.columns.length)) throw new Error('baseline shape does not match rows and columns');
  if (!sameShape(input.current, input.rows.length, input.columns.length)) throw new Error('current shape does not match rows and columns');
  const digits = Math.max(0, Math.min(3, input.digits ?? 1));
  const factor = input.inputScale === 'ratio' ? 100 : 1;
  const ja = input.locale === 'ja';
  const cells: string[][] = [[`${input.rowDimension} × ${input.columnDimension}`, ...input.columns]];
  input.rows.forEach((row, i) => {
    cells.push([row, ...input.columns.map((_, j) => {
      const cur = input.current[i]?.[j];
      const base = input.baseline[i]?.[j];
      if (cur == null) return '—';
      const level = cur * factor;
      if (base == null) return `${n(level, digits)}%\n${ja ? '（—）' : '(—)'}`;
      const delta = (cur - base) * factor;
      const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
      return `${n(level, digits)}%\n${ja ? '（' : '('}${sign}${n(Math.abs(delta), digits)}pt${ja ? '）' : ')'}`;
    })]);
  });
  const cellCount = input.rows.length * input.columns.length;
  return {
    content: {
      cells,
      headerRow: true,
      headerCol: true,
      lead: ja
        ? `${input.currentLabel}のシェア（${input.baselineLabel}からの増減pt）`
        : `${input.currentLabel} share (change in points from ${input.baselineLabel})`,
      note: ja ? `シェアの分母：${basis}` : `Share basis: ${basis}`,
      fromConsultation: true,
    },
    density: {
      cellCount,
      dense: cellCount >= 24 || input.rows.length > 8 || input.columns.length > 8,
      options: cellCount >= 24 || input.rows.length > 8 || input.columns.length > 8
        ? ['TOP_N', 'FILTER', 'SMALL_MULTIPLES', 'MULTIPLE_SLIDES']
        : [],
    },
  };
}
