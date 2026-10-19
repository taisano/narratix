import { z } from 'zod';
import { AiRoleResponseSchema, COLUMN_ROLES, COMPARE_KINDS, PERIOD_KINDS, VALUE_KINDS, type AiRoleResponse } from '@/features/data/draft/columnRoles';
import { ConsultPayloadSchema } from '@/features/data/draft/consultPayload';
import type { AiProvider, AiUsage } from './provider';

/**
 * AI 相談に表を添える時の、列の役割の読み取り（docs/data-driven-draft-design.md 5章）。
 * AI に渡すのは buildConsultPayload の中身だけ（セルの値・項目名は渡らない）。AI が返すのは列番号と役割だけで、数値・項目名は書けない。
 * 同じ相談の中で呼び、利用回数は1回のまま（呼び出し側が数える）。
 */

/** サーバーが受け取る表の特徴（相談文は text で別に受けるので除く）。strict なので、許可リストに無いキー（セルの値など）が混ざると拒否する */
export const ConsultTableSchema = ConsultPayloadSchema.omit({ question: true });
export type ConsultTable = z.infer<typeof ConsultTableSchema>;

const WireSchema = z.object({
  time: z.object({ orientation: z.enum(['rows', 'columns']), at: z.array(z.number().int()), periodKind: z.enum(PERIOD_KINDS) }).nullable(),
  assignments: z.array(z.object({
    col: z.number().int(), role: z.enum(COLUMN_ROLES.filter((r) => r !== 'time') as [string, ...string[]]),
    valueKind: z.enum(VALUE_KINDS).nullable(), compareKind: z.enum(COMPARE_KINDS).nullable(), compareOf: z.number().int().nullable(),
  })),
  primaryMetric: z.number().int().nullable(),
  secondaryMetric: z.number().int().nullable(),
  scaleMetric: z.number().int().nullable(),
  notes: z.array(z.string()),
});

const nullable = (s: Record<string, unknown>) => ({ anyOf: [s, { type: 'null' }] });
export const ROLES_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['time', 'assignments', 'primaryMetric', 'secondaryMetric', 'scaleMetric', 'notes'],
  properties: {
    time: nullable({
      type: 'object', additionalProperties: false, required: ['orientation', 'at', 'periodKind'],
      properties: { orientation: { type: 'string', enum: ['rows', 'columns'] }, at: { type: 'array', items: { type: 'integer' } }, periodKind: { type: 'string', enum: [...PERIOD_KINDS] } },
    }),
    assignments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['col', 'role', 'valueKind', 'compareKind', 'compareOf'],
        properties: {
          col: { type: 'integer' },
          role: { type: 'string', enum: COLUMN_ROLES.filter((r) => r !== 'time') },
          valueKind: nullable({ type: 'string', enum: [...VALUE_KINDS] }),
          compareKind: nullable({ type: 'string', enum: [...COMPARE_KINDS] }),
          compareOf: nullable({ type: 'integer' }),
        },
      },
    },
    primaryMetric: nullable({ type: 'integer' }),
    secondaryMetric: nullable({ type: 'integer' }),
    scaleMetric: nullable({ type: 'integer' }),
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const ROLES_SYSTEM = `あなたは、表の「列」が何を表すかを判断する係です。表のセルの値は渡されていません。渡されるのは、質問文と、列ごとの見出し・型・単位・構造だけです。
列の名前は、指標名のほか、匿名化されたもの（series_N＝同じ種類の系列の列、period_N＝期間の列、col_N＝名前を伏せた列）があります。匿名の名前の中身は分かりません。推測で名前を作らないでください。

役割（role）：
- item：行の名前の列（国・商品・顧客など。文字の列）
- series：行を系列に分ける文字の列（縦持ちの表の「商品」など。時間の列と一緒にある）
- seriesValue：1列がそれぞれ1つの系列になっている数値の列（横持ちの表の、国ごとの列など。同じ型・単位）
- group：分類の列（地域・カテゴリなど。文字の列）
- metric：数値の指標の列。valueKind で値の意味を示す（level＝売上・シェアなどの水準、deltaAbsolute＝前年差・予算差などの実数の差、deltaPoint＝シェア前年差などのポイント差、growthRate＝前年比などの増減率）
- compare：比べる側の「水準」の列（予算・計画・前年の水準）。compareOf に、比べる相手の metric の列番号を入れる。比べる水準の列が実際に表にある時だけ使う。前年との「差」の列は compare ではなく metric（deltaPoint など）にする
- unused：使わない

時間（time）：期間が縦に並ぶ（期間の列がある）なら orientation=rows、at=[その列]。期間が列の見出しに横に並ぶ（period_N の列）なら orientation=columns、at=[それらの列]。期間が無ければ null。

守ること：
- 列番号（col）は、渡された列の col をそのまま使う。
- 確信が持てない列は unused にする。推測で埋めない。
- 質問文に合う主指標があれば primaryMetric に列番号を入れる（無ければ null）。散布図などで使う第2指標・規模の指標の候補があれば secondaryMetric・scaleMetric に入れる（無ければ null）。
- notes には、迷った点を短い文で書く（最大3件）。数値や項目名は書かない。
- 数値・項目名・会社名を推測して書かない。`;

const strip = <T extends Record<string, unknown>>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;

/** AI の返答（null 入りの形）を AiRoleResponse に直して検証する。合わなければ null */
export function toRoleResponse(w: z.infer<typeof WireSchema>): AiRoleResponse | null {
  const hints = strip({ secondaryMetric: w.secondaryMetric, scaleMetric: w.scaleMetric });
  const r = AiRoleResponseSchema.safeParse({
    version: 1,
    ...(w.time ? { time: w.time } : {}),
    assignments: w.assignments.map((a) => strip(a)),
    ...(w.primaryMetric != null ? { primaryMetric: w.primaryMetric } : {}),
    ...(Object.keys(hints).length ? { hints } : {}),
    ...(w.notes.length ? { notes: w.notes.slice(0, 5).map((n) => n.slice(0, 200)) } : {}),
  });
  return r.success ? r.data : null;
}

export type RolesResult = { ok: true; roles: AiRoleResponse; usage: AiUsage } | { ok: false; usage?: AiUsage };

export async function rolesWithAi(text: string, table: ConsultTable, provider: AiProvider, locale: 'ja' | 'en' = 'ja'): Promise<RolesResult> {
  const payload = ConsultPayloadSchema.parse({ ...table, question: text.slice(0, 2000) });
  const r = await provider.json({
    feature: 'ai_consult',
    system: ROLES_SYSTEM,
    user: `出力の言語：${locale === 'en' ? '英語' : '日本語'}\n\n質問文と表の特徴（JSON）：\n${JSON.stringify(payload)}`,
    jsonSchema: ROLES_JSON_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'column_roles',
    schema: WireSchema,
  });
  if (!r.ok) return { ok: false, usage: r.usage };
  const w = WireSchema.safeParse(r.data);
  const roles = w.success ? toRoleResponse(w.data) : null;
  return roles ? { ok: true, roles, usage: r.usage } : { ok: false, usage: r.usage };
}
