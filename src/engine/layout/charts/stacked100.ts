import type { Locale } from '@/registry';
import { periodText, slideText } from '@/i18n/slide';
import { share } from '../../transform/ops';
import type { Matrix } from '../../transform/matrix';
import type { Rect, SceneItem, TextLine } from '../../scene';
import { INK, WHITE, textOn } from '../../theme';
import type { PanelAnchors } from '../anchors';

/**
 * 100%積み上げ縦棒（p05 の左の合計棒など）。
 * 行＝棒（期間や項目）、列＝セグメント。縦軸は揃え先（Mekko）の 0〜100% に合わせられる。
 */
export function layoutStacked100(p: {
  rect: Rect;
  matrix: Matrix;
  locale: Locale;
  palette: { series: string[]; greys: string[] };
  highlight: number;
  yScale?: { y: number; h: number };
  heading?: string;
}): { items: SceneItem[]; anchors: PanelAnchors } {
  const { rect, locale } = p;
  const items: SceneItem[] = [];
  const s = share(p.matrix);
  const n = s.rows.length;
  const y0 = p.yScale?.y ?? rect.y + 0.4;
  const H = p.yScale?.h ?? Math.max(1, rect.y + rect.h - y0 - 0.5);
  const slotW = rect.w / Math.max(1, n);
  const barW = Math.min(0.9, slotW * 0.62);

  items.push({
    kind: 'text', x: rect.x, y: rect.y - 0.03, w: rect.w, h: 0.24,
    lines: [{ t: p.heading ?? slideText(locale, 'total'), size: 10, bold: true, color: INK }],
    align: 'center', valign: 'middle',
  });

  s.rows.forEach((label, i) => {
    const x = rect.x + slotW * i + (slotW - barW) / 2;
    let y = y0;
    (s.current.values[i] ?? []).forEach((v, k) => {
      const h = H * (v ?? 0);
      if (h <= 0.001) return;
      let fill = p.palette.series[k % p.palette.series.length]!;
      if (p.highlight >= 0 && k !== p.highlight) fill = p.palette.greys[k % p.palette.greys.length]!;
      const lines: TextLine[] = h >= 0.26 && barW >= 0.45 ? [{ t: Math.round((v ?? 0) * 100) + '%', size: 10, bold: true, color: textOn(fill) }] : [];
      items.push({ kind: 'box', x, y, w: barW, h, fill, line: WHITE, lines, align: 'center', valign: 'middle' });
      y += h;
    });
    items.push({
      kind: 'text', x: rect.x + slotW * i, y: y0 + H + 0.04, w: slotW, h: 0.3,
      lines: [{ t: periodText(locale, label), size: 10, bold: true, color: INK }],
      align: 'center', valign: 'top',
    });
  });
  return { items, anchors: { yScale: { y: y0, h: H } } };
}
