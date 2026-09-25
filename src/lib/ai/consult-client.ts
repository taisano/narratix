import type { ConsultationClassification } from '@/registry';
import type { ConsultApiResponse } from './consult-server';

/** 画面から AI 相談を呼ぶ。だめならルール版に戻す理由を返す（画面はそれを小さく表示する） */
export type ConsultFallback = 'login' | 'limit' | 'off' | 'failed';
export type ConsultOutcome = { source: 'ai'; classification: ConsultationClassification } | { source: 'rules'; fallback: ConsultFallback };

export function fallbackOf(reason: string | undefined): ConsultFallback {
  if (reason === 'login') return 'login';
  if (reason === 'monthly_limit' || reason === 'daily_limit' || reason === 'not_in_plan') return 'limit';
  if (reason === 'not_configured') return 'off';
  return 'failed';
}

export async function consultWithAi(text: string, accessToken: string | null, fetchImpl: typeof fetch = fetch, timeoutMs = 25_000): Promise<ConsultOutcome> {
  if (!accessToken) return { source: 'rules', fallback: 'login' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('/api/ai/consult', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ text }),
    });
    const body = (await res.json().catch(() => null)) as ConsultApiResponse | null;
    if (body?.ok) return { source: 'ai', classification: body.classification };
    return { source: 'rules', fallback: fallbackOf(body && !body.ok ? body.reason : undefined) };
  } catch {
    return { source: 'rules', fallback: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
