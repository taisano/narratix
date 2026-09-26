import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { handleFeedback, resendSender } from '@/lib/feedback/server';

/**
 * ベータ版のフィードバックを受け付ける。保存は Supabase（送った人として。未ログインは匿名）、
 * 通知は Resend のメール（RESEND_API_KEY と FEEDBACK_TO_EMAIL がある時だけ）。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  const sb = url && key
    ? createSupabase(url, key, { ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}), auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  let userEmail: string | null = null;
  if (sb && token) {
    const { data } = await sb.auth.getUser(token);
    userEmail = data.user?.email ?? null;
  }
  const sender = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const body = await req.json().catch(() => null);
  const res = await handleFeedback(body, {
    sender,
    userEmail,
    insert: async (row) => {
      if (!sb) return false;
      const { error } = await sb.from('beta_feedback').insert(row);
      return !error;
    },
    sendEmail: resendSender(process.env),
  });
  const status = res.ok ? 200 : res.reason === 'bad_input' ? 400 : res.reason === 'too_many' ? 429 : 500;
  return NextResponse.json(res, { status });
}
