import { slideText } from '@/i18n/slide';
import type { Locale } from '@/registry';
import { formatMetric, formatRate, type NumberFormat } from '../../format';
import type { Rect, TableCell, TableItem, TextItem } from '../../scene';
import { textWidth } from '../../text';
import { HEAT, INK, SEC, mixColor, textOn } from '../../theme';
import { cagr, timeRange } from '../../transform/cagr';
import type { Matrix } from '../../transform/matrix';

export const CAGR_TABLE = { rowH: 0.34, headH: 0.36 } as const;

export interface CagrRow {
  name: string;
  start: number | null;
  end: number | null;
  rate: number | null;
}

/**
 * 系列ごとの CAGR（行＝年の最小の年→最大の年。NarratiX の calcCAGRFromData_ と同じ）。
 * CAGR の高い順に並べ、計算できない系列（始点が 0 以下・空欄）は最後。行が年でなければ null
 */
export function cagrRows(m: Matrix): { from: number; to: number; rows: CagrRow[] } | null {
  const t = timeRange(m.rows);
  if (!t) return null;
  const rows = m.cols.map((name, k): CagrRow => {
    const start = m.current.values[t.fromIndex]?.[k] ?? null;
    const end = m.current.values[t.toIndex]?.[k] ?? null;
    return { name, start, end, rate: cagr(start, end, t.to - t.from) };
  });
  rows.sort((a, b) => (b.rate ?? -Infinity) - (a.rate ?? -Infinity));
  return { from: t.from, to: t.to, rows };
}

/**
 * CAGR の表（チャートの横に添える）。列＝系列名・開始年の値・終了年の値・CAGR。
 * CAGR のセルは濃さで大小を示す（プラスは紺、マイナスは茶）。
 */
export function layoutCagrTable(p: { rect: Rect; matrix: Matrix; locale: Locale; numberFormat: NumberFormat; colsLabel: string }): (TableItem | TextItem)[] {
  const data = cagrRows(p.matrix);
  // 「その他」（上位だけ表示でまとめた残り）は順位の外なので最後に
  if (data) data.rows.sort((a, b) => Number(a.name === slideText(p.locale, 'others')) - Number(b.name === slideText(p.locale, 'others')));
  if (!data) {
    return [{ kind: 'text', x: p.rect.x, y: p.rect.y, w: p.rect.w, h: 0.6, lines: [{ t: slideText(p.locale, 'cagrNeedsYears'), size: 10, color: SEC }], align: 'left', valign: 'top' }];
  }
  const fmt = (v: number | null) => (v == null ? '—' : formatMetric(v, p.numberFormat));
  const header = [p.colsLabel, String(data.from), String(data.to), slideText(p.locale, 'cagr')];
  const size = data.rows.length > 8 ? 9 : 10;
  // 列幅：名前は中身に合わせ（最大で幅の4割）、残りを3等分
  const nameW = Math.min(p.rect.w * 0.4, Math.max(0.8, ...[header[0]!, ...data.rows.map((r) => r.name)].map((t) => textWidth(t, size) + 0.25)));
  const rest = (p.rect.w - nameW) / 3;
  const colW = [nameW, rest, rest, rest];
  const maxP = Math.max(0.0001, ...data.rows.map((r) => r.rate ?? 0).filter((v) => v > 0));
  const maxN = Math.max(0.0001, ...data.rows.map((r) => -(r.rate ?? 0)).filter((v) => v > 0));
  const head: TableCell[] = header.map((t, i) => ({ text: t, fill: '#EEF1F0', color: SEC, align: i === 0 ? 'left' : 'right', size: size - 1, bold: true }));
  const body = data.rows.map((r): TableCell[] => {
    let fill = HEAT.empty;
    if (r.rate != null) fill = r.rate >= 0 ? mixColor(HEAT.posLow, HEAT.posHigh, Math.min(1, r.rate / maxP)) : mixColor(HEAT.negLow, HEAT.negHigh, Math.min(1, -r.rate / maxN));
    return [
      { text: r.name, fill: null, color: INK, align: 'left', size, bold: true },
      { text: fmt(r.start), fill: null, color: SEC, align: 'right', size, bold: false },
      { text: fmt(r.end), fill: null, color: INK, align: 'right', size, bold: false },
      { text: formatRate(r.rate), fill, color: textOn(fill), align: 'right', size, bold: true },
    ];
  });
  const title: TextItem = {
    kind: 'text', x: p.rect.x, y: p.rect.y, w: p.rect.w, h: 0.24,
    lines: [{ t: slideText(p.locale, 'cagrRange', { from: data.from, to: data.to }), size: 10, bold: true, color: INK }], align: 'left', valign: 'middle',
  };
  return [title, { kind: 'table', x: p.rect.x, y: p.rect.y + 0.34, colW, rowH: CAGR_TABLE.rowH, rows: [head, ...body], border: { color: '#DDE2E1', pt: 0.75 } }];
}
