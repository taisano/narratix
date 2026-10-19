import { z } from 'zod';
import type { ColumnKind, ColumnProfile, TableProfile } from './profile';

/**
 * AI へ送る最終の中身（許可リスト方式の純粋関数）。
 * 送る：質問の文章、行数・列数、列ごとの「名前（指標名だけ）・型・単位・欠損の有無・値の種類の多さ・期間列か」、横持ちの期間の種類。
 * 送らない：セルの値、項目名（国・商品・顧客・会社）、表の先頭の行。項目名らしい見出しは匿名化する。
 * 最終 payload は strict な zod を通すので、許可リストに無いキーが紛れ込むと例外になる。
 */
export const ConsultColumnSchema = z.object({
  col: z.number().int().min(0).max(999),
  /** 指標名・修飾語・軸の名前だけの見出しは原文。それ以外は匿名（series_N / col_N / period_N） */
  name: z.string().max(40),
  nameKind: z.enum(['metric', 'anonymous']),
  kind: z.enum(['number', 'percent', 'currency', 'date', 'text']),
  unit: z.string().max(20).optional(),
  hasMissing: z.boolean(),
  distinct: z.enum(['unique', 'few', 'many']),
  isTimeLike: z.boolean(),
  periodKind: z.enum(['month', 'quarter', 'fiscalYear', 'year', 'date', 'unknown']).optional(),
  isRowNames: z.boolean(),
}).strict();

export const ConsultPayloadSchema = z.object({
  question: z.string().max(2000),
  rowCount: z.number().int().min(0),
  colCount: z.number().int().min(0),
  timeAcrossColumns: z.object({ periodKind: z.enum(['month', 'quarter', 'fiscalYear', 'year', 'date', 'unknown']), count: z.number().int() }).strict().nullable(),
  columns: z.array(ConsultColumnSchema).max(200),
  /** 同じ種類の系列が何列あるか（横持ちの構造。個々の名前は送らない） */
  seriesGroups: z.array(z.object({ prefix: z.literal('series'), count: z.number().int().min(2) }).strict()).max(5),
}).strict();
export type ConsultPayload = z.infer<typeof ConsultPayloadSchema>;

export function buildConsultPayload(question: string, profile: TableProfile): ConsultPayload {
  const across = profile.timeAcrossColumns;
  const acrossCols = new Set(across?.cols ?? []);
  // 見出しが項目名かもしれない数値の列が2列以上、同じ型・単位で並ぶ＝同じ種類の系列
  const anonNumeric = profile.columns.filter((c) => !c.isRowNames && !c.headerSafe && !acrossCols.has(c.col) && (c.kind === 'number' || c.kind === 'percent' || c.kind === 'currency'));
  const sameKind = anonNumeric.length >= 2 && anonNumeric.every((c) => c.kind === anonNumeric[0]!.kind && c.unit === anonNumeric[0]!.unit);
  let s = 0, k = 0, p = 0;
  const columns = profile.columns.map((c: ColumnProfile) => {
    let name: string, nameKind: 'metric' | 'anonymous' = 'anonymous';
    if (acrossCols.has(c.col)) name = `period_${++p}`;
    else if (c.headerSafe && c.header.trim() !== '') { name = c.header.trim(); nameKind = 'metric'; }
    else if (sameKind && anonNumeric.includes(c)) name = `series_${++s}`;
    else name = `col_${++k}`;
    return {
      col: c.col, name, nameKind, kind: c.kind as ColumnKind, ...(c.unit ? { unit: c.unit } : {}),
      hasMissing: c.hasMissing, distinct: c.distinctClass, isTimeLike: c.isTimeLike,
      ...(c.periodKind ? { periodKind: c.periodKind } : {}), isRowNames: c.isRowNames,
    };
  });
  return ConsultPayloadSchema.parse({
    question: question.slice(0, 2000),
    rowCount: profile.rowCount,
    colCount: profile.colCount,
    timeAcrossColumns: across ? { periodKind: across.periodKind, count: across.cols.length } : null,
    columns,
    seriesGroups: sameKind ? [{ prefix: 'series', count: anonNumeric.length }] : [],
  });
}
