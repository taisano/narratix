import type { DataPackBook, PackCell } from './dataPackExport';

/**
 * 組み立てたデータパックを .xlsx にする（write-excel-file の universal 版。Web Worker を使わない）。
 * 画面で押された時だけ読み込む（動的 import）ので、最初の表示は重くならない。
 * すべての値を文字列として書く：項目名やOverviewの文が「=」「+」「-」「@」で始まっても、数式として読まれない
 */

const MUTED = '#8A94A6';

function toCell(c: PackCell | null) {
  if (!c) return null;
  return {
    value: c.value, type: String,
    ...(c.bold ? { fontWeight: 'bold' as const } : {}),
    ...(c.fill ? { backgroundColor: c.fill } : {}),
    ...(c.muted ? { textColor: MUTED } : {}),
    ...(c.wrap ? { wrap: true } : {}),
    alignVertical: 'top' as const,
  };
}

export async function dataPackXlsx(book: DataPackBook): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const sheets = book.sheets.map((s) => ({
    sheet: s.name,
    columns: s.widths.map((width) => ({ width })),
    ...(s.stickyRows ? { stickyRowsCount: s.stickyRows } : {}),
    data: s.rows.map((r) => r.map(toCell)),
  }));
  return writeXlsxFile(sheets).toBlob();
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
