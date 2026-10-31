import { slideText } from '@/i18n/slide';
import type { Locale } from '@/registry';
import { formatExact, formatMetric, formatSigned, nonAdditiveUnit, type NumberFormat } from '../../format';
import type { Rect, TableCell, TableItem, TextItem } from '../../scene';
import { textWidth } from '../../text';
import { INK, SEC } from '../../theme';
import type { Matrix } from '../../transform/matrix';
import { CAGR_TABLE, sideFit } from './cagr-table';

/** 増減の赤（マイナスだけ。増加額は良し悪しの色にしない） */
const DOWN = '#C62828';

/**
 * 増減表（付け合わせの「表」の形。docs/dish-matrix.md 6.6）。列＝項目・開始・終了・増減（額）。
 * 行＝時点の最初→最後。増減の大きい順（差分バーと同じ）。増加率は混ぜない（額だけ）。
 * 見出しは差分バーと同じ「増加額（億円、2021→2025）」
 */
export function layoutDeltaTable(p: { rect: Rect; matrix: Matrix; locale: Locale; numberFormat: NumberFormat; colsLabel: string; unit: string; /** 丸めずに貼った値のまま出す（基本表・増減表の「正確な数値」用）。付け合わせの表は今までどおり丸める */ exact?: boolean; /** 主役の表：行数に応じて文字と行の高さを大きくする（付け合わせの表は今までどおり） */ main?: boolean; /** 付け合わせの表を縦に広げて中央に置く */ fill?: boolean }): (TableItem | TextItem)[] {
  const m = p.matrix;
  if (m.rows.length < 2) {
    return [{ kind: 'text', x: p.rect.x, y: p.rect.y, w: p.rect.w, h: 0.6, lines: [{ t: slideText(p.locale, 'needTwoRows'), size: 10, color: SEC }], align: 'left', valign: 'top' }];
  }
  const from = 0, to = m.rows.length - 1;
  const others = slideText(p.locale, 'others');
  const rows = m.cols.map((name, k) => {
    const start = m.current.values[from]?.[k] ?? null;
    const end = m.current.values[to]?.[k] ?? null;
    return { name, start, end, diff: start != null && end != null ? end - start : null };
  });
  rows.sort((a, b) => Number(a.name === others) - Number(b.name === others) || (b.diff ?? -Infinity) - (a.diff ?? -Infinity));
  const exact = !!p.exact && p.numberFormat === 'raw';
  const fmt = (v: number | null) => (v == null ? '—' : exact ? formatExact(v) : formatMetric(v, p.numberFormat));
  const signed = (v: number) => (exact ? (Math.abs(v) < 1e-6 ? '0' : (v > 0 ? '+' : '-') + formatExact(Math.abs(v))) : formatSigned(v, p.numberFormat));
  const header = [p.colsLabel, m.rows[from]!, m.rows[to]!, slideText(p.locale, 'cagrDelta')];
  const fit = p.main ? { rowH: 0, top: 0 } : sideFit(p.rect, rows.length, p.fill);
  const size = p.main ? (rows.length <= 6 ? 14 : rows.length <= 9 ? 12 : rows.length <= 14 ? 10 : 8) : rows.length > 8 ? 9 : fit.rowH >= 0.42 ? 11 : 10;
  const rowH = p.main ? Math.max(0.2, Math.min(0.55, (p.rect.h - 0.44) / (rows.length + 1))) : fit.rowH;
  const n = header.length - 1;
  const nameW = Math.min(p.rect.w * 0.4, Math.max(0.8, ...[header[0]!, ...rows.map((r) => r.name)].map((t) => textWidth(t, size) + 0.25)));
  const rest = (p.rect.w - nameW) / n;
  const colW = [nameW, ...Array.from({ length: n }, () => rest)];
  const head: TableCell[] = header.map((t, i) => ({ text: t, fill: '#EEF1F0', color: SEC, align: 'center', size: size - 1, bold: true }));
  const body = rows.map((r): TableCell[] => [
    { text: r.name, fill: null, color: INK, align: 'center', size, bold: true },
    { text: fmt(r.start), fill: null, color: SEC, align: 'center', size, bold: false },
    { text: fmt(r.end), fill: null, color: INK, align: 'center', size, bold: false },
    { text: r.diff == null ? '—' : signed(r.diff), fill: null, color: (r.diff ?? 0) < 0 ? DOWN : INK, align: 'center', size, bold: true },
  ]);
  const vals = rows.map((r) => r.diff).filter((v): v is number => v != null);
  const key = nonAdditiveUnit(p.unit) ? 'sideChange' : vals.every((d) => d >= 0) ? 'sideIncrease' : 'sideChangeAmount';
  const title: TextItem = {
    kind: 'text', x: p.rect.x, y: p.rect.y + fit.top, w: p.rect.w, h: 0.24,
    lines: [{ t: slideText(p.locale, key, { unit: p.unit ? (p.locale === 'ja' ? `${p.unit}、` : `${p.unit}, `) : '', from: m.rows[from]!, to: m.rows[to]! }), size: 10, bold: true, color: INK }],
    align: 'left', valign: 'middle',
  };
  return [title, { kind: 'table', x: p.rect.x, y: p.rect.y + fit.top + 0.34, colW, rowH, rows: [head, ...body], border: { color: '#DDE2E1', pt: 0.75 } }];
}
