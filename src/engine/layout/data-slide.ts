import type { Dataset, Locale } from '@/registry';
import { periodText, slideText } from '@/i18n/slide';
import { formatNumber } from '../format';
import type { Scene, SceneItem, TableCell } from '../scene';
import { rowSum } from '../transform/matrix';
import { INK } from '../theme';

const HEAD = '#EEF1F0';
const ROW_H = 0.28;

/** 元データのスライド（付録）。比較期間と現在の表を縦に並べる */
export function layoutDataSlide(d: Dataset, locale: Locale): Scene {
  const items: SceneItem[] = [];
  const fmt = (v: number | null | undefined) => formatNumber(v, locale);
  items.push({
    kind: 'text', x: 0.5, y: 0.3, w: 12.3, h: 0.6,
    lines: [{ t: slideText(locale, 'dataTitle', { unit: d.unit ?? '' }), size: 20, bold: true, color: INK }],
    align: 'left', valign: 'top',
  });
  const nameW = 2.3;
  const colW = [nameW, ...d.cols.map(() => (12.3 - nameW) / (d.cols.length + 1)), (12.3 - nameW) / (d.cols.length + 1)];
  const cell = (text: string, o: Partial<TableCell> = {}): TableCell => ({ text, fill: null, color: INK, align: 'right', size: 10, bold: false, ...o });

  let y = 1.05;
  const periods = [d.periods.base, d.periods.current].filter((p): p is NonNullable<typeof p> => !!p);
  for (const p of periods) {
    items.push({ kind: 'text', x: 0.5, y, w: 4, h: 0.35, lines: [{ t: periodText(locale, p.label), size: 12, bold: true, color: INK }], align: 'left', valign: 'middle' });
    const header = [
      cell(d.dimensions?.rows ?? slideText(locale, 'rowsFallback'), { bold: true, fill: HEAD, align: 'left' }),
      ...d.cols.map((c) => cell(c, { bold: true, fill: HEAD })),
      cell(slideText(locale, 'sum'), { bold: true, fill: HEAD }),
    ];
    const body = d.rows.map((r, i) => [
      cell(r, { align: 'left' }),
      ...d.cols.map((_, k) => cell(fmt(p.values[i]?.[k]))),
      cell(fmt(rowSum(p.values[i])), { bold: true }),
    ]);
    const totals = [
      cell(slideText(locale, 'sum'), { bold: true, align: 'left' }),
      ...d.cols.map((_, k) => cell(fmt(p.values.reduce((s, r) => s + (r[k] || 0), 0)), { bold: true })),
      cell(fmt(p.values.reduce((s, r) => s + rowSum(r), 0)), { bold: true }),
    ];
    const rows = [header, ...body, totals];
    items.push({ kind: 'table', x: 0.5, y: y + 0.4, colW, rowH: ROW_H, rows, border: { color: '#D3D9D8', pt: 0.5 } });
    y += 0.4 + rows.length * ROW_H + 0.35;
  }
  return { width: 13.333, height: 7.5, items, warnings: [] };
}
