import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanId } from '@/lib/ai/plans';
import { planOf } from '@/lib/ai/plans';
import type { Billing, Currency, PaidPlan } from '@/lib/pricing';
import type { InterestSource } from '@/lib/planEvents';

/** 無料枠の使った回数。limit が null なら無制限、0 なら使えない */
export interface MakeUsage {
  plan: PlanId;
  slide: { used: number; limit: number | null };
  story: { used: number; limit: number | null };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const lim = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseMakeUsage(v: unknown): MakeUsage | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, { used?: unknown; limit?: unknown } | undefined>;
  return {
    plan: planOf((v as { plan?: unknown }).plan),
    slide: { used: num(o.slide?.used), limit: lim(o.slide?.limit) },
    story: { used: num(o.story?.used), limit: lim(o.story?.limit) },
  };
}

export async function getMakeUsage(sb: SupabaseClient): Promise<MakeUsage | null> {
  const { data, error } = await sb.rpc('my_make_usage');
  return error ? null : parseMakeUsage(data);
}

/** 保存・書き出しが無料枠・プランの上限で止まった時のエラー文（DB が 'plan_limit:slide' などを返す）から種類を取り出す */
export function planLimitKind(message: string | undefined | null): 'slide' | 'story' | 'daily' | null {
  const m = /plan_limit:(slide|story|daily)/.exec(message ?? '');
  return m ? (m[1] as 'slide' | 'story' | 'daily') : null;
}

export type PriceFeel = 'high' | 'fair' | 'low';

export async function recordPlanInterest(sb: SupabaseClient, o: { plan: PaidPlan; billing: Billing; currency: Currency; feel: PriceFeel | null; source: InterestSource }): Promise<void> {
  const { error } = await sb.rpc('record_plan_interest', { p_plan: o.plan, p_billing: o.billing, p_currency: o.currency, p_price_feel: o.feel ?? '', p_source: o.source });
  if (error) throw new Error(error.message);
}
