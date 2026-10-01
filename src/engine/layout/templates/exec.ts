import { EXEC_BLOCKS, localize, type Locale } from '@/registry';
import { slideText } from '@/i18n/slide';
import type { SceneItem, TextLine } from '../../scene';
import { INK, SEC, WHITE, mixColor } from '../../theme';
import { textWidth, wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import type { ExecBlock, ExecContent, ExecLook, TextAlign } from './types';

/**
 * Executive Summary（STORY_TEXT_EXECUTIVE_SUMMARY）の配置。結論はメッセージタイトル（本文には重ねない）。
 * 項目ごとに横長の段：左に項目名、中に本文、右端に参照スライド。段の間は細い横線。入れていない項目は描かない
 */

export const EXEC_STYLE = { labelW: 2.7, refW: 1.5, gap: 0.25, padY: 0.16, sizes: [16, 15, 14, 13, 12], minSize: 12 } as const;

export const filledBlocks = (c: ExecContent): ExecBlock[] => c.blocks.filter((b) => b.body.trim());

export const blockLabel = (b: ExecBlock, locale: Locale) => b.label.trim() || localize(EXEC_BLOCKS[b.id].label, locale);

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

export function layoutExec(c: ExecContent, look: ExecLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const E = EXEC_STYLE;
  const items: SceneItem[] = [];
  const blocks = filledBlocks(c);
  if (!blocks.length) return { items, dense: false };
  const al: TextAlign = look.align ?? 'left';
  const refText = (b: ExecBlock) => {
    if (!look.showRefs) return '';
    const ns = b.refs.map(slideNumber).filter((n): n is number => n != null).sort((a, z) => a - z);
    return ns.length ? slideText(locale, 'refSlides', { list: ns.join(locale === 'ja' ? '・' : ', ') }) : '';
  };
  const anyRefs = blocks.some((b) => refText(b));
  const labelW = look.showLabels ? E.labelW : 0;
  const refW = anyRefs ? E.refW : 0;
  const bodyX = area.x + (labelW ? labelW + E.gap : 0) + 0.1;
  const bodyW = area.w - (labelW ? labelW + E.gap : 0) - (refW ? refW + E.gap : 0) - 0.2;
  const top = area.y + 0.15;
  const avail = area.y + area.h - top;

  const layout = (size: number) => blocks.map((b) => {
    const body = wrapText(b.body.trim(), size, bodyW, 12);
    const label = labelW ? wrapText(blockLabel(b, locale), size - 1, labelW - 0.2, 3) : [];
    const h = Math.max(body.length * lineH(size), label.length * lineH(size - 1)) + 2 * E.padY;
    return { b, body, label, h };
  });
  let size: number = E.sizes[0];
  let rows = layout(size);
  for (const s of E.sizes) { size = s; rows = layout(s); if (rows.reduce((a, r) => a + r.h, 0) <= avail) break; }
  const dense = rows.reduce((a, r) => a + r.h, 0) > avail;
  const tint = mixColor(CARD_STYLE.accent, WHITE, 0.9);

  let y = top;
  rows.forEach(({ b, body, label, h }, i) => {
    const em = look.emphasis === b.id;
    if (em) items.push({ kind: 'box', x: area.x, y, w: area.w, h, fill: tint });
    // 段の区切り：一番上は濃い線、ほかは細い線
    items.push({ kind: 'line', x1: area.x, y1: y, x2: area.x + area.w, y2: y, color: i === 0 ? CARD_STYLE.number : CARD_STYLE.border, width: i === 0 ? 2 : 0.75 });
    if (label.length) items.push(text(area.x + 0.1, y + E.padY, labelW - 0.2, label.length * lineH(size - 1), label.map((t) => ({ t, size: size - 1, bold: true, color: em ? CARD_STYLE.accent : CARD_STYLE.number })), 'left'));
    items.push(text(bodyX, y + E.padY, bodyW, body.length * lineH(size), body.map((t) => ({ t, size, color: INK })), al));
    const r = refText(b);
    if (r) {
      const w = Math.min(refW, textWidth(r, 11) + 0.1);
      items.push(text(area.x + area.w - refW, y + E.padY + 0.02, refW, lineH(11), [{ t: r, size: 11, color: SEC }], w < refW ? 'right' : 'left'));
    }
    y += h;
  });
  items.push({ kind: 'line', x1: area.x, y1: y, x2: area.x + area.w, y2: y, color: CARD_STYLE.border, width: 0.75 });
  return { items, dense };
}
