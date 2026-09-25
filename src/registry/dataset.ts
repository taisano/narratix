import { z } from 'zod';
import { DATA_SCHEMA_IDS } from './ids';

const Cell = z.number().nullable();
const PeriodSchema = z.object({
  label: z.string(),
  values: z.array(z.array(Cell)),
});

/** 縦長の表の切り出し方：どの列を行・列・値にし、残りの列をどの値で絞るか（value: null はすべて合計） */
export const LongPivotSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  value: z.number().int().min(0),
  filters: z.array(z.object({ col: z.number().int().min(0), value: z.string().nullable() })),
  /** 割合にする時：この列（絞り込み中）の中での割合。例：タイプ＝スチーム ÷ タイプすべて */
  share: z.number().int().min(0).nullable(),
  /** 合計を足す時の名前（例：グローバル）。null は足さない */
  total: z.string().nullable(),
  /** 合計を足す向き：列（地域が列の時）か行（地域が行の時）。無ければ列 */
  totalOn: z.enum(['row', 'col']).optional(),
  /** 2つの時点を比べる時：この列の base の値を「比較」、current の値を「現在」に入れる（2期間の100%積み上げ・Mekko など） */
  compare: z.object({ col: z.number().int().min(0), base: z.string(), current: z.string() }).nullable().optional(),
});
export type LongPivot = z.infer<typeof LongPivotSchema>;

export const LongSourceSchema = z.object({
  headers: z.array(z.string()).max(50),
  rows: z.array(z.array(z.string())).max(20000),
  pivot: LongPivotSchema,
  /** 元の値の単位（割合にした時は % になるので、元の単位はここに残す） */
  unit: z.string().optional(),
  /** 貼った表で横に並んでいた数値の列（例：Steam・Glass・…）。1つの切り口（区分）として縦に並べ直した */
  melted: z.object({ name: z.string(), from: z.array(z.string()) }).optional(),
});
export type LongSource = z.infer<typeof LongSourceSchema>;

export const NUMBER_FORMATS = ['auto', 'raw', 'K', 'M', '%'] as const;

/**
 * 入力データ（registry-spec.md「DataSchema：データの形」）。
 * 値は常に実数で受け取り、構成比・成長率はアプリ側（transform）で計算する。
 */
export const DatasetSchema = z
  .object({
    schema: z.enum(DATA_SCHEMA_IDS),
    unit: z.string().optional(),
    numberFormat: z.enum(NUMBER_FORMATS).optional(),
    /** 行・列が何を表すか（例：地域、形状）。スライドの注記に使う */
    dimensions: z.object({ rows: z.string().optional(), cols: z.string().optional(), group: z.string().optional() }).optional(),
    /** 行ごとのグループ（散布図・バブルの色分け）。任意 */
    groups: z.array(z.string().nullable()).optional(),
    rows: z.array(z.string()),
    cols: z.array(z.string()),
    periods: z.object({ current: PeriodSchema, base: PeriodSchema.optional() }),
    colMeta: z
      .array(z.object({ direction: z.enum(['higher', 'lower']).optional(), unit: z.string().optional() }))
      .optional(),
    bridge: z
      .object({ startLabel: z.string(), start: z.number(), endLabel: z.string(), end: z.number() })
      .optional(),
    /**
     * 縦長の表（年・地域・タイプ・指標・値 のように1行1つの値）から切り出した時の、元の表と切り出し方。
     * rows / cols / periods はここから作った結果。あれば画面は切り出しの欄を出し、表は直接は編集しない
     */
    long: LongSourceSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const checkShape = (key: 'current' | 'base') => {
      const p = d.periods[key];
      if (!p) return;
      if (p.values.length !== d.rows.length) {
        ctx.addIssue({ code: 'custom', path: ['periods', key, 'values'], message: `rows: expected ${d.rows.length}, got ${p.values.length}` });
      }
      p.values.forEach((row, i) => {
        if (row.length !== d.cols.length) {
          ctx.addIssue({ code: 'custom', path: ['periods', key, 'values', i], message: `cols: expected ${d.cols.length}, got ${row.length}` });
        }
      });
    };
    checkShape('current');
    checkShape('base');
    if (d.colMeta && d.colMeta.length !== d.cols.length) {
      ctx.addIssue({ code: 'custom', path: ['colMeta'], message: 'colMeta must have one entry per column' });
    }
    // DRIVER_BRIDGE は表の1行目＝始点、最後の行＝終点、あいだ＝要因として読む（bridge は任意）
  });

export type Dataset = z.infer<typeof DatasetSchema>;
