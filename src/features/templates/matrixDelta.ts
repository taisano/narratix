/**
 * MATRIX_DELTA_SHARE テンプレート実装
 * 
 * 形式：各セルに現在シェア％と delta ポイント数を同時表示
 * 例：「35.2%\n(+1.5pt)」
 * 
 * 色依存なし - 数値表現のみで意味を伝える
 */

export interface MatrixDeltaInput {
  rowDimension: string;
  columnDimension: string;
  rows: string[];
  columns: string[];
  baselineValues: number[]; // 前期シェア％ 0-100
  currentValues: number[];  // 当期シェア％ 0-100
  shareBasis: 'percent' | 'count';
  inputScale: 'ratio' | 'percent';
}

export interface MatrixDeltaCell {
  row: string;
  column: string;
  share: string; // "35.2%"
  delta: string; // "+1.5pt" or "-2.3pt"
}

/**
 * MATRIX_DELTA_SHARE を生成
 * - すべての行・列を保持（高密度時も削除しない、表示方法のみ変更）
 * - 数値フォーマット：シェア％と delta ポイントを同時表示
 */
export function buildMatrixDeltaShare(input: MatrixDeltaInput): MatrixDeltaCell[] {
  const cells: MatrixDeltaCell[] = [];
  const baselineMap = new Map<string, number>();
  const currentMap = new Map<string, number>();

  // マップを構築
  input.rows.forEach((row, i) => {
    input.columns.forEach((col, j) => {
      const idx = i * input.columns.length + j;
      const key = `${row}-${col}`;
      if (idx < input.baselineValues.length) {
        baselineMap.set(key, input.baselineValues[idx]);
      }
      if (idx < input.currentValues.length) {
        currentMap.set(key, input.currentValues[idx]);
      }
    });
  });

  // セルを生成
  input.rows.forEach(row => {
    input.columns.forEach(col => {
      const key = `${row}-${col}`;
      const current = currentMap.get(key) ?? 0;
      const baseline = baselineMap.get(key) ?? 0;
      const delta = current - baseline;

      cells.push({
        row,
        column: col,
        share: `${current.toFixed(1)}%`,
        delta: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pt`,
      });
    });
  });

  return cells;
}
