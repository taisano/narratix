import { registry } from '@/registry';
import type { SceneItem, TableCell, TableItem } from '../../scene';
import { ACCENT_COLORS, INK, SEC, WHITE, mixColor } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { alignOf, formatCell } from './cells';
import type { ComparisonContent, ComparisonLook } from './types';

/**
 * 比較表（STORY_TABLE_COMPARISON）の配置。表の描き方は、この後の表の型（KPI スコアカード・増減付き表など）でも使う。
 * 見出しの行は濃い紺に白い文字、1列目は左揃え、数は右、短い評価の語は中央。罫線は行の区切りの細い横線だけ。
 * 入り切らない時は文字を小さくするが、MIN_SIZE より小さくはしない（入り切らないことを知らせる）
 */

export const TABLE_STYLE = {
  headFill: '#0B2D4D',
  line: '#D5DBE0',
  linePt: 0.75,
  accent: ACCENT_COLORS.orange,
  sizes: [16, 15, 14, 13, 12, 11, 10],
  minSize: 10,
  /** セルの左右・上下の余白（インチ） */
  padX: 0.12,
  padY: 0.12,
  maxLinesPerCell: 4,
} as const;

/** 文字の行の高さ（インチ） */
export const lineH = (pt: number) => (pt / 72) * 1.3;

export interface TableBox { x: number; y: number; w: number; h: number }

export interface LaidTable { item: TableItem | null; height: number; dense: boolean }

/** 表の型ごとの上書き（増減付き表の増減の色・合計の行の太字など） */
export interface TableExtra {
  /** 本文のセルの文字の色（無ければ既定） */
  color?: (i: number, j: number) => string | undefined;
  /** 太字にする行（合計など） */
  bold?: (i: number) => boolean;
}

/** 比較表の本体（表のアイテム）。box の中に収める。表の型（増減付き表など）でも使う */
export function layoutComparisonTable(c: ComparisonContent, look: ComparisonLook, box: TableBox, extra: TableExtra = {}): LaidTable {
  const S = TABLE_STYLE;
  const rows = c.cells.filter((r) => r.length);
  const nCols = Math.max(0, ...rows.map((r) => r.length));
  if (!rows.length || !nCols) return { item: null, height: 0, dense: false };
  const grid = rows.map((r) => Array.from({ length: nCols }, (_, j) => r[j] ?? ''));
  const isHeadRow = (i: number) => c.headerRow && i === 0;
  const isHeadCol = (j: number) => c.headerCol && j === 0;
  const fmtKey = (i: number, j: number) => (look.formatAxis === 'row' ? String(i) : String(j));
  const display = grid.map((r, i) => r.map((v, j) => (isHeadRow(i) || isHeadCol(j) ? v.trim() : formatCell(v, look.formats[fmtKey(i, j)]))));

  const attempt = (size: number) => {
    // 1列目（比較項目）は中身に合わせた幅（狭すぎず、表の3割まで）。ほかは同じ幅
    const lead = c.headerCol && nCols > 1;
    const firstW = lead ? Math.min(box.w * 0.32, Math.max(1.6, Math.max(...display.map((r) => textWidth(r[0]!, size) * 1.05)) + 2 * S.padX)) : 0;
    const colW = Array.from({ length: nCols }, (_, j) => (!lead ? box.w / nCols : j === 0 ? firstW : (box.w - firstW) / (nCols - 1)));
    const wrapped = display.map((r) => r.map((t, j) => wrapText(t, size, colW[j]! - 2 * S.padX, S.maxLinesPerCell)));
    const rowHs = wrapped.map((r, i) => Math.max(isHeadRow(i) ? 0.52 : 0.56, Math.max(1, ...r.map((ls) => ls.length)) * lineH(size) + 2 * S.padY));
    return { size, colW, wrapped, rowHs, height: rowHs.reduce((a, b) => a + b, 0) };
  };
  let fit = attempt(S.sizes[0]);
  for (const size of S.sizes) { fit = attempt(size); if (fit.height <= box.h) break; }
  const dense = fit.height > box.h;

  const e = look.emphasis;
  const tint = mixColor(S.accent, WHITE, 0.86);
  const emphasized = (i: number, j: number) =>
    (e.kind === 'col' && e.index === j) || (e.kind === 'row' && e.index === i) || (e.kind === 'cell' && e.row === i && e.col === j);

  // 揃えを選んでいれば、本文と見出しの行をその揃えに（比較項目の列は左のまま）
  const fixed = look.align && look.align !== 'auto' ? look.align : null;
  const cells: TableCell[][] = fit.wrapped.map((r, i) => r.map((ls, j) => {
    const text = ls.join('\n');
    const head = isHeadRow(i);
    const em = emphasized(i, j);
    if (head) {
      // 見出しの行：濃い紺に白（背景なしなら紺の太字）。強調した列の見出しはアクセント色
      const fill = look.headerFill ? (em ? S.accent : S.headFill) : null;
      return { text, fill, color: look.headerFill ? WHITE : em ? S.accent : INK, align: isHeadCol(j) ? 'left' : fixed ?? 'center', size: fit.size, bold: true };
    }
    return {
      text, fill: em ? tint : null,
      color: extra.color?.(i, j) ?? (em && e.kind === 'cell' ? mixColor(S.accent, INK, 0.35) : INK),
      align: isHeadCol(j) ? 'left' : fixed ?? alignOf(display[i]![j]!),
      size: fit.size, bold: isHeadCol(j) || em || !!extra.bold?.(i),
    };
  }));
  const item: TableItem = {
    kind: 'table', x: box.x, y: box.y, colW: fit.colW, rowH: fit.rowHs[0]!, rowHs: fit.rowHs, rows: cells,
    border: { color: look.rowLines ? S.line : WHITE, pt: S.linePt }, grid: 'rows', pad: S.padX,
  };
  return { item, height: fit.height, dense };
}

/** 補足・注記の文字（灰色、折り返し） */
function noteText(t: string, x: number, y: number, w: number, size: number, maxLines: number): { item: SceneItem; h: number } {
  const lines = wrapText(t, size, w, maxLines);
  const h = lines.length * lineH(size);
  return { item: { kind: 'text', x, y, w, h, lines: lines.map((l) => ({ t: l, size, color: SEC })), align: 'left', valign: 'top' }, h };
}

/** 比較表のスライドの中身（タイトル・出典の枠の内側）。返す dense＝最小の文字でも入り切らない */
export function layoutComparison(c: ComparisonContent, look: ComparisonLook, area: TableBox, extra: TableExtra = {}): { items: SceneItem[]; dense: boolean } {
  const items: SceneItem[] = [];
  let top = area.y;
  if (look.showLead && c.lead.trim()) {
    const n = noteText(c.lead.trim(), area.x, top, area.w, 13, 2);
    items.push(n.item);
    top += n.h + 0.16;
  }
  let bottom = area.y + area.h;
  // 注記は表のすぐ下（高さは先に取っておく）
  const noteLines = c.note.trim() ? wrapText(c.note.trim(), 10, area.w, 2) : [];
  const noteH = noteLines.length * lineH(10);
  if (noteH) bottom -= noteH + 0.14;
  const t = layoutComparisonTable(c, look, { x: area.x, y: top, w: area.w, h: bottom - top }, extra);
  if (t.item) items.push(t.item);
  if (noteH) items.push({ kind: 'text', x: area.x, y: top + t.height + 0.14, w: area.w, h: noteH, lines: noteLines.map((x) => ({ t: x, size: 10, color: SEC })), align: 'left', valign: 'top' });
  return { items, dense: t.dense };
}

/** スライドの枠の内容の領域（タイトルの下〜出典の上） */
export const templateArea = (): TableBox => {
  const F = registry.slideFrame;
  return { x: F.margin.left, y: F.content.top + 0.04, w: F.width - F.margin.left - F.margin.right, h: F.content.bottom - F.content.top - 0.04 };
};
