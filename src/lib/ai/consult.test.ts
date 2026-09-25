import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema } from '@/registry';
import { ADVISOR_CASES } from '@/lib/advisor/cases';
import { VALIDATION_CASES } from '@/lib/advisor/cases-validation';
import { CONSULT_JSON_SCHEMA, CONSULT_SYSTEM, ConsultAiSchema, classifyWithAi, toClassification, type ConsultAi } from './consult';
import { disabledProvider, openAiProvider, outputText } from './provider';

const base: ConsultAi = ConsultAiSchema.parse({
  rationale: 'x', primary_goal: 'TREND', expected_action: 'RECOMMEND', missing_info: [], audience: 'UNKNOWN', time_scope: '2021-2025',
  time_mode: 'MULTI_PERIOD', comparison_dimension: '地域', measure: '売上', comparison_intent: 'UNKNOWN', composition_intent: 'UNKNOWN',
  measure_additivity: 'ADDITIVE', series_count: 'MULTIPLE', needs_exact_values: 'unknown', needs_size_context: 'true', needs_rate_context: 'unknown',
  business_question: null, decision_context: null, confidence: 0.9,
});

/** fetch の代わり：決まった返事を返し、送った中身を覚える */
function fakeFetch(body: unknown, status = 200) {
  const sent: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, sent };
}
const reply = (obj: unknown) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(obj) }] }], usage: { input_tokens: 1200, output_tokens: 300 } });

describe('AI 相談の分類', () => {
  it('JSON Schema は strict の条件を満たす（全項目が必須、余計な項目なし）', () => {
    expect(CONSULT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...CONSULT_JSON_SCHEMA.required].sort()).toEqual(Object.keys(CONSULT_JSON_SCHEMA.properties).sort());
    expect(Object.keys(ConsultAiSchema.shape).sort()).toEqual(Object.keys(CONSULT_JSON_SCHEMA.properties).sort());
  });

  it('プロンプトに正解表の文を使っていない（点が当てにならなくなるため）', () => {
    for (const c of [...ADVISOR_CASES, ...VALIDATION_CASES]) expect(CONSULT_SYSTEM.includes(c.text)).toBe(false);
  });

  it('アプリの分類に直す：評価は作れない、確認以外は聞くことなし、"true" は true', () => {
    const c = toClassification(base);
    expect(ConsultationClassificationSchema.parse(c)).toEqual(c);
    expect(c.needs_size_context).toBe(true);
    expect(c.needs_rate_context).toBe('unknown');
    expect(toClassification({ ...base, primary_goal: 'EVALUATION' }).expected_action).toBe('UNSUPPORTED');
    expect(toClassification({ ...base, expected_action: 'UNSUPPORTED' }).expected_action).toBe('RECOMMEND');
    expect(toClassification({ ...base, missing_info: ['MEASURE'] }).missing_info).toEqual([]);
    expect(toClassification({ ...base, expected_action: 'CLARIFY' }).missing_info).toEqual(['VIEW']);
  });

  it('OpenAI の Responses API に strict な JSON Schema で頼み、返事を検証して分類にする', async () => {
    const { f, sent } = fakeFetch(reply({ ...base, needs_size_context: 'true' }));
    const r = await classifyWithAi('地域別の売上の推移を見せたい', openAiProvider('sk-test', f));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.primary_goal).toBe('TREND');
      expect(r.usage).toMatchObject({ inputTokens: 1200, outputTokens: 300 });
    }
    expect(sent[0]!.url).toBe('https://api.openai.com/v1/responses');
    const req = JSON.parse(String(sent[0]!.init.body));
    expect(req.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'consultation_classification' });
    expect(req.store).toBe(false);
    expect((sent[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
  });

  it('失敗はすべて ok: false（呼び出し側はルール版に戻る）', async () => {
    expect((await classifyWithAi('x', disabledProvider)).ok).toBe(false);
    expect(await classifyWithAi('x', openAiProvider(undefined))).toEqual({ ok: false, reason: 'not_configured' });
    expect(await classifyWithAi('x', openAiProvider('k', fakeFetch({ error: 'x' }, 500).f))).toMatchObject({ ok: false, reason: 'http' });
    expect(await classifyWithAi('x', openAiProvider('k', fakeFetch(reply({ primary_goal: 'NOPE' })).f))).toMatchObject({ ok: false, reason: 'bad_shape' });
    const refusal = { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] };
    expect(await classifyWithAi('x', openAiProvider('k', fakeFetch(refusal).f))).toMatchObject({ ok: false, reason: 'refusal' });
    const broken = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":' }] }] };
    expect(await classifyWithAi('x', openAiProvider('k', fakeFetch(broken).f))).toMatchObject({ ok: false, reason: 'bad_json' });
    const throws = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await classifyWithAi('x', openAiProvider('k', throws))).toMatchObject({ ok: false, reason: 'network' });
  });

  it('返事の文の取り出し', () => {
    expect(outputText({ output_text: '{}' })).toEqual({ text: '{}' });
    expect(outputText({ output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'a' }] }] })).toEqual({ text: 'a' });
    expect(outputText({})).toBeNull();
  });
});

describe('AI の分類の補正', () => {
  it('数字のない期間は null。構成の話で「足せない」は UNKNOWN に戻す', () => {
    expect(toClassification({ ...base, time_scope: '前年-今年' }).time_scope).toBeNull();
    expect(toClassification({ ...base, time_scope: '2021-2025' }).time_scope).toBe('2021-2025');
    expect(toClassification({ ...base, composition_intent: 'SHARE', measure_additivity: 'NON_ADDITIVE' }).measure_additivity).toBe('UNKNOWN');
    expect(toClassification({ ...base, composition_intent: 'NONE', measure_additivity: 'NON_ADDITIVE' }).measure_additivity).toBe('NON_ADDITIVE');
  });
});

describe('AI の分類で案が0件の時', () => {
  it('ルール版に切り替える。AI で案が出るならそのまま', async () => {
    const { pickClassification } = await import('@/lib/advisor/pick');
    // 系列が1つの「構成」は、構成の案が全部外れる（わざと補正を通さずに作る）
    const none = { ...toClassification({ ...base, primary_goal: 'COMPOSITION', composition_intent: 'SHARE' }), series_count: 'SINGLE' as const };
    const text = 'チャネル別の売上構成比が、この5年でどう変わったかを報告したい。';
    expect(pickClassification(none, text).used).toBe('rules');
    expect(pickClassification(toClassification(base), text).used).toBe('ai');
  });
  it('構成の話の「1系列」は複数に直す', () => {
    expect(toClassification({ ...base, composition_intent: 'SHARE', series_count: 'SINGLE' }).series_count).toBe('MULTIPLE');
  });
});
