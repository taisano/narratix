import { EXEC_BLOCKS, localize, type Locale } from '@/registry';
import { slideText } from '@/i18n/slide';
import type { SceneItem, TextLine } from '../../scene';
import { INK, SEC, WHITE, mixColor } from '../../theme';
import { wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { lineH, type TableBox } from './comparison';
import type { ExecBlock, ExecContent, ExecLook, TextAlign } from './types';

/**
 * Executive Summary（STORY_TEXT_EXECUTIVE_SUMMARY）の配置。結論はメッセージタイトル（本文には重ねない）。
 * 項目ごとに横長の段：左に項目名、中に本文、右端に参照スライド。段の間は細い横線。入れていない項目は描かない
 */

export const EXEC_STYLE = { labelW: 2.7, gap: 0.25, padY: 0.16, sizes: [16, 15, 14, 13, 12], minSize: 12 } as const;

export const filledBlocks = (c: ExecContent): ExecBlock[] => c.blocks.filter((b) => b.body.trim());

/** 何か書いてあるか（定型は項目、自由は本文） */
export const execFilled = (c: ExecContent): boolean => (c.mode === 'free' ? !!c.free?.body.trim() : c.blocks.some((b) => b.body.trim()));

export const blockLabel = (b: ExecBlock, locale: Locale) => b.label.trim() || localize(EXEC_BLOCKS[b.id].label, locale);

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

/** 参照スライドの注記：本文の後ろの印（*1）と、下に出す注記の行 */
export function refNotes(groups: string[][], locale: Locale, slideNumber: (id: string) => number | null): { mark: (i: number) => string; lines: string[] } {
  const marks = new Map<number, number>();
  const lines: string[] = [];
  groups.forEach((refs, i) => {
    const ns = [...new Set(refs.map(slideNumber).filter((n): n is number => n != null))].sort((a, z) => a - z);
    if (!ns.length) return;
    const k = lines.length + 1;
    marks.set(i, k);
    lines.push(`*${k} ${slideText(locale, 'refSlides', { list: ns.join(locale === 'ja' ? '・' : ', ') }).replace(/^→\s*/, '')}`);
  });
  return { mark: (i) => (marks.has(i) ? ` *${marks.get(i)}` : ''), lines };
}

/** 注記を内容の領域の下に置く（高さを返す） */
export function placeNotes(items: SceneItem[], lines: string[], area: TableBox): number {
  if (!lines.length) return 0;
  const wrapped = wrapText(lines.join(' 　'), 10, area.w, 3);
  const h = wrapped.length * lineH(10);
  items.push(text(area.x, area.y + area.h - h, area.w, h, wrapped.map((t) => ({ t, size: 10, color: SEC })), 'left'));
  return h + 0.15;
}

export function layoutExec(c: ExecContent, look: ExecLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  return c.mode === 'free' ? layoutFree(c, look, area, locale, slideNumber) : layoutFixed(c, look, area, locale, slideNumber);
}

/** 自由に書く：本文をそのまま（「・」の行はそのまま箇条書き）。上に細い紺の線 */
function layoutFree(c: ExecContent, look: ExecLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const items: SceneItem[] = [];
  const body = c.free?.body.trim() ?? '';
  if (!body) return { items, dense: false };
  // 自由に書く時は、本文のどこに付くか決まらないので印（*1）は付けず、下に「参照：スライド 2・3」だけ
  const ns = look.showRefs ? [...new Set((c.free?.refs ?? []).map(slideNumber).filter((n): n is number => n != null))].sort((a, z) => a - z) : [];
  const noteH = placeNotes(items, ns.length ? [slideText(locale, 'refSlide', { n: ns.join(locale === 'ja' ? '・' : ', ') })] : [], area);
  const top = area.y + 0.15;
  const avail = area.y + area.h - noteH - top - 0.2;
  const full = body;
  let size = 18;
  let lines = wrapText(full, size, area.w - 0.2, 40);
  for (const s of [18, 17, 16, 15, 14, 13, 12]) { size = s; lines = wrapText(full, s, area.w - 0.2, 40); if (lines.length * lineH(s) * 1.1 <= avail) break; }
  items.push({ kind: 'line', x1: area.x, y1: top, x2: area.x + area.w, y2: top, color: CARD_STYLE.number, width: 2 });
  items.push(text(area.x + 0.1, top + 0.2, area.w - 0.2, lines.length * lineH(size) * 1.1, lines.map((t) => ({ t, size, color: INK })), look.align ?? 'left'));
  return { items, dense: lines.length * lineH(size) * 1.1 > avail };
}

/** 定型（5項目）：項目ごとに横長の段。左に項目名、右に本文。参照は本文の後ろに *1、下に注記 */
function layoutFixed(c: ExecContent, look: ExecLook, area: TableBox, locale: Locale, slideNumber: (id: string) => number | null): { items: SceneItem[]; dense: boolean } {
  const E = EXEC_STYLE;
  const items: SceneItem[] = [];
  const blocks = filledBlocks(c);
  if (!blocks.length) return { items, dense: false };
  const al: TextAlign = look.align ?? 'left';
  const notes = look.showRefs ? refNotes(blocks.map((b) => b.refs), locale, slideNumber) : { mark: () => '', lines: [] };
  const noteH = placeNotes(items, notes.lines, area);
  const labelW = look.showLabels ? E.labelW : 0;
  const bodyX = area.x + (labelW ? labelW + E.gap : 0) + 0.1;
  const bodyW = area.w - (labelW ? labelW + E.gap : 0) - 0.2;
  const top = area.y + 0.15;
  const avail = area.y + area.h - noteH - top;

  const layout = (size: number) => blocks.map((b, i) => {
    const body = wrapText(b.body.trim() + notes.mark(i), size, bodyW, 12);
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
    y += h;
  });
  items.push({ kind: 'line', x1: area.x, y1: y, x2: area.x + area.w, y2: y, color: CARD_STYLE.border, width: 0.75 });
  return { items, dense };
}
