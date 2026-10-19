import { normalize, readCell, LIMITS, type ParsedTable } from '@/features/editor/dataCheck';
import type { PeriodKind } from './columnRoles';
import { periodKindOf } from './periods';
import { isSafeHeader, valueKindOfHeader } from './vocab';

/**
 * 表の「特徴」。コードが計算する。AI に渡す前の内部の形で、見出しの原文は持つが、セルの値は持たない
 * （AI へ送る内容は consultPayload.ts の許可リストで別に作る）。
 * 列番号は、行名の列がある時はそれを 0 として、その右に値の列が続く。
 */
export type ColumnKind = 'number' | 'percent' | 'currency' | 'date' | 'text';

export interface ColumnProfile {
  col: number;
  /** 見出しの原文（内部だけ。AI へは isSafeHeader の時だけ送る） */
  header: string;
  /** 見出しが指標名・修飾語・軸の名前だけでできているか */
  headerSafe: boolean;
  isRowNames: boolean;
  kind: ColumnKind;
  unit?: string;
  hasMissing: boolean;
  distinctClass: 'unique' | 'few' | 'many';
  isTimeLike: boolean;
  periodKind?: PeriodKind;
}

export interface TableProfile {
  rowCount: number;
  colCount: number;
  hasColNames: boolean;
  /** 値の列の見出しが、期間として並んでいる（横持ちの時間） */
  timeAcrossColumns: { cols: number[]; periodKind: PeriodKind } | null;
  columns: ColumnProfile[];
}

const SYMBOL = /[€$¥£]/;

function profileColumn(col: number, header: string, cells: string[], isRowNames: boolean): ColumnProfile {
  const trimmed = cells.map((c) => normalize(c));
  const filled = trimmed.filter((c) => c !== '');
  const reads = cells.map((c) => readCell(c));
  const hasMissing = reads.some((r) => r.kind === 'blank' || r.kind === 'missing' || r.kind === 'error');
  const distinct = new Set(filled).size;
  const distinctClass: ColumnProfile['distinctClass'] = filled.length > 0 && distinct === filled.length ? 'unique' : distinct <= 12 ? 'few' : 'many';
  const base = { col, header, headerSafe: isSafeHeader(header), isRowNames, hasMissing, distinctClass };
  const pk = periodKindOf(cells);
  if (pk) return { ...base, kind: 'date', isTimeLike: true, periodKind: pk };
  const values = reads.filter((r) => r.kind === 'number' || r.kind === 'text');
  const nums = values.filter((r) => r.kind === 'number');
  if (values.length > 0 && nums.length / values.length >= 0.8) {
    const pct = nums.filter((r) => r.percent).length >= nums.length / 2;
    const sym = cells.map((c) => SYMBOL.exec(normalize(c))?.[0]).filter((s): s is string => !!s);
    const cur = sym.length >= nums.length / 2 ? sym[0] : undefined;
    const scale = nums.map((r) => r.unit).find((u) => !!u);
    const hv = valueKindOfHeader(header, pct ? 'percent' : 'number');
    const kind: ColumnKind = pct ? 'percent' : cur ? 'currency' : 'number';
    const unit = hv.unit === 'pp' ? 'pp' : pct ? '%' : cur ?? scale;
    return { ...base, kind, ...(unit ? { unit } : {}), isTimeLike: false };
  }
  return { ...base, kind: 'text', isTimeLike: false };
}

export class TableTooLarge extends Error {
  constructor(readonly rows: number, readonly cols: number) { super(`table too large: ${rows}x${cols}`); }
}

/** 貼り付けから作った表（ParsedTable）の特徴を計算する */
export function profileTable(t: ParsedTable): TableProfile {
  if (t.rows.length > LIMITS.rows || t.cols.length > LIMITS.cols) throw new TableTooLarge(t.rows.length, t.cols.length);
  const columns: ColumnProfile[] = [];
  const off = t.hasRowNames ? 1 : 0;
  if (t.hasRowNames) columns.push(profileColumn(0, t.corner ?? '', t.rows, true));
  t.cols.forEach((h, k) => {
    columns.push(profileColumn(k + off, t.hasColNames ? h : '', t.raw.map((r) => r[k] ?? ''), false));
  });
  const valueCols = columns.filter((c) => !c.isRowNames);
  let timeAcrossColumns: TableProfile['timeAcrossColumns'] = null;
  if (t.hasColNames && valueCols.length >= 2) {
    const pk = periodKindOf(valueCols.map((c) => c.header), 1);
    if (pk) timeAcrossColumns = { cols: valueCols.map((c) => c.col), periodKind: pk };
  }
  return { rowCount: t.rows.length, colCount: columns.length, hasColNames: t.hasColNames, timeAcrossColumns, columns };
}
