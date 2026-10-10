'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { maskText } from './mask';

/**
 * 利用の流れの記録（同意した人だけ）。docs/research-data-collection-design.md
 * ・送れるのは、種類（kind）ごとに決めた項目だけ。表の値・行や列の名前・タイトルなどの自由記入は、ここで必ず落ちる。
 * ・相談文（consult の text）だけは、伏せ字（mask.ts）を通した文を送る。
 * ・同意が無い時・失敗した時は、何もせず画面も止めない。サーバー側（log_journey）でも同意を確かめる。
 */
export type JourneyPayload = Record<string, unknown>;

/** 種類ごとに送ってよい項目。tokens＝決まった短い記号の並び、n＝数、flag＝はい／いいえ */
const SCHEMA = {
  consult: { text: 'text', classifier: 'token', recipes: 'tokens', entry: 'token', mode: 'token' },
  ev: { name: 'token', detail: 'token', device: 'token' },
  chart_saved: { slides: 'n', rows: 'n', cols: 'n', periods: 'n', recipes: 'tokens', charts: 'tokens', complements: 'tokens', recommended: 'tokens', selected: 'tokens', entry: 'token', mode: 'token', fromConsult: 'flag' },
  export: { kind: 'token', slides: 'n' },
} as const;
export type JourneyKind = keyof typeof SCHEMA;

const TOKEN = /^[A-Za-z0-9_.:,-]{1,80}$/;
const MAX_TOKENS = 30;

export function sanitize(kind: string, payload: JourneyPayload): JourneyPayload | null {
  const schema = (SCHEMA as Record<string, Record<string, string>>)[kind];
  if (!schema) return null;
  const out: JourneyPayload = {};
  for (const [key, type] of Object.entries(schema)) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    if (type === 'text' && typeof v === 'string') { const m = maskText(v); if (m) out[key] = m; }
    else if (type === 'token' && typeof v === 'string' && TOKEN.test(v)) out[key] = v;
    else if (type === 'tokens' && Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string' && TOKEN.test(x)).slice(0, MAX_TOKENS);
      if (list.length) out[key] = list;
    } else if (type === 'n' && typeof v === 'number' && Number.isFinite(v)) out[key] = Math.max(0, Math.min(1_000_000, Math.round(v)));
    else if (type === 'flag' && typeof v === 'boolean') out[key] = v;
  }
  return out;
}

let client: SupabaseClient | null = null;
let consented = false;
/** ログイン状態と同意が分かった時に呼ぶ（AppShell と設定のチェック）。client が無い・同意が無い間は何も送らない */
export function setJourneyContext(c: SupabaseClient | null, optedIn: boolean): void { client = c; consented = optedIn && !!c; }

let sid: string | null = null;
function sessionId(): string {
  if (sid) return sid;
  try { sid = sessionStorage.getItem('nx-journey-sid'); } catch { /* 無ければ作る */ }
  if (!sid) {
    sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { sessionStorage.setItem('nx-journey-sid', sid); } catch { /* 保存できなくても続ける */ }
  }
  return sid;
}

export function logJourney(kind: JourneyKind, payload: JourneyPayload): void {
  if (!consented || !client) return;
  const clean = sanitize(kind, payload);
  if (!clean) return;
  try {
    void Promise.resolve(client.rpc('log_journey', { p_kind: kind, p_payload: clean, p_session: sessionId() })).catch(() => {});
  } catch { /* 記録できなくても画面は止めない */ }
}
