import type { Rect, TableCell, TableItem, TextItem } from '../../scene';
import { textWidth } from '../../text';

/**
 * 表を横向きにする（上下構成の下段に置く時：項目を横に並べ、指標を行に）。
 * 1行目（見出し）と1列目（項目名）を入れ替え、列の幅を置き場所の幅に合わせて配り直す。セルの色（CAGR の濃さなど）はそのまま
 */
export function transposeTable(items: (TableItem | TextItem)[], rect: Rect): (TableItem | TextItem)[] {
  return items.map((it) => {
    if (it.kind !== 'table') return it;
    const rows = it.rows;
    const nRows = rows.length, nCols = rows[0]?.length ?? 0;
    const out: TableCell[][] = Array.from({ length: nCols }, (_, c) => Array.from({ length: nRows }, (_, r) => {
      const cell = rows[r]![c]!;
      // 項目名（元の1列目）は見出しの行に、元の見出しは1列目に
      if (c === 0) return { ...cell, align: r === 0 ? 'left' : 'center', fill: r === 0 ? cell.fill : '#EEF1F0', color: cell.color, bold: true };
      return { ...cell, align: r === 0 ? 'left' : 'center' };
    }));
    const size = out[0]?.[0]?.size ?? 10;
    const first = Math.min(rect.w * 0.25, Math.max(0.8, ...out.map((row) => textWidth(row[0]!.text, size) + 0.25)));
    const rest = (rect.w - first) / Math.max(1, nRows - 1);
    return { ...it, colW: [first, ...Array.from({ length: nRows - 1 }, () => rest)], rows: out };
  });
}
