import { registry, type ViewSpec } from '@/registry';
import type { Rect, TextItem } from '../scene';
import { INK, SEC } from '../theme';
import { wrapText } from '../text';

/** スライドの枠（タイトル、出典、パネル領域）。全レイアウト共通 */
export function layoutFrame(slide: ViewSpec['slide']): { title: TextItem; source: TextItem; content: Rect } {
  const F = registry.slideFrame;
  const L = F.margin.left, W = F.width, innerW = W - L - F.margin.right;
  const titleLines = wrapText(slide.title || '', F.title.fontSize, innerW, F.title.maxLines);
  return {
    title: {
      kind: 'text', x: L, y: F.title.y, w: innerW, h: F.title.h,
      lines: titleLines.map((t) => ({ t, size: F.title.fontSize, bold: true, color: INK })),
      align: 'left', valign: 'top',
    },
    source: {
      kind: 'text', x: L, y: F.source.y, w: innerW, h: F.source.h,
      lines: [{ t: slide.source || '', size: F.source.fontSize, color: SEC }],
      align: 'left', valign: 'middle',
    },
    content: { x: L, y: F.content.top, w: innerW, h: F.content.bottom - F.content.top },
  };
}
