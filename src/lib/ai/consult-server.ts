import { z } from 'zod';
import type { AiRoleResponse } from '@/features/data/draft/columnRoles';
import { ConsultTableSchema, rolesWithAi } from './consult-table';
import type { ConsultationClassification } from '@/registry';
import { CONSULT_MAX_CHARS, CONSULT_NOTE_MAX_CHARS, classifyWithAi, type ConsultReading } from './consult';
import { checkAllowance, FAIR_USE_PER_DAY, type AiFeatureId, type PlanId } from './plans';
import type { AiProvider, AiUsage } from './provider';

/**
 * /api/ai/consult の中身（Next.js から切り離してテストできるように）。
 * ログイン → プランと回数 → AI → 記録。どこで止まっても画面はルール版で続けられるよう、理由だけを返す。
 */

export const ConsultRequestSchema = z.object({
  text: z.string().trim().min(1).max(CONSULT_MAX_CHARS * 2),
  /** 提案を見て書き足した意図（出し直しの時だけ）。1回の相談として数える */
  note: z.string().trim().max(CONSULT_NOTE_MAX_CHARS * 2).optional(),
  /** 画面の言語。AI が文で答える項目（問い・決めたいことなど）をこの言語で書く */
  locale: z.enum(['ja', 'en']).optional(),
  /** 表の特徴（列見出し・型・単位・行列数。セルの値・項目名は含まれない。strict なので、余計なキーがあれば拒否する） */
  table: ConsultTableSchema.optional(),
  /** 1回の「AI 相談」操作の ID。再送・連打でも1回しか数えない */
  opId: z.string().uuid().optional(),
});

export type ConsultApiResponse =
  | { ok: true; source: 'ai'; classification: ConsultationClassification; reading: ConsultReading | null; remaining: number | null; /** 表を送った時の列の役割（読み取れなければ null。その時は利用回数に数えない） */ roles?: AiRoleResponse | null }
  | { ok: false; reason: 'duplicate' | 'bad_input' | 'login' | 'not_member' | 'not_configured' | 'not_in_plan' | 'monthly_limit' | 'daily_limit' | 'ai_failed'; /** AI が失敗した時の細かい理由（timeout・http:401 など） */ detail?: string };

export interface ConsultDeps {
  configured: boolean;
  userId: () => Promise<string | null>;
  /** ベータ版に登録済み（active）か。順番待ち・未登録は使えない */
  member: (userId: string) => Promise<boolean>;
  plan: (userId: string) => Promise<PlanId>;
  /** 今月・今日の成功した回数。表が無いなど読めなければ null（その時はサーバーのメモリの回数で歯止め） */
  used: (userId: string, feature: AiFeatureId, now: Date) => Promise<{ month: number; day: number; total?: number } | null>;
  record: (row: { feature: AiFeatureId; ok: boolean; reason: string | null; usage?: AiUsage; opId?: string }) => Promise<void>;
  /** この操作 ID を、この人がすでに記録しているか（再送・連打を数えない）。読めなければ false */
  opSeen?: (userId: string, opId: string) => Promise<boolean>;
  provider: AiProvider;
  now?: () => Date;
}

/** 表が使えない時の歯止め（サーバーが動いている間だけの、1人1日の回数） */
const memory = new Map<string, { day: string; n: number }>();
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
function memoryUsed(userId: string, now: Date): number {
  const m = memory.get(userId);
  return m && m.day === dayKey(now) ? m.n : 0;
}
function memoryAdd(userId: string, now: Date) {
  memory.set(userId, { day: dayKey(now), n: memoryUsed(userId, now) + 1 });
}
/** テスト用 */
export const resetConsultMemory = () => memory.clear();

export async function handleConsult(body: unknown, deps: ConsultDeps): Promise<ConsultApiResponse> {
  const parsed = ConsultRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'bad_input' };
  if (!deps.configured) return { ok: false, reason: 'not_configured' };
  const userId = await deps.userId();
  if (!userId) return { ok: false, reason: 'login' };
  if (!(await deps.member(userId).catch(() => false))) return { ok: false, reason: 'not_member' };
  const now = deps.now?.() ?? new Date();
  // 同じ操作の再送・連打：AI を呼ばず、数えない（画面は最初の結果をそのまま使う）
  const opId = parsed.data.opId;
  if (opId && deps.opSeen && (await deps.opSeen(userId, opId).catch(() => false))) return { ok: false, reason: 'duplicate' };

  const plan = await deps.plan(userId).catch(() => 'free' as const);
  const counted = await deps.used(userId, 'ai_consult', now).catch(() => null);
  const used = counted ?? { month: 0, day: 0 };
  // 表で数えられない時も、メモリの回数で1日の上限は守る
  used.day = Math.max(used.day, memoryUsed(userId, now));
  const allow = checkAllowance(plan, 'ai_consult', used);
  if (!allow.allowed) return { ok: false, reason: allow.reason };
  if (memoryUsed(userId, now) >= FAIR_USE_PER_DAY.ai_consult) return { ok: false, reason: 'daily_limit' };

  // 相談の分類と、表の列の役割は互いに待たなくてよいので、同時に始める（順に待つと、遅い日は2回分の待ちで時間切れになっていた）
  const table = parsed.data.table;
  const rolesP = table ? rolesWithAi(parsed.data.text, table, deps.provider, parsed.data.locale).catch((): Awaited<ReturnType<typeof rolesWithAi>> => ({ ok: false })) : null;
  const r = await classifyWithAi(parsed.data.text, deps.provider, parsed.data.note, parsed.data.locale);
  memoryAdd(userId, now);
  if (!r.ok) {
    const detail = [r.reason, 'detail' in r ? r.detail : ''].filter(Boolean).join(':');
    await deps.record({ feature: 'ai_consult', ok: false, reason: detail, usage: r.usage, ...(opId ? { opId } : {}) }).catch(() => {});
    return { ok: false, reason: 'ai_failed', detail };
  }
  // 表があれば、同じ相談の中で列の役割も読む（回数は1回のまま）。読めなければ数えず、画面は規則による推定に戻る
  const roles = rolesP ? await rolesP : null;
  const rolesFailed = !!table && !roles?.ok;
  const usage = roles?.usage && r.usage ? { ...r.usage, inputTokens: r.usage.inputTokens + roles.usage.inputTokens, outputTokens: r.usage.outputTokens + roles.usage.outputTokens, ms: r.usage.ms + roles.usage.ms } : r.usage;
  await deps.record({ feature: 'ai_consult', ok: !rolesFailed, reason: rolesFailed ? 'roles_failed' : null, usage, ...(opId ? { opId } : {}) }).catch(() => {});
  return {
    ok: true, source: 'ai', classification: r.data, reading: r.reading ?? null,
    remaining: allow.remaining == null ? null : Math.max(0, allow.remaining - (rolesFailed ? 0 : 1)),
    ...(table ? { roles: roles?.ok ? roles.roles : null } : {}),
  };
}

/** 月の初め・日の初め（UTC） */
export function periodStarts(now: Date): { month: string; day: string } {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  return { month, day };
}
