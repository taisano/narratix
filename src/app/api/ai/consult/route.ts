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

function userClient(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createSupabase(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  const sb = token ? userClient(token) : null;
  const body = await req.json().catch(() => null);
  const res = await handleConsult(body, {
    configured: aiConfigured(),
    userId: async () => {
      if (!sb || !token) return null;
      const { data, error } = await sb.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    member: async (userId) => {
      const { data, error } = await sb!.from('beta_members').select('status').eq('user_id', userId).maybeSingle();
      return !error && (data as { status?: string } | null)?.status === 'active';
    },
    plan: async (userId) => {
      const { data, error } = await sb!.from('user_plans').select('plan').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return planOf(data?.plan);
    },
    used: async (userId, feature, now) => {
      const { month, day } = periodStarts(now);
      const q = (since: string) => sb!.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', feature).eq('ok', true).gte('created_at', since);
      const [m, d] = await Promise.all([q(month), q(day)]);
      if (m.error || d.error) return null;
      return { month: m.count ?? 0, day: d.count ?? 0 };
    },
    record: async (row) => {
      await sb!.from('ai_usage').insert({
        feature: row.feature, ok: row.ok, reason: row.reason,
        model: row.usage?.model ?? null, input_tokens: row.usage?.inputTokens ?? 0, output_tokens: row.usage?.outputTokens ?? 0, ms: row.usage?.ms ?? null,
      });
    },
    provider: defaultProvider(),
  });
  const status = res.ok ? 200 : res.reason === 'bad_input' ? 400 : res.reason === 'login' || res.reason === 'not_member' ? 401 : res.reason.endsWith('limit') || res.reason === 'not_in_plan' ? 429 : 200;
  return NextResponse.json(res, { status });
}
