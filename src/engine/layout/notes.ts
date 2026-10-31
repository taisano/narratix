import { slideText } from '@/i18n/slide';
import type { Locale, ViewSpec } from '@/registry';
import type { Rect, SceneItem, TextLine } from '../scene';
import { INK, SEC } from '../theme';
import { wrapText } from '../text';

type Notes = NonNullable<ViewSpec['slide']['notes']>;

/** 右の列の幅の割合・チャートとの間 */
export const NOTES = { share: 0.3, gap: 0.34 } as const;

const TONE: Record<string, string> = { accent: '#1B7F79', up: '#1B7F79', down: '#B84A4A', plain: INK };

/** 補足の列の分だけ、チャートの領域（content）を左に狭める */
export function notesSplit(content: Rect): { main: Rect; side: Rect } {
  const w = Math.round(content.w * NOTES.share * 100) / 100;
  return {
    main: { ...content, w: content.w - w - NOTES.gap },
    side: { x: content.x + content.w - w, y: content.y, w, h: content.h },
  };
}

/**
 * 右の列：区切りの線、列の見出し、項目（見出し＋本文）。入り切らない時は文字を少し小さくする。
 * 本文は入力した改行を生かし、幅で折り返す
 */
export function layoutNotes(notes: Notes, side: Rect, locale: Locale): SceneItem[] {
  const items: SceneItem[] = [
    { kind: 'line', x1: side.x - NOTES.gap / 2, y1: side.y, x2: side.x - NOTES.gap / 2, y2: side.y + side.h, color: '#E3E8EE', width: 0.75 },
  ];
  const LH = 1.32 / 72; // 1pt あたりの行の高さ（インチ）
  const build = (k: number) => {
    const headSize = Math.round(13 * k), bodySize = Math.round(11 * k), titleSize = Math.round(11 * k);
    const title = notes.title?.trim() || slideText(locale, 'notesTitle');
    const blocks = notes.items.map((it) => {
      const lines: TextLine[] = [];
      if (it.head) lines.push({ t: it.head, size: headSize, bold: true, color: TONE[it.tone ?? 'plain'] });
      for (const t of wrapText(it.body, bodySize, side.w * 0.96, 12)) lines.push({ t, size: bodySize, color: INK });
      const h = lines.reduce((a, l) => a + l.size * LH, 0);
      return { lines, h };
    });
    const total = titleSize * LH + 0.22 + blocks.reduce((a, b) => a + b.h, 0) + 0.26 * Math.max(0, blocks.length - 1);
    return { title, titleSize, blocks, total };
  };
  let k = 1, b = build(k);
  while (b.total > side.h && k > 0.7) { k -= 0.05; b = build(k); }
  let y = side.y;
  items.push({ kind: 'text', x: side.x, y, w: side.w, h: b.titleSize * LH + 0.04, lines: [{ t: b.title, size: b.titleSize, bold: true, color: SEC }], align: 'left', valign: 'top' });
  y += b.titleSize * LH + 0.22;
  for (const blk of b.blocks) {
    items.push({ kind: 'text', x: side.x, y, w: side.w, h: blk.h + 0.04, lines: blk.lines, align: 'left', valign: 'top' });
    y += blk.h + 0.26;
  }
  return items;
}
