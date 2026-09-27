import type { ConsultationClassification } from '@/registry';
import type { ConsultApiResponse } from './consult-server';
import type { ConsultReading } from './consult';

/** 画面から AI 相談を呼ぶ。だめならルール版に戻す理由を返す（画面はそれを小さく表示する） */
export type ConsultFallback = 'login' | 'limit' | 'off' | 'failed' | 'no_match';
export type ConsultOutcome = { source: 'ai'; classification: ConsultationClassification; reading: ConsultReading | null; remaining: number | null } | { source: 'rules'; fallback: ConsultFallback };

export function fallbackOf(reason: string | undefined): ConsultFallback {
  if (reason === 'login' || reason === 'not_member') return 'login';
  if (reason === 'monthly_limit' || reason === 'daily_limit' || reason === 'not_in_plan') return 'limit';
  if (reason === 'not_configured') return 'off';
  return 'failed';
}

export async function consultWithAi(text: string, accessToken: string | null, fetchImpl: typeof fetch = fetch, timeoutMs = 25_000, note?: string): Promise<ConsultOutcome> {
  if (!accessToken) return { source: 'rules', fallback: 'login' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('/api/ai/consult', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(note?.trim() ? { text, note: note.trim() } : { text }),
    });
    const body = (await res.json().catch(() => null)) as ConsultApiResponse | null;
    if (body?.ok) return { source: 'ai', classification: body.classification, reading: body.reading ?? null, remaining: body.remaining ?? null };
    return { source: 'rules', fallback: fallbackOf(body && !body.ok ? body.reason : undefined) };
  } catch {
    return { source: 'rules', fallback: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

// ──────────── AI 相談の結果の保存（同じ相談では AI を呼ばない） ────────────

/** AI のプロンプト（consult.ts）の版。プロンプトを変えたら上げる（前の結果を使わなくなる） */
export const CONSULT_PROMPT_VERSION = '2026-09-27';
const CACHE_KEY = 'chart-advisor:consult-cache';
const CACHE_MAX = 20;

/** 相談文を比べられる形にする（前後の空白・改行・全角空白の違いは同じとみなす。日本語の間の改行・空白は無視） */
export const normalizeConsultText = (text: string) =>
  text.replace(/[\s\u3000]+/g, ' ').trim().replace(/ (?=[^\x00-\x7F])|(?<=[^\x00-\x7F]) /g, '');

const cacheKeyOf = (uid: string | undefined, text: string, locale: string) => [uid ?? 'anon', locale, CONSULT_PROMPT_VERSION, normalizeConsultText(text)].join('\u0000');

type Entry = { k: string; v: Extract<ConsultOutcome, { source: 'ai' }> };

function readAll(): Entry[] {
  try { const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** 保存した AI の結果（無ければ null）。残り回数は使ったことにしない */
export function readConsultCache(uid: string | undefined, text: string, locale: string): ConsultOutcome | null {
  if (!uid) return null;
  const k = cacheKeyOf(uid, text, locale);
  const hit = readAll().find((e) => e.k === k);
  return hit ? { ...hit.v, remaining: null } : null;
}

export function writeConsultCache(uid: string | undefined, text: string, locale: string, out: ConsultOutcome) {
  if (!uid || out.source !== 'ai') return;
  const k = cacheKeyOf(uid, text, locale);
  const list = [{ k, v: out }, ...readAll().filter((e) => e.k !== k)].slice(0, CACHE_MAX);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* 保存できなくても続ける */ }
}
