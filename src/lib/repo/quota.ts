import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_LIMITS, planOf, type PlanId } from '@/lib/ai/plans';

/**
 * 今月の AI 相談の回数（画面に「残り n / 10 回」と出す）。数え方はサーバー（/api/ai/consult）と同じ：
 * 成功した相談（ok）だけ、月の初め（UTC）から。上限はプランの回数（無料は 10）。上限なしのプランは limit: null
 */
export interface ConsultQuota {
  used: number; limit: number | null; remaining: number | null;
  /** 今のプラン（画面の出し分けだけに使う。管理者は Pro 扱い）。分からなければ無し */
  plan?: PlanId;
}

export const monthStartUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

export const quotaOf = (used: number, limit: number | null): ConsultQuota => ({ used, limit, remaining: limit == null ? null : Math.max(0, limit - used) });

export async function readConsultQuota(sb: SupabaseClient, userId: string, now = new Date()): Promise<ConsultQuota | null> {
  const [plan, usage, admin] = await Promise.all([
    sb.from('user_plans').select('plan').eq('user_id', userId).maybeSingle(),
    sb.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', 'ai_consult').eq('ok', true).gte('created_at', monthStartUtc(now)),
    sb.rpc('is_admin'),
  ]);
  if (usage.error) return null;
  // 管理者は上限なし（サーバーでも同じ扱い）
  const isAdmin = !admin.error && admin.data === true;
  const id: PlanId = isAdmin ? 'team' : planOf(plan.data?.plan);
  const limit = isAdmin ? null : PLAN_LIMITS[id].ai_consult;
  return { ...quotaOf(usage.count ?? 0, limit), plan: id };
}
