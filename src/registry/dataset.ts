import { z } from 'zod';
import { DATA_SCHEMA_IDS } from './ids';

const Cell = z.number().nullable();
const PeriodSchema = z.object({
  label: z.string(),
  values: z.array(z.array(Cell)),
});

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
