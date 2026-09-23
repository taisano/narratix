import { rowSum, type Matrix } from '../transform/matrix';

export interface MekkoColumn {
  name: string;
  /** 元データの行番号 */
  row: number;
  tot: number;
  totB: number;
  /** 全体に占める幅の比率 */
  share: number;
  /** 列内の構成比（現在） */
  mix: number[];
  /** 列内の構成比（比較期間。ない場合は null） */
  mixB: (number | null)[];
}

export interface MekkoModel {
  columns: MekkoColumn[];
  segments: string[];
  grand: number;
  /** 比較期間のデータがない列 */
  missingBase: string[];
}

/** Mekko の列（幅＝規模、高さ＝構成比）。合計0の行は除く。 */
export function mekkoModel(m: Matrix, opts: { sortBySize: boolean }): MekkoModel {
  const cur = m.current.values, base = m.base?.values;
  let idx = m.rows.map((_, i) => i).filter((i) => rowSum(cur[i]) > 0);
  if (opts.sortBySize) idx.sort((a, b) => rowSum(cur[b]) - rowSum(cur[a]));
  const grand = idx.reduce((s, i) => s + rowSum(cur[i]), 0);
  const columns = idx.map((i): MekkoColumn => {
    const c = cur[i] ?? [], b = base?.[i] ?? [];
    const tot = rowSum(c), totB = rowSum(b);
    return {
      name: m.rows[i]!, row: i, tot, totB, share: tot / grand,
      mix: m.cols.map((_, k) => (tot > 0 ? (c[k] || 0) / tot : 0)),
      mixB: m.cols.map((_, k) => (totB > 0 ? (b[k] || 0) / totB : null)),
    };
  });
  return { columns, segments: m.cols, grand, missingBase: columns.filter((c) => !(c.totB > 0)).map((c) => c.name) };
}
