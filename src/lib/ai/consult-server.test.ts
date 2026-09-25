import { beforeEach, describe, expect, it } from 'vitest';
import { handleConsult, periodStarts, resetConsultMemory, type ConsultDeps } from './consult-server';
import type { AiProvider } from './provider';
import { ConsultAiSchema } from './consult';

const ai = ConsultAiSchema.parse({
  rationale: 'x', primary_goal: 'TREND', expected_action: 'RECOMMEND', missing_info: [], audience: 'UNKNOWN', time_scope: null,
  time_mode: 'MULTI_PERIOD', comparison_dimension: null, measure: '売上', comparison_intent: 'UNKNOWN', composition_intent: 'UNKNOWN',
  measure_additivity: 'ADDITIVE', series_count: 'MULTIPLE', needs_exact_values: 'unknown', needs_size_context: 'unknown', needs_rate_context: 'unknown',
  business_question: null, decision_context: null, confidence: 0.8,
});
const okProvider: AiProvider = { name: 't', json: async () => ({ ok: true, data: ai as never, usage: { model: 'm', inputTokens: 10, outputTokens: 5, ms: 1 } }) };
const failProvider: AiProvider = { name: 't', json: async () => ({ ok: false, reason: 'timeout' }) };

function deps(over: Partial<ConsultDeps> = {}) {
  const records: unknown[] = [];
  const d: ConsultDeps = {
    configured: true, userId: async () => 'u1', plan: async () => 'free', used: async () => ({ month: 0, day: 0 }),
    record: async (r) => { records.push(r); }, provider: okProvider, now: () => new Date('2026-09-26T10:00:00Z'), ...over,
  };
  return { d, records };
}

beforeEach(() => resetConsultMemory());

describe('/api/ai/consult の中身', () => {
  it('ログインしていて回数が残っていれば、AI の分類を返し、回数を記録する', async () => {
    const { d, records } = deps();
    const r = await handleConsult({ text: '地域別の売上の推移' }, d);
    expect(r).toMatchObject({ ok: true, source: 'ai', remaining: 19 });
    expect(records).toEqual([{ feature: 'ai_consult', ok: true, reason: null, usage: { model: 'm', inputTokens: 10, outputTokens: 5, ms: 1 } }]);
  });

  it('止まる理由：文なし・キーなし・未ログイン・回数切れ・AI の失敗（画面はルール版で続ける）', async () => {
    expect(await handleConsult({ text: ' ' }, deps().d)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleConsult({ text: 'a' }, deps({ configured: false }).d)).toEqual({ ok: false, reason: 'not_configured' });
    expect(await handleConsult({ text: 'a' }, deps({ userId: async () => null }).d)).toEqual({ ok: false, reason: 'login' });
    expect(await handleConsult({ text: 'a' }, deps({ used: async () => ({ month: 20, day: 0 }) }).d)).toEqual({ ok: false, reason: 'monthly_limit' });
    const failed = deps({ provider: failProvider });
    expect(await handleConsult({ text: 'a' }, failed.d)).toEqual({ ok: false, reason: 'ai_failed' });
    expect(failed.records).toEqual([{ feature: 'ai_consult', ok: false, reason: 'timeout', usage: undefined }]);
  });

  it('回数の表が読めなくても、1日の上限はメモリで守る。プランが読めなければ free', async () => {
    const { d } = deps({ used: async () => null, plan: async () => { throw new Error('no table'); }, provider: okProvider });
    for (let i = 0; i < 200; i++) expect((await handleConsult({ text: 'a' }, d)).ok).toBe(true);
    expect(await handleConsult({ text: 'a' }, d)).toEqual({ ok: false, reason: 'daily_limit' });
  });

  it('月の初め・日の初め', () => {
    expect(periodStarts(new Date('2026-09-26T10:00:00Z'))).toEqual({ month: '2026-09-01T00:00:00.000Z', day: '2026-09-26T00:00:00.000Z' });
  });
});

describe('画面から呼ぶ時（consultWithAi）', () => {
  it('ログインしていなければ呼ばずにルール版。返事の理由をまとめる', async () => {
    const { consultWithAi, fallbackOf } = await import('./consult-client');
    let called = 0;
    const f = (async () => { called++; return new Response('{}'); }) as unknown as typeof fetch;
    expect(await consultWithAi('a', null, f)).toEqual({ source: 'rules', fallback: 'login' });
    expect(called).toBe(0);
    const reply = (b: unknown) => (async () => new Response(JSON.stringify(b))) as unknown as typeof fetch;
    expect(await consultWithAi('a', 't', reply({ ok: false, reason: 'monthly_limit' }))).toEqual({ source: 'rules', fallback: 'limit' });
    expect(await consultWithAi('a', 't', reply({ ok: true, source: 'ai', classification: { primary_goal: 'TREND' }, remaining: 3 }))).toMatchObject({ source: 'ai' });
    const throws = (async () => { throw new Error('x'); }) as unknown as typeof fetch;
    expect(await consultWithAi('a', 't', throws)).toEqual({ source: 'rules', fallback: 'failed' });
    expect(fallbackOf('not_configured')).toBe('off');
  });
});
