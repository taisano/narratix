import { IIA_COLS, localize, type Locale } from '@/registry';
import type { SceneItem, TextLine } from '../../scene';
import { INK, SEC, WHITE, mixColor } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import { placeNotes, refNotes } from './exec';
import type { IiaColumn, IiaContent, IiaItem, IiaLook, TextAlign } from './types';

/**
 * 課題→示唆→アクション（STORY_TEXT_ISSUE_INSIGHT_ACTION）の配置。結論はメッセージタイトル（本文には重ねない）。
 * 横並び：3つの枠を左から右へ矢印でつなぐ。縦並び：3段を上から下へ（左に見出し、右に行）。
 * 枠の作りは結論＋根拠のカードと同じ。入れていない枠・行は描かない。参照は見出しの後ろに *1、下に注記
 */

export const IIA_STYLE = { arrowW: 0.6, sizes: [16, 15, 14, 13, 12], minSize: 12, labelSize: 18, labelW: 2.6, arrow: '#7A8794' } as const;

const filledItems = (c: IiaColumn) => c.items.filter((i) => i.text.trim());
export const iiaFilled = (c: IiaContent): boolean => c.cols.some((col) => filledItems(col).length > 0);
export const colLabel = (c: IiaColumn, locale: Locale) => c.label.trim() || localize(IIA_COLS[c.id].label, locale);

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

/** 1行（「・」付き）と、アクションの担当・期限（小さく） */
function itemLines(it: IiaItem, size: number, w: number, withOwner: boolean, locale: Locale): TextLine[] {
  // 「・」の後ろの行は、字下げして本文の頭に揃える
  const out: TextLine[] = wrapText(it.text.trim(), size, w - textWidth('・', size) - 0.1, 4).map((t, k) => ({ t: (k ? '　' : '・') + t, size, color: INK }));
  const meta = [it.owner.trim(), it.due.trim()].filter(Boolean).join(locale === 'ja' ? '・' : ', ');
  if (withOwner && meta) out.push({ t: locale === 'ja' ? `　（${meta}）` : `  (${meta})`, size: size - 3, color: SEC });
  return out;
}
const linesH = (ls: TextLine[]) => ls.reduce((a, l) => a + lineH(l.size), 0);

export function layoutIia(c: IiaContent, look: IiaLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const S = CARD_STYLE, I = IIA_STYLE;
  const items: SceneItem[] = [];
  const cols = c.cols.filter((col) => filledItems(col).length);
  if (!cols.length) return { items, dense: false };
  const al: TextAlign = look.align ?? 'left';
  const notes = look.showRefs ? refNotes(cols.map((col) => col.refs), locale, slideNumber) : { mark: () => '', lines: [] };
  const noteH = placeNotes(items, notes.lines, area);
  const top = area.y + 0.1;
  const avail = area.y + area.h - noteH - top;
  const n = cols.length;
  const vertical = look.layout === 'vertical';
  const cardW = vertical ? area.w : (area.w - I.arrowW * (n - 1)) / n;
  const innerW = vertical ? area.w - I.labelW - 3 * S.pad : cardW - 2 * S.pad;
  const numH = look.showNumbers && !vertical ? 0.42 : 0;
  const withOwner = (col: IiaColumn) => col.id === 'action' && look.showOwner;

  const build = (size: number) => cols.map((col) => {
    const its = filledItems(col).map((it) => itemLines(it, size, innerW, withOwner(col), locale));
    const label = wrapText(colLabel(col, locale) + notes.mark(cols.indexOf(col)), I.labelSize, vertical ? I.labelW - 0.4 : innerW, 2);
    const body = its.reduce((a, ls) => a + linesH(ls) + 0.08, 0);
    const need = vertical ? Math.max(body, label.length * lineH(I.labelSize) + (look.showNumbers ? 0.4 : 0)) + 2 * S.pad
      : numH + label.length * lineH(I.labelSize) + 0.16 + body + 2 * S.pad;
    return { col, its, label, need };
  });
  const gapV = 0.42;
  const room = vertical ? (avail - gapV * (n - 1)) / n : avail;
  let size: number = I.sizes[0];
  let built = build(size);
  for (const s of I.sizes) { size = s; built = build(s); if (Math.max(...built.map((b) => b.need)) <= room) break; }
  const maxNeed = Math.max(...built.map((b) => b.need));
  const dense = maxNeed > room;
  const cardH = dense ? maxNeed : Math.min(room, Math.max(maxNeed + (vertical ? 0.2 : 0.5), vertical ? 1.2 : 2.8));

  built.forEach(({ col, its, label }, k) => {
    const em = look.emphasis === col.id;
    const accent = em ? S.accent : S.number;
    const x = vertical ? area.x : area.x + k * (cardW + I.arrowW);
    const y = vertical ? top + k * (cardH + gapV) : top;
    items.push({ kind: 'box', x, y, w: cardW, h: cardH, fill: em ? mixColor(S.accent, WHITE, 0.9) : WHITE, line: em ? S.accent : S.border });
    if (vertical) items.push({ kind: 'line', x1: x, y1: y, x2: x, y2: y + cardH, color: accent, width: em ? 4 : 3 });
    else items.push({ kind: 'line', x1: x, y1: y, x2: x + cardW, y2: y, color: accent, width: em ? 4 : 3 });
    const num = String(k + 1).padStart(2, '0');
    // 矢印（次の枠へ）
    if (k < n - 1) {
      if (vertical) items.push(text(x + 0.2, y + cardH + 0.02, I.labelW - 0.4, gapV - 0.04, [{ t: '↓', size: 26, bold: true, color: I.arrow }], 'center'));
      else items.push({ kind: 'text', x: x + cardW, y: y + cardH / 2 - 0.25, w: I.arrowW, h: 0.5, lines: [{ t: '→', size: 32, bold: true, color: I.arrow }], align: 'center', valign: 'middle' });
    }
    if (vertical) {
      let ly = y + S.pad;
      if (look.showNumbers) { items.push(text(x + 0.25, ly - 0.04, I.labelW - 0.4, 0.4, [{ t: num, size: 18, bold: true, color: accent }], 'left')); ly += 0.4; }
      items.push(text(x + 0.25, ly, I.labelW - 0.4, label.length * lineH(I.labelSize), label.map((t) => ({ t, size: I.labelSize, bold: true, color: em ? S.accent : INK })), 'left'));
      let cy = y + S.pad;
      const bx = x + I.labelW + S.pad;
      for (const ls of its) { items.push(text(bx, cy, innerW, linesH(ls), ls, al)); cy += linesH(ls) + 0.08; }
      return;
    }
    let cy = y + S.pad + 0.06;
    if (look.showNumbers) { items.push(text(x + S.pad, cy - 0.04, innerW, numH, [{ t: num, size: 20, bold: true, color: accent }], al)); cy += numH; }
    items.push(text(x + S.pad, cy, innerW, label.length * lineH(I.labelSize), label.map((t) => ({ t, size: I.labelSize, bold: true, color: em ? S.accent : INK })), al));
    cy += label.length * lineH(I.labelSize) + 0.16;
    for (const ls of its) { items.push(text(x + S.pad, cy, innerW, linesH(ls), ls, al)); cy += linesH(ls) + 0.08; }
  });
  return { items, dense };
}
