import type { Locale } from '@/registry';
import type { SceneItem, TextLine } from '../../scene';
import { INK, SEC } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import { placeNotes, refNotes } from './exec';
import type { BigNumber, NumbersContent, NumbersLook, TextAlign } from './types';

/**
 * 数字＋短い説明（STORY_TEXT_NUMBERS）の配置。結論はメッセージタイトル。数字は計算せず入れたまま大きく。
 * 1個なら大きく1つ（左に数字、右に何の数字かと説明）、2〜3個は横並び（細い縦線で区切る）、縦並びも選べる。
 * カードの枠は使わず、数字を主役にする。入れていないかたまりは描かない。参照は「何の数字か」の後ろに *1、下に注記
 */

export const NUM_STYLE = { gap: 0.5, sizes: [72, 64, 56, 48, 44, 40, 36, 32], heroSizes: [110, 96, 84, 72, 64, 56], label: 18, body: 16 } as const;

export const filledNumbers = (c: NumbersContent): BigNumber[] => c.items.filter((x) => x.value.trim() || x.label.trim() || x.body.trim());

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

/** 幅に入る一番大きな数字の大きさ */
const fitSize = (vals: string[], w: number, sizes: readonly number[]) =>
  sizes.find((s) => vals.every((v) => textWidth(v, s) * 0.95 <= w)) ?? sizes[sizes.length - 1]!;

export function layoutNumbers(c: NumbersContent, look: NumbersLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const S = NUM_STYLE;
  const items: SceneItem[] = [];
  const nums = filledNumbers(c);
  if (!nums.length) return { items, dense: false };
  const al: TextAlign = look.align ?? 'left';
  const notes = look.showRefs ? refNotes(nums.map((x) => (x.ref ? [x.ref] : [])), locale, slideNumber) : { mark: () => '', lines: [] };
  const noteH = placeNotes(items, notes.lines, area);
  const avail = area.h - noteH;
  const n = nums.length;
  const mode = look.layout === 'auto' ? (n === 1 ? 'hero' : 'horizontal') : look.layout;
  const colorOf = (x: BigNumber) => (look.emphasis === x.id ? CARD_STYLE.accent : CARD_STYLE.number);
  let dense = false;

  const labelLines = (x: BigNumber, i: number, w: number) => (x.label.trim() ? wrapText(x.label.trim() + notes.mark(i), S.label, w, 2) : []);
  const bodyLines = (x: BigNumber, w: number, size: number = S.body) => (x.body.trim() ? wrapText(x.body.trim(), size, w, 4) : []);

  if (mode === 'hero') {
    // 大きく1つ：左に数字、右に何の数字かと説明。内容の領域の上寄りの中ほど
    const x = nums[0]!;
    const maxW = area.w * 0.48;
    const size = fitSize([x.value.trim()], maxW, S.heroSizes);
    // 説明は数字のすぐ右に（間を空けすぎない）
    const leftW = Math.min(maxW, textWidth(x.value.trim(), size) * 0.95 + 0.2);
    const rightX = area.x + leftW + S.gap, rightW = Math.min(area.w - leftW - S.gap, 6.5);
    const ll = labelLines(x, 0, rightW);
    const bl = bodyLines(x, rightW, 18);
    const blockH = Math.max(lineH(size), ll.length * lineH(S.label + 2) + 0.15 + bl.length * lineH(18));
    const y = area.y + Math.max(0.2, (avail - blockH) / 3);
    items.push({ kind: 'line', x1: area.x, y1: y - 0.15, x2: area.x + 0.9, y2: y - 0.15, color: colorOf(x), width: 4 });
    if (x.value.trim()) items.push(text(area.x, y, leftW, lineH(size), [{ t: x.value.trim(), size, bold: true, color: colorOf(x) }], 'left'));
    let cy = y + Math.max(0, (lineH(size) - (ll.length * lineH(S.label + 2) + 0.15 + bl.length * lineH(18))) / 2);
    if (ll.length) { items.push(text(rightX, cy, rightW, ll.length * lineH(S.label + 2), ll.map((t) => ({ t, size: S.label + 2, bold: true, color: INK })), 'left')); cy += ll.length * lineH(S.label + 2) + 0.15; }
    if (bl.length) items.push(text(rightX, cy, rightW, bl.length * lineH(18), bl.map((t) => ({ t, size: 18, color: SEC })), 'left'));
    return { items, dense: blockH > avail };
  }

  if (mode === 'vertical') {
    // 縦並び：左に数字、右に何の数字かと説明。段の間は細い横線
    const leftW = Math.min(4.2, area.w * 0.36);
    const size = fitSize(nums.map((x) => x.value.trim()), leftW - 0.2, S.sizes.filter((s) => s <= 56));
    const rightX = area.x + leftW + S.gap, rightW = area.w - leftW - S.gap;
    const rowH = (avail - 0.2) / n;
    nums.forEach((x, i) => {
      const y = area.y + 0.15 + i * rowH;
      if (i > 0) items.push({ kind: 'line', x1: area.x, y1: y - 0.05, x2: area.x + area.w, y2: y - 0.05, color: CARD_STYLE.border, width: 0.75 });
      const ll = labelLines(x, i, rightW);
      const bl = bodyLines(x, rightW);
      const need = Math.max(lineH(size), ll.length * lineH(S.label) + 0.08 + bl.length * lineH(S.body)) + 0.2;
      if (need > rowH) dense = true;
      if (x.value.trim()) items.push(text(area.x, y + 0.05, leftW, lineH(size), [{ t: x.value.trim(), size, bold: true, color: colorOf(x) }], al));
      let cy = y + 0.12;
      if (ll.length) { items.push(text(rightX, cy, rightW, ll.length * lineH(S.label), ll.map((t) => ({ t, size: S.label, bold: true, color: INK })), 'left')); cy += ll.length * lineH(S.label) + 0.08; }
      if (bl.length) items.push(text(rightX, cy, rightW, bl.length * lineH(S.body), bl.map((t) => ({ t, size: S.body, color: SEC })), 'left'));
    });
    return { items, dense };
  }

  // 横並び：同じ幅の列。列の間は細い縦線
  const colW = (area.w - S.gap * (n - 1)) / n;
  const inner = colW - 0.1;
  const size = fitSize(nums.map((x) => x.value.trim()), inner, S.sizes);
  const heights = nums.map((x, i) => 0.25 + lineH(size) + 0.1 + labelLines(x, i, inner).length * lineH(S.label) + 0.1 + bodyLines(x, inner).length * lineH(S.body));
  const blockH = Math.max(...heights);
  const y = area.y + Math.max(0.2, (avail - blockH) / 3);
  if (blockH > avail) dense = true;
  nums.forEach((x, i) => {
    const cx = area.x + i * (colW + S.gap);
    if (i > 0) items.push({ kind: 'line', x1: cx - S.gap / 2, y1: y, x2: cx - S.gap / 2, y2: y + blockH, color: CARD_STYLE.border, width: 0.75 });
    // 短いアクセントライン（揃えに合わせて）
    const barW = 0.7;
    const bx = al === 'left' ? cx : al === 'center' ? cx + (colW - barW) / 2 : cx + colW - barW;
    items.push({ kind: 'line', x1: bx, y1: y, x2: bx + barW, y2: y, color: colorOf(x), width: 4 });
    let cy = y + 0.25;
    if (x.value.trim()) items.push(text(cx, cy, colW, lineH(size), [{ t: x.value.trim(), size, bold: true, color: colorOf(x) }], al));
    cy += lineH(size) + 0.1;
    const ll = labelLines(x, i, inner);
    if (ll.length) { items.push(text(cx, cy, colW, ll.length * lineH(S.label), ll.map((t) => ({ t, size: S.label, bold: true, color: INK })), al)); cy += ll.length * lineH(S.label) + 0.1; }
    const bl = bodyLines(x, inner);
    if (bl.length) items.push(text(cx, cy, colW, bl.length * lineH(S.body), bl.map((t) => ({ t, size: S.body, color: SEC })), al));
  });
  return { items, dense };
}
