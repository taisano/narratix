import { z } from 'zod';
import {
  ALIGN_AXES, CHART_TYPE_IDS, COMPLEMENT_IDS, EXPORT_IDS, LAYOUT_IDS, PANEL_KINDS, PURPOSE_IDS, RECIPE_IDS, TABLE_IDS,
} from './ids';
import { LOCALES } from './locale';

const PeriodKey = z.enum(['base', 'current']);

/** transform のパラメータ。type は TRANSFORM_IDS と一致させる（テストで確認） */
export const TransformSchema = z.discriminatedUnion('type', [
  /** 行と列を入れ替える（データは変えず、見え方だけを変える） */
  z.object({ type: z.literal('transpose') }),
  z.object({ type: z.literal('aggregate_rows'), label: z.string().optional() }),
  z.object({ type: z.literal('select_periods'), periods: z.array(PeriodKey).min(1) }),
  z.object({
    type: z.literal('growth'),
    mode: z.enum(['cagr', 'period']),
    /** 'market'（行合計）または 'series:<列名>' */
    rows: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal('share') }),
  z.object({ type: z.literal('delta_share') }),
  z.object({
    type: z.literal('filter'),
    rows: z.array(z.string()).optional(),
    cols: z.array(z.string()).optional(),
    top: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal('sort'), by: z.enum(['total', 'input', 'name']), order: z.enum(['asc', 'desc']).default('desc') }),
  /** 最初と最後の時点（行が年なら最小の年と最大の年、そうでなければ先頭と末尾の行）だけを残す */
  z.object({ type: z.literal('endpoints') }),
  z.object({ type: z.literal('latest') }),
  /** 列（系列・項目）を上位 N 件に。other なら残りを合計して label の列にまとめる（最後に置く） */
  z.object({ type: z.literal('top_n'), n: z.number().int().positive(), other: z.boolean().default(false), label: z.string().default('Other') }),
]);
export type Transform = z.infer<typeof TransformSchema>;

export const PanelSchema = z.object({
  id: z.string().min(1),
  slot: z.string().min(1),
  kind: z.enum(PANEL_KINDS),
  chart: z.enum(CHART_TYPE_IDS).optional(),
  table: z.enum(TABLE_IDS).optional(),
  purpose: z.enum(PURPOSE_IDS).optional(),
  transform: z.array(TransformSchema).optional(),
  controls: z.record(z.string(), z.unknown()).optional(),
  inChartComplements: z
    .array(z.object({ id: z.enum(COMPLEMENT_IDS), options: z.record(z.string(), z.unknown()).optional() }))
    .optional(),
  align: z.array(z.object({ to: z.string(), axis: z.enum(ALIGN_AXES) })).optional(),
  text: z.string().optional(),
});
export type Panel = z.infer<typeof PanelSchema>;

/** 保存・バージョン・AI出力・PPT出力の共通形式（registry-spec.md「ViewSpec の型」） */
export const ViewSpecSchema = z.object({
  id: z.string().optional(),
  version: z.number().int().min(1).optional(),
  datasetId: z.string(),
  angle: z.object({ kind: z.enum(['hypothesis', 'message']), text: z.string() }).optional(),
  /** どのレシピから作ったか（レシピや推薦ロジックが変わっても再現できるよう、版も残す） */
  recipe: z.object({ id: z.enum(RECIPE_IDS), version: z.string() }).optional(),
  layout: z.object({ id: z.enum(LAYOUT_IDS), ratios: z.array(z.number()).optional() }),
  panels: z.array(PanelSchema).min(1).max(4),
  slide: z.object({ title: z.string(), subtitle: z.string().optional(), source: z.string().optional() }),
  slideLocale: z.enum(LOCALES),
  palette: z.string().optional(),
  export: z.enum(EXPORT_IDS).optional(),
});
export type ViewSpec = z.infer<typeof ViewSpecSchema>;

/** AI に渡す JSON Schema（Wish の入り口で使う） */
export function viewSpecJsonSchema() {
  return z.toJSONSchema(ViewSpecSchema);
}
