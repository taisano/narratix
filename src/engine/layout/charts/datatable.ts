import { formatExact, formatFixed, formatMetric, type NumberFormat } from '../../format';
import type { SceneItem, TableCell } from '../../scene';
import { textWidth } from '../../text';
import { INK, SEC, textOn } from '../../theme';
import { heatColor, heatShade } from '../templates/heatmap';
import { layoutDeltaTable } from '../tables/delta-table';
import { envOf, unitNote, type ChartLayout } from './context';
import { slideText } from '@/i18n/slide';

/**
 * 表が主役のチャート（正確な数値を見るための形）。
 *   table_basic：貼った値をそのまま並べる（丸めない。並びも貼った順）。項目が少ない表（行が1〜2つで項目が多い）は、項目を縦に並べる
 *   table_delta：項目ごとに、基準と比較先の値と増減（現在−基準）を並べる（既存の増減表）
 */
const fmt = (v: number | null, mode: NumberFormat): string => (v == null ? '—' : mode === 'raw' ? formatExact(v) : formatMetric(v, mode));

const tableLayout = (ctx: Parameters<ChartLayout>[0], heat: boolean): ReturnType<ChartLayout> => {
  const m = ctx.matrix, env = envOf(ctx);
  const mode = env.numberFormat;
  // 行が1〜2つで項目（列）が多い形は、項目を縦に並べる（読みやすい）
  const down = m.rows.length <= 2 && m.cols.length > m.rows.length;
  const header = down ? [ctx.colsLabel, ...m.rows] : [ctx.rowsLabel ?? '', ...m.cols];
  // 正確な値：貼った桁数のまま（セルごと）。桁数の情報が無いセルは値から表す
  const cell = (i: number, k: number) => m.current.values[i]?.[k] ?? null;
  const decOf = (i: number, k: number) => ctx.cellDecimals?.[`${m.rows[i]}\t${m.cols[k]}`] ?? ctx.cellDecimals?.[`${m.cols[k]}\t${m.rows[i]}`];
  const fmtAt = (i: number, k: number) => (cell(i, k) == null ? '—' : mode === 'raw' ? formatFixed(cell(i, k), decOf(i, k)) : fmt(cell(i, k), mode));
  const body: (string | null)[][] = down
    ? m.cols.map((name, k) => [name, ...m.rows.map((_, i) => fmtAt(i, k))])
    : m.rows.map((name, i) => [name, ...m.cols.map((_, k) => fmtAt(i, k))]);
  const unit = unitNote(ctx);
  const top = unit || heat ? 0.3 : 0;
  const n = body.length + 1;
  const size = n <= 7 ? 14 : n <= 10 ? 12 : n <= 15 ? 10 : 8;
  const rowH = Math.max(0.2, Math.min(0.55, (ctx.rect.h - top - 0.1) / n));
  const nameW = Math.min(ctx.rect.w * 0.35, Math.max(0.9, ...[header[0]!, ...body.map((r) => r[0] ?? '')].map((t) => textWidth(t, size) + 0.3)));
  const rest = (ctx.rect.w - nameW) / Math.max(1, header.length - 1);
  const colW = [nameW, ...Array.from({ length: header.length - 1 }, () => rest)];
  const head: TableCell[] = header.map((t) => ({ text: t, fill: '#EEF1F0', color: SEC, align: 'center', size: size - 1, bold: true }));
  // ヒートマップ：列ごと（同じ指標・同じ系列の中）で、値が大きいほど濃く。値が1つだけの列・全部同じ値の列は色をつけない
  const range = m.cols.map((_, k) => {
    const vs = m.rows.map((_r, i) => cell(i, k)).filter((v): v is number => v != null);
    return vs.length >= 2 ? { lo: Math.min(...vs), hi: Math.max(...vs) } : null;
  });
  const fillAt = (i: number, k: number): string | null => {
    const v = cell(i, k), r = range[k];
    if (!heat || v == null || !r || r.hi === r.lo) return null;
    const { t, neg } = heatShade(v, r.lo, r.hi, 'high');
    return heatColor(t, neg);
  };
  const rows = body.map((r, bi): TableCell[] => r.map((t, j) => {
    // 表示の向き（項目を縦に並べる形では、行と列が入れ替わる）を元の (行 i, 列 k) に戻す
    const fill = j === 0 ? null : down ? fillAt(j - 1, bi) : fillAt(bi, j - 1);
    return { text: t ?? '', fill, color: fill ? textOn(fill) : INK, align: 'center', size, bold: j === 0 };
  }));
  const items: SceneItem[] = [];
  if (unit) items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.24, lines: [{ t: unit, size: 9, color: SEC }], align: 'right', valign: 'middle' });
  if (heat) items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w * 0.7, h: 0.24, lines: [{ t: ctx.locale === 'en' ? 'Darker = larger within each column' : '色が濃いほど、その列の中で大きい値', size: 9, color: SEC }], align: 'left', valign: 'middle' });
  items.push({ kind: 'table', x: ctx.rect.x, y: ctx.rect.y + top, colW, rowH, rows: [head, ...rows], border: { color: '#DDE2E1', pt: 0.75 } });
  return { items, anchors: {} };
};

export const tableBasic: ChartLayout = (ctx) => tableLayout(ctx, false);
export const tableHeat: ChartLayout = (ctx) => tableLayout(ctx, true);

export const tableDelta: ChartLayout = (ctx) => {
  const m = ctx.matrix, env = envOf(ctx);
  if (m.rows.length < 2) return { items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.6, lines: [{ t: slideText(ctx.locale, 'needTwoRows'), size: 10, color: SEC }], align: 'left', valign: 'top' }], anchors: {} };
  return { items: layoutDeltaTable({ rect: ctx.rect, matrix: m, locale: ctx.locale, numberFormat: env.numberFormat, colsLabel: ctx.colsLabel, unit: ctx.unit, exact: true, main: true }), anchors: {} };
};
