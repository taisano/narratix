import { NextResponse } from 'next/server';
import { createClient as createSupabase, type SupabaseClient } from '@supabase/supabase-js';
import { handleConsult, periodStarts } from '@/lib/ai/consult-server';
import { planOf } from '@/lib/ai/plans';
import { aiConfigured, defaultProvider } from '@/lib/ai/provider';

/**
 * AI 相談（サーバー側だけで動く。OpenAI のキーは画面に出ない）。
 * 画面はログイン中の access token を Authorization で送る。Supabase はその人として読み書きする（RLS）。
 * 失敗したら { ok: false, reason } を返し、画面はルール版の分類で続ける。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// AI の待ち時間（provider の30秒）より長く。ホスティング側の既定の上限で、途中で切られないように
export const maxDuration = 40;

function userClient(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createSupabase(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  const sb = token ? userClient(token) : null;
  const body = await req.json().catch(() => null);
  // 管理者（app_admins）は回数の上限なし・ベータ登録なしでも使える
  let adminP: Promise<boolean> | null = null;
  const isAdmin = () => (adminP ??= sb ? Promise.resolve(sb.rpc('is_admin')).then((r) => !r.error && r.data === true, () => false) : Promise.resolve(false));
  const res = await handleConsult(body, {
    configured: aiConfigured(),
    userId: async () => {
      if (!sb || !token) return null;
      const { data, error } = await sb.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    member: async (userId) => {
      if (await isAdmin()) return true;
      const { data, error } = await sb!.from('beta_members').select('status').eq('user_id', userId).maybeSingle();
      return !error && (data as { status?: string } | null)?.status === 'active';
    },
    plan: async (userId) => {
      if (await isAdmin()) return 'team';
      const { data, error } = await sb!.from('user_plans').select('plan').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return planOf(data?.plan);
    },
    used: async (userId, feature, now) => {
      const { month, day } = periodStarts(now);
      const q = (since: string | null) => {
        const base = sb!.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', feature).eq('ok', true);
        return since ? base.gte('created_at', since) : base;
      };
      // total＝登録してからの合計（基本プランの AI 相談は累計で数える）
      const [m, d, a] = await Promise.all([q(month), q(day), q(null)]);
      if (m.error || d.error || a.error) return null;
      return { month: m.count ?? 0, day: d.count ?? 0, total: a.count ?? 0 };
    },
    opSeen: async (userId, opId) => {
      const { data, error } = await sb!.from('ai_usage').select('id').eq('user_id', userId).eq('op_id', opId).limit(1);
      return !error && (data?.length ?? 0) > 0; // op_id の列がまだ無い（マイグレーション前）時は false
    },
    record: async (row) => {
      const base = {
        feature: row.feature, ok: row.ok, reason: row.reason,
        model: row.usage?.model ?? null, input_tokens: row.usage?.inputTokens ?? 0, output_tokens: row.usage?.outputTokens ?? 0, ms: row.usage?.ms ?? null,
      };
      if (!row.opId) { await sb!.from('ai_usage').insert(base); return; }
      const r = await sb!.from('ai_usage').insert({ ...base, op_id: row.opId });
      // 列が無い（マイグレーション前）なら、操作 ID 無しで記録する（回数を取りこぼさない）。同じ操作 ID の重複（23505）は数えない
      if (r.error && r.error.code !== '23505') await sb!.from('ai_usage').insert(base);
    },
    provider: defaultProvider(),
  });
  const status = res.ok ? 200 : res.reason === 'bad_input' ? 400 : res.reason === 'duplicate' ? 409 : res.reason === 'login' || res.reason === 'not_member' ? 401 : res.reason.endsWith('limit') || res.reason === 'not_in_plan' ? 429 : 200;
  return NextResponse.json(res, { status });
}
