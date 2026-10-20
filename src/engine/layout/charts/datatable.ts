import { formatExact, formatMetric, type NumberFormat } from '../../format';
import type { SceneItem, TableCell } from '../../scene';
import { textWidth } from '../../text';
import { INK, SEC } from '../../theme';
import { layoutDeltaTable } from '../tables/delta-table';
import { envOf, unitNote, type ChartLayout } from './context';
import { slideText } from '@/i18n/slide';

/**
 * 表が主役のチャート（正確な数値を見るための形）。
 *   table_basic：貼った値をそのまま並べる（丸めない。並びも貼った順）。項目が少ない表（行が1〜2つで項目が多い）は、項目を縦に並べる
 *   table_delta：項目ごとに、基準と比較先の値と増減（現在−基準）を並べる（既存の増減表）
 */
const fmt = (v: number | null, mode: NumberFormat): string => (v == null ? '—' : mode === 'raw' ? formatExact(v) : formatMetric(v, mode));

export const tableBasic: ChartLayout = (ctx) => {
  const m = ctx.matrix, env = envOf(ctx);
  const mode = env.numberFormat;
  // 行が1〜2つで項目（列）が多い形は、項目を縦に並べる（読みやすい）
  const down = m.rows.length <= 2 && m.cols.length > m.rows.length;
  const header = down ? [ctx.colsLabel, ...m.rows] : ['', ...m.cols];
  const body: (string | null)[][] = down
    ? m.cols.map((name, k) => [name, ...m.rows.map((_, i) => fmt(m.current.values[i]?.[k] ?? null, mode))])
    : m.rows.map((name, i) => [name, ...m.cols.map((_, k) => fmt(m.current.values[i]?.[k] ?? null, mode))]);
  const unit = unitNote(ctx);
  const top = unit ? 0.3 : 0;
  const n = body.length + 1;
  const size = n <= 7 ? 14 : n <= 10 ? 12 : n <= 15 ? 10 : 8;
  const rowH = Math.max(0.2, Math.min(0.55, (ctx.rect.h - top - 0.1) / n));
  const nameW = Math.min(ctx.rect.w * 0.35, Math.max(0.9, ...[header[0]!, ...body.map((r) => r[0] ?? '')].map((t) => textWidth(t, size) + 0.3)));
  const rest = (ctx.rect.w - nameW) / Math.max(1, header.length - 1);
  const colW = [nameW, ...Array.from({ length: header.length - 1 }, () => rest)];
  const head: TableCell[] = header.map((t) => ({ text: t, fill: '#EEF1F0', color: SEC, align: 'center', size: size - 1, bold: true }));
  const rows = body.map((r): TableCell[] => r.map((t, j) => ({ text: t ?? '', fill: null, color: INK, align: 'center', size, bold: j === 0 })));
  const items: SceneItem[] = [];
  if (unit) items.push({ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.24, lines: [{ t: unit, size: 9, color: SEC }], align: 'right', valign: 'middle' });
  items.push({ kind: 'table', x: ctx.rect.x, y: ctx.rect.y + top, colW, rowH, rows: [head, ...rows], border: { color: '#DDE2E1', pt: 0.75 } });
  return { items, anchors: {} };
};

export const tableDelta: ChartLayout = (ctx) => {
  const m = ctx.matrix, env = envOf(ctx);
  if (m.rows.length < 2) return { items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.6, lines: [{ t: slideText(ctx.locale, 'needTwoRows'), size: 10, color: SEC }], align: 'left', valign: 'top' }], anchors: {} };
  return { items: layoutDeltaTable({ rect: ctx.rect, matrix: m, locale: ctx.locale, numberFormat: env.numberFormat, colsLabel: ctx.colsLabel, unit: ctx.unit, exact: true, main: true }), anchors: {} };
};
