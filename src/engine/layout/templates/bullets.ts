import type { Locale } from '@/registry';
import type { SceneItem, TextLine } from '../../scene';
import { INK, SEC, WHITE, mixColor } from '../../theme';
import { wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import { placeNotes, refNotes } from './exec';
import type { Bullet, BulletsContent, BulletsLook, TextAlign } from './types';

/**
 * 箇条書き（STORY_TEXT_BULLETS）の配置。結論はメッセージタイトル。
 * 左に印（番号か小さな四角）、右に本文と小さい補足。行の間は細い横線。強調した行は薄いオレンジの背景。
 * 参照は本文の後ろに *1、下に注記。入れていない行は描かない
 */

export const BULLET_STYLE = { markW: 0.7, sizes: [24, 22, 20, 19, 18, 17, 16, 15, 14], padY: 0.18 } as const;

export const filledBullets = (c: BulletsContent): Bullet[] => c.items.filter((x) => x.text.trim());

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

export function layoutBullets(c: BulletsContent, look: BulletsLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const B = BULLET_STYLE;
  const items: SceneItem[] = [];
  const bs = filledBullets(c);
  if (!bs.length) return { items, dense: false };
  const al: TextAlign = look.align ?? 'left';
  const notes = look.showRefs ? refNotes(bs.map((x) => (x.ref ? [x.ref] : [])), locale, slideNumber) : { mark: () => '', lines: [] };
  const noteH = placeNotes(items, notes.lines, area);
  const top = area.y + 0.15;
  const avail = area.y + area.h - noteH - top;
  const bodyX = area.x + B.markW, bodyW = area.w - B.markW - 0.15;

  const build = (size: number) => bs.map((b, i) => {
    const main = wrapText(b.text.trim() + notes.mark(i), size, bodyW, 3);
    const sub = b.sub.trim() ? wrapText(b.sub.trim(), size - 5, bodyW, 2) : [];
    const h = main.length * lineH(size) + (sub.length ? 0.06 + sub.length * lineH(size - 5) : 0) + 2 * B.padY;
    return { b, main, sub, h };
  });
  let size: number = B.sizes[0];
  let rows = build(size);
  for (const s of B.sizes) { size = s; rows = build(s); if (rows.reduce((a, r) => a + r.h, 0) <= avail) break; }
  const total = rows.reduce((a, r) => a + r.h, 0);
  const dense = total > avail;
  // 余裕があれば行の間を少し広げる（上に固まりすぎないように）
  const extra = dense ? 0 : Math.min(0.25, (avail - total) / rows.length / 2);
  const tint = mixColor(CARD_STYLE.accent, WHITE, 0.9);

  let y = top;
  rows.forEach(({ b, main, sub, h }, i) => {
    const em = look.emphasis === b.id;
    const rh = h + 2 * extra;
    const color = em ? CARD_STYLE.accent : CARD_STYLE.number;
    if (em) items.push({ kind: 'box', x: area.x, y, w: area.w, h: rh, fill: tint });
    if (i > 0) items.push({ kind: 'line', x1: area.x, y1: y, x2: area.x + area.w, y2: y, color: CARD_STYLE.border, width: 0.75 });
    const ty = y + B.padY + extra;
    if (look.marker === 'number') items.push(text(area.x + 0.1, ty, B.markW - 0.2, lineH(size), [{ t: String(i + 1), size, bold: true, color }], 'center'));
    else { const d = Math.max(0.1, (size / 72) * 0.42); items.push({ kind: 'box', x: area.x + 0.25, y: ty + (lineH(size) - d) / 2, w: d, h: d, fill: color }); }
    items.push(text(bodyX, ty, bodyW, main.length * lineH(size), main.map((t) => ({ t, size, bold: em, color: INK })), al));
    if (sub.length) items.push(text(bodyX, ty + main.length * lineH(size) + 0.06, bodyW, sub.length * lineH(size - 5), sub.map((t) => ({ t, size: size - 5, color: SEC })), al));
    y += rh;
  });
  return { items, dense };
}
