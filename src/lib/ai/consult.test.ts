import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema } from '@/registry';
import { ADVISOR_CASES } from '@/lib/advisor/cases';
import { VALIDATION_CASES } from '@/lib/advisor/cases-validation';
import { CONSULT_JSON_SCHEMA, CONSULT_SYSTEM, ConsultAiSchema, classifyWithAi, toClassification, type ConsultAi } from './consult';
import { disabledProvider, openAiProvider, outputText } from './provider';

const baseRaw = {
  rationale: 'x', primary_goal: 'TREND', expected_action: 'RECOMMEND', missing_info: [], audience: 'UNKNOWN', time_scope: '2021-2025',
  time_mode: 'MULTI_PERIOD', comparison_dimension: '地域', measure: '売上', comparison_intent: 'UNKNOWN', composition_intent: 'UNKNOWN',
  measure_additivity: 'ADDITIVE', series_count: 'MULTIPLE', needs_exact_values: 'unknown', needs_size_context: 'true', needs_rate_context: 'unknown',
  business_question: null, decision_context: null, confidence: 0.9,
};
const base: ConsultAi = ConsultAiSchema.parse(baseRaw);

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

describe('読み取りの見える化と、2つの問い', () => {
  const text = '海外5地域の売上（2021〜2025年）について、どの地域が成長を牽引し、どの地域が停滞しているかを経営会議で一目で伝えたい。地域別の規模と成長率の両方をどう見せるべきか迷っている。';
  const raw = {
    ...baseRaw, comparison_intent: 'DELTA', audience: 'EXECUTIVE_MEETING',
    focus_phrases: ['どの地域が成長を牽引し', '2021〜2025年', '言い換えた言葉'],
    alternative: {
      question: '2025年時点で、規模が大きく成長率も高い地域はどこか', primary_goal: 'RELATIONSHIP', time_mode: 'NONE',
      comparison_intent: 'NONE', composition_intent: 'NONE', needs_size_context: 'true', needs_rate_context: 'unknown',
      focus_phrases: ['地域別の規模と成長率の両方'],
    },
  };
  const ai = ConsultAiSchema.parse(raw);
  it('重視した言葉は相談文にあるものだけ。もう1つの問いは、元の分類を土台に目的などを差し替えた分類', async () => {
    const { toReading } = await import('./consult');
    const primary = toClassification(ai);
    const r = toReading(ai, text, primary);
    expect(r.focus).toEqual(['どの地域が成長を牽引し', '2021〜2025年']);
    expect(r.alternative!.classification).toMatchObject({ primary_goal: 'RELATIONSHIP', time_mode: 'NONE', measure: '売上', audience: 'EXECUTIVE_MEETING', expected_action: 'RECOMMEND' });
    expect(r.alternative!.focus).toEqual(['地域別の規模と成長率の両方']);
  });
  it('もう1つの問いが同じ目的・評価なら出さない', async () => {
    const { toReading } = await import('./consult');
    const same = ConsultAiSchema.parse({ ...raw, alternative: { ...raw.alternative, primary_goal: 'TREND' } });
    expect(toReading(same, text, toClassification(same)).alternative).toBeNull();
    const evalAlt = ConsultAiSchema.parse({ ...raw, alternative: { ...raw.alternative, primary_goal: 'EVALUATION' } });
    expect(toReading(evalAlt, text, toClassification(evalAlt)).alternative).toBeNull();
  });
  it('補足は相談文のあとに付けて送る', async () => {
    const { f, sent } = fakeFetch(reply({ ...raw, alternative: null }));
    const r = await classifyWithAi(text, openAiProvider('k', f), '時系列の推移を中心に見せたい');
    expect(r.ok).toBe(true);
    const body = JSON.parse(sent[0]!.init.body as string);
    expect(JSON.stringify(body)).toContain('補足（提案を見て書き足した意図）');
    expect(JSON.stringify(body)).toContain('時系列の推移を中心に見せたい');
  });
  it('画面の言語を「出力の言語」として送る（英語の画面では、問い・決めたいことを英語で返してもらう）', async () => {
    const en = fakeFetch(reply({ ...raw, alternative: null }));
    await classifyWithAi(text, openAiProvider('k', en.f), undefined, 'en');
    expect(JSON.stringify(JSON.parse(en.sent[0]!.init.body as string))).toContain('出力の言語：英語');
    const ja = fakeFetch(reply({ ...raw, alternative: null }));
    await classifyWithAi(text, openAiProvider('k', ja.f));
    expect(JSON.stringify(JSON.parse(ja.sent[0]!.init.body as string))).toContain('出力の言語：日本語');
    expect(CONSULT_SYSTEM).toContain('「出力の言語」で書く');
  });
  it('プロンプトに、同じ指標の「規模と成長率」は推移、の決まりがある', () => {
    expect(CONSULT_SYSTEM).toContain('同じ指標（例：売上）の大きさと伸び');
    expect(CONSULT_SYSTEM).toContain('alternative');
  });
});

describe('Story 用の読み取り（docs/story-spec.md 5.2）', () => {
  it('JSON Schema の story も strict（全項目が必須）', () => {
    const st = CONSULT_JSON_SCHEMA.properties.story;
    expect(st.additionalProperties).toBe(false);
    expect([...st.required].sort()).toEqual(Object.keys(st.properties).sort());
  });
  it('古い返事（story が無い）も読める', () => {
    expect(ConsultAiSchema.parse(baseRaw).story).toBeNull();
  });
  it('アプリの形に直す：知らない語は外す、UNKNOWN は null、明示の枚数は規則で読む', async () => {
    const { toStoryReading, explicitSize } = await import('./consult');
    const a = ConsultAiSchema.parse({ ...baseRaw, business_question: '優先市場は', story: {
      decision_question: ' ', desired_yes: 'UNKNOWN', primary_barrier: null, proof_needs: ['OVERALL_CHANGE', 'CAUSE', 'OVERALL_CHANGE'],
      scope_candidate: 'STORY_FLOW', route_signals: ['MISMATCH', 'NOPE'], outcome_direction: 'MIXED', confidence: 3,
      personalizations: [{
        target: 'OVERALL_CHANGE', explanation: '市場全体の変化を確かめます。', confidence: 'proposed',
        required_data_hints: ['市場全体の期間別実績', '', '市場全体の期間別実績'], unresolved_question: null, source_terms: ['市場', 'ない言葉'],
      }, {
        target: 'NOPE', explanation: '知らない語には付けない。', confidence: 'proposed',
        required_data_hints: [], unresolved_question: null, source_terms: [],
      }, {
        target: 'CAUSE', explanation: 'proof_needsに無い語には付けない（CAUSEは今回選ばれていない）。', confidence: 'proposed',
        required_data_hints: [], unresolved_question: null, source_terms: [],
      }],
    } });
    expect(toStoryReading(a, '市場について一連の流れで説明したい')).toEqual({
      decisionQuestion: '優先市場は', desiredYes: null, primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE'], scopeCandidate: 'STORY_FLOW',
      routeSignals: ['MISMATCH'], outcomeDirection: 'MIXED', explicitSize: 'MULTIPLE', confidence: 1,
      personalizations: [{
        target: 'OVERALL_CHANGE', explanation: '市場全体の変化を確かめます。', confidence: 'proposed',
        requiredDataHints: ['市場全体の期間別実績'], sourceTerms: ['市場'],
      }],
    });
    expect(explicitSize('1枚で報告したい')).toBe('ONE');
    expect(explicitSize('売上を1枚にまとめたい')).toBe('ONE');
    expect(explicitSize('売上の推移を見せたい')).toBeNull();
  });
  it('具体化は同じAI応答に含め、結論・固有名詞の捏造・追加データ送信を禁止する', () => {
    expect(CONSULT_SYSTEM).toContain('同じ応答の中で');
    expect(CONSULT_SYSTEM).toContain('結果・結論・数値は書かない');
    expect(CONSULT_SYSTEM).toContain('相談文にない地域・商品・期間・指標・施策を作らない');
    expect(CONSULT_SYSTEM).toContain('データ表・入力データは受け取らない');
  });
});
