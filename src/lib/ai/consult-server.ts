import { z } from 'zod';
import type { ConsultationClassification } from '@/registry';
import { CONSULT_MAX_CHARS, classifyWithAi } from './consult';
import { checkAllowance, FAIR_USE_PER_DAY, type AiFeatureId, type PlanId } from './plans';
import type { AiProvider, AiUsage } from './provider';

/**
 * /api/ai/consult の中身（Next.js から切り離してテストできるように）。
 * ログイン → プランと回数 → AI → 記録。どこで止まっても画面はルール版で続けられるよう、理由だけを返す。
 */

export const ConsultRequestSchema = z.object({ text: z.string().trim().min(1).max(CONSULT_MAX_CHARS * 2) });

export type ConsultApiResponse =
  | { ok: true; source: 'ai'; classification: ConsultationClassification; remaining: number | null }
  | { ok: false; reason: 'bad_input' | 'login' | 'not_member' | 'not_configured' | 'not_in_plan' | 'monthly_limit' | 'daily_limit' | 'ai_failed' };

export interface ConsultDeps {
  configured: boolean;
  userId: () => Promise<string | null>;
  /** ベータ版に登録済み（active）か。順番待ち・未登録は使えない */
  member: (userId: string) => Promise<boolean>;
  plan: (userId: string) => Promise<PlanId>;
  /** 今月・今日の成功した回数。表が無いなど読めなければ null（その時はサーバーのメモリの回数で歯止め） */
  used: (userId: string, feature: AiFeatureId, now: Date) => Promise<{ month: number; day: number } | null>;
  record: (row: { feature: AiFeatureId; ok: boolean; reason: string | null; usage?: AiUsage }) => Promise<void>;
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

  const plan = await deps.plan(userId).catch(() => 'free' as const);
  const counted = await deps.used(userId, 'ai_consult', now).catch(() => null);
  const used = counted ?? { month: 0, day: 0 };
  // 表で数えられない時も、メモリの回数で1日の上限は守る
  used.day = Math.max(used.day, memoryUsed(userId, now));
  const allow = checkAllowance(plan, 'ai_consult', used);
  if (!allow.allowed) return { ok: false, reason: allow.reason };
  if (memoryUsed(userId, now) >= FAIR_USE_PER_DAY.ai_consult) return { ok: false, reason: 'daily_limit' };

  const r = await classifyWithAi(parsed.data.text, deps.provider);
  memoryAdd(userId, now);
  await deps.record({ feature: 'ai_consult', ok: r.ok, reason: r.ok ? null : r.reason, usage: r.usage }).catch(() => {});
  if (!r.ok) return { ok: false, reason: 'ai_failed' };
  return { ok: true, source: 'ai', classification: r.data, remaining: allow.remaining == null ? null : Math.max(0, allow.remaining - 1) };
}

/** 月の初め・日の初め（UTC） */
export function periodStarts(now: Date): { month: string; day: string } {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  return { month, day };
}
