import type { Locale } from '@/registry';
import type { SceneItem, TextLine } from '../../scene';
import { INK, WHITE, mixColor } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import { placeNotes, refNotes } from './exec';
import type { TextAlign, TwoColColumn, TwoColContent, TwoColLook } from './types';

/**
 * 2カラム比較（STORY_TEXT_TWO_COLUMN）の配置。結論はメッセージタイトル。
 * 左右2つの枠（結論＋根拠のカードと同じ作り）。見出しは自由（空なら出さない）。間に → を入れられる。
 * 片側だけ入っていれば、その枠だけを左に描く。参照は見出し（無ければ1行目）の後ろに *1、下に注記
 */

export const TWO_COL_STYLE = { arrowW: 0.9, gap: 0.4, sizes: [20, 19, 18, 17, 16, 15, 14, 13, 12], labelSize: 22 } as const;

const filledItems = (c: TwoColColumn) => c.items.filter((i) => i.text.trim());
export const twoColFilled = (c: TwoColContent): boolean => c.cols.some((col) => filledItems(col).length > 0);

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });
const linesH = (ls: TextLine[]) => ls.reduce((a, l) => a + lineH(l.size), 0);

export function layoutTwoCol(c: TwoColContent, look: TwoColLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const S = CARD_STYLE, T = TWO_COL_STYLE;
  const items: SceneItem[] = [];
  const cols = c.cols.filter((col) => filledItems(col).length || col.label.trim());
  if (!cols.length) return { items, dense: false };
  const al: TextAlign = look.align ?? 'left';
  const notes = look.showRefs ? refNotes(cols.map((col) => col.refs), locale, slideNumber) : { mark: () => '', lines: [] };
  const noteH = placeNotes(items, notes.lines, area);
  const top = area.y + 0.1;
  const avail = area.y + area.h - noteH - top;
  const mid = look.arrow ? T.arrowW : T.gap;
  const cardW = (area.w - mid) / 2;
  const inner = cardW - 2 * S.pad;

  const build = (size: number) => cols.map((col, k) => {
    const label = col.label.trim() ? wrapText(col.label.trim() + notes.mark(k), T.labelSize, inner, 2) : [];
    const its = filledItems(col).map((it, i) => wrapText(it.text.trim() + (!label.length && i === 0 ? notes.mark(k) : ''), size, inner - textWidth('・', size) - 0.1, 4)
      .map((t, j) => ({ t: (j ? '　' : '・') + t, size, color: INK })));
    const need = 2 * S.pad + 0.06 + (label.length ? label.length * lineH(T.labelSize) + 0.22 : 0) + its.reduce((a, ls) => a + linesH(ls) + 0.12, 0);
    return { col, label, its, need };
  });
  let size: number = T.sizes[0];
  let built = build(size);
  for (const s of T.sizes) { size = s; built = build(s); if (Math.max(...built.map((b) => b.need)) <= avail) break; }
  const maxNeed = Math.max(...built.map((b) => b.need));
  const dense = maxNeed > avail;
  const cardH = dense ? maxNeed : Math.min(avail, Math.max(maxNeed + 0.5, avail * 0.8));

  built.forEach(({ col, label, its }, k) => {
    const em = look.emphasis === col.id;
    const x = area.x + k * (cardW + mid);
    items.push({ kind: 'box', x, y: top, w: cardW, h: cardH, fill: em ? mixColor(S.accent, WHITE, 0.9) : WHITE, line: em ? S.accent : S.border });
    items.push({ kind: 'line', x1: x, y1: top, x2: x + cardW, y2: top, color: em ? S.accent : S.number, width: em ? 4 : 3 });
    if (k === 0 && look.arrow && built.length === 2) {
      items.push({ kind: 'text', x: x + cardW, y: top + cardH / 2 - 0.3, w: mid, h: 0.6, lines: [{ t: '→', size: 36, bold: true, color: '#7A8794' }], align: 'center', valign: 'middle' });
    }
    let cy = top + S.pad + 0.06;
    if (label.length) {
      items.push(text(x + S.pad, cy, inner, label.length * lineH(T.labelSize), label.map((t) => ({ t, size: T.labelSize, bold: true, color: em ? S.accent : S.number })), al));
      cy += label.length * lineH(T.labelSize) + 0.22;
    }
    for (const ls of its) { items.push(text(x + S.pad, cy, inner, linesH(ls), ls, al)); cy += linesH(ls) + 0.12; }
  });
  return { items, dense };
}
