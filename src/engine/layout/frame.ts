import { registry, type Locale, type ViewSpec } from '@/registry';
import { slideText } from '@/i18n/slide';
import type { Rect, TextItem } from '../scene';
import { INK, SEC } from '../theme';
import { textWidth, wrapText } from '../text';

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

/** チャートタイトルの文字の大きさ・行の高さ（メッセージタイトル 20pt より弱く、凡例 9pt より強く） */
export const CHART_HEADER = { titleSize: 12, metaSize: 10, lineH: 0.26, gap: 0.1, maxTitleLines: 2 } as const;

/**
 * チャートタイトル（左揃え）と期間・単位（同じ行の右）。内容の領域の上端に置く。
 * 入り切らない時は、期間・単位をタイトルの下の行へ。何も無ければ高さ 0（空の枠も余白も出さない）
 */
export function layoutChartHeader(slide: ViewSpec['slide'], content: Rect, locale: Locale): { items: TextItem[]; height: number } {
  const H = CHART_HEADER;
  const title = slide.chartTitle?.trim() ?? '';
  const sep = locale === 'en' ? ' | ' : '｜';
  const unit = slide.chartUnit?.trim() ? slideText(locale, 'unitNote', { unit: slide.chartUnit.trim() }) : '';
  const meta = [slide.chartPeriod?.trim() ?? '', unit].filter(Boolean).join(sep);
  if (!title && !meta) return { items: [], height: 0 };
  const metaW = meta ? textWidth(meta, H.metaSize) + 0.1 : 0;
  const items: TextItem[] = [];
  // 同じ行に置けるか（タイトルが1行で、期間・単位と重ならない）
  const titleW1 = title ? textWidth(title, H.titleSize) * 1.06 : 0;
  const sameLine = !title || !meta || titleW1 + 0.3 + metaW <= content.w;
  const titleLines = title ? wrapText(title, H.titleSize, (sameLine && meta ? content.w - metaW - 0.3 : content.w) / 1.06, H.maxTitleLines) : [];
  if (titleLines.length) {
    items.push({
      kind: 'text', x: content.x, y: content.y, w: content.w, h: titleLines.length * H.lineH,
      lines: titleLines.map((t) => ({ t, size: H.titleSize, bold: true, color: INK })), align: 'left', valign: 'top',
    });
  }
  const metaY = sameLine ? content.y : content.y + titleLines.length * H.lineH;
  if (meta) {
    items.push({
      kind: 'text', x: sameLine && title ? content.x + content.w - metaW : content.x, y: metaY, w: sameLine && title ? metaW : content.w, h: H.lineH,
      lines: [{ t: meta, size: H.metaSize, color: SEC }], align: sameLine && title ? 'right' : 'left', valign: 'middle',
    });
  }
  const rows = sameLine ? Math.max(titleLines.length, 1) : titleLines.length + 1;
  return { items, height: rows * H.lineH + H.gap };
}
