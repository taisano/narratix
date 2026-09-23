import type { Dataset } from '@/registry';

export type Cell = number | null;

export interface Period {
  label: string;
  values: Cell[][];
}

/** transform が受け渡す行×列の表。current と、任意で比較期間 base を持つ */
export interface Matrix {
  rows: string[];
  cols: string[];
  current: Period;
  base?: Period;
  /** growth を通した場合の計算方法 */
  growth?: { useCagr: boolean; years: number | null };
}

export class TransformError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export const rowSum = (a: readonly Cell[] | undefined) => (a ?? []).reduce<number>((s, v) => s + (v || 0), 0);

export function fromDataset(d: Dataset): Matrix {
  return {
    rows: [...d.rows],
    cols: [...d.cols],
    current: { label: d.periods.current.label, values: d.periods.current.values.map((r) => [...r]) },
    base: d.periods.base ? { label: d.periods.base.label, values: d.periods.base.values.map((r) => [...r]) } : undefined,
  };
}

/** 期間ラベルが両方とも4桁の年なら、その差（年数）。それ以外は null */
export function periodYears(baseLabel: string, currentLabel: string): number | null {
  if (!/^\d{4}$/.test(baseLabel) || !/^\d{4}$/.test(currentLabel)) return null;
  return Number(currentLabel) - Number(baseLabel);
}

/**
 * 成長率。比較期間の値が0以下・空、現在の値が空・負なら null（表示は「—」）。
 * 年数が1以上なら CAGR、そうでなければ期間の伸び率。
 */
export function growthRate(current: Cell | undefined, base: Cell | undefined, useCagr: boolean, years: number | null): number | null {
  if (!(base != null && base > 0) || current == null || current < 0) return null;
  return useCagr && years != null ? Math.pow(current / base, 1 / years) - 1 : current / base - 1;
}
