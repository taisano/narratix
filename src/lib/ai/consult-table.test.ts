import { beforeEach, describe, expect, it } from 'vitest';
import { buildConsultPayload } from '@/features/data/draft/consultPayload';
import * as F from '@/features/data/draft/fixtures';
import { ConsultAiSchema } from './consult';
import { handleConsult, resetConsultMemory, type ConsultDeps } from './consult-server';
import { ConsultTableSchema, ROLES_JSON_SCHEMA, ROLES_SYSTEM, toRoleResponse } from './consult-table';
import type { AiProvider } from './provider';

const ai = ConsultAiSchema.parse({
  rationale: 'x', primary_goal: 'COMPARISON', expected_action: 'RECOMMEND', missing_info: [], audience: 'UNKNOWN', time_scope: null,
  time_mode: 'NONE', comparison_dimension: null, measure: '売上', comparison_intent: 'UNKNOWN', composition_intent: 'UNKNOWN',
  measure_additivity: 'ADDITIVE', series_count: 'MULTIPLE', needs_exact_values: 'unknown', needs_size_context: 'unknown', needs_rate_context: 'unknown',
  business_question: null, decision_context: null, confidence: 0.8,
});
const usage = { model: 'm', inputTokens: 10, outputTokens: 5, ms: 1 };
const wire = { time: null, assignments: [{ col: 0, role: 'item', valueKind: null, compareKind: null, compareOf: null }, { col: 1, role: 'metric', valueKind: 'level', compareKind: null, compareOf: null }], primaryMetric: 1, secondaryMetric: null, scaleMetric: null, notes: [] };

function provider(rolesData: unknown | 'fail' = wire): { p: AiProvider; calls: { schemaName: string; user: string }[] } {
  const calls: { schemaName: string; user: string }[] = [];
  const p: AiProvider = {
    name: 't',
    json: (async (req: { schemaName: string; user: string }) => {
      calls.push({ schemaName: req.schemaName, user: req.user });
      if (req.schemaName === 'column_roles') return rolesData === 'fail' ? { ok: false, reason: 'bad_shape', usage } : { ok: true, data: rolesData, usage };
      return { ok: true, data: ai, usage };
    }) as never,
  };
  return { p, calls };
}
function deps(p: AiProvider, over: Partial<ConsultDeps> = {}) {
  const records: Record<string, unknown>[] = [];
  const d: ConsultDeps = {
    configured: true, userId: async () => 'u1', member: async () => true, plan: async () => 'free', used: async () => ({ month: 0, day: 0, total: 0 }),
    record: async (r) => { records.push(r as never); }, provider: p, now: () => new Date('2026-10-21T10:00:00Z'), ...over,
  };
  return { d, records };
}
const payload = (tsv: string) => { const { question: _q, ...t } = buildConsultPayload('q', F.load(tsv).profile); return t; };
const OP = '44444444-4444-4444-8444-444444444444';

beforeEach(() => resetConsultMemory());

describe('AI 相談に表を添える（列の役割）', () => {
  it('表があれば、同じ相談の中で列の役割も返す。回数は1回', async () => {
    const { p, calls } = provider();
    const { d, records } = deps(p);
    const r = await handleConsult({ text: '国別の売上', table: payload(F.ONE_METRIC_TSV), opId: OP }, d);
    expect(r).toMatchObject({ ok: true, remaining: 4, roles: { version: 1, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric', valueKind: 'level' }], primaryMetric: 1 } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ok: true, reason: null, opId: OP, usage: { inputTokens: 20, outputTokens: 10 } });
    expect(calls.map((c) => c.schemaName)).toEqual(['consultation_classification', 'column_roles']);
  });
  it('表が無ければ今までどおり（AI は1回、roles は付かない）', async () => {
    const { p, calls } = provider();
    const r = await handleConsult({ text: '国別の売上' }, deps(p).d);
    expect(calls).toHaveLength(1);
    expect(r).not.toHaveProperty('roles');
  });
  it('AI に渡す文に、セルの値・項目名が含まれない（全固定データ）', async () => {
    for (const tsv of [F.LONG_TSV, F.WIDE_TSV, F.SEVEN_TSV, F.PERIOD_ACROSS_TSV, F.ONE_METRIC_TSV, F.ACTUAL_BUDGET_TSV]) {
      const { p, calls } = provider();
      await handleConsult({ text: '何が伸びたか', table: payload(tsv) }, deps(p).d);
      const sent = JSON.stringify(calls);
      for (const s of F.SENTINELS) expect(sent, s).not.toContain(s);
      expect(sent).not.toMatch(/21\.2%|€89|8675309/);
    }
  });
  it('列の役割が読めない（不正な形・失敗）時は、数えず、roles は null（画面は規則による推定に戻る）', async () => {
    for (const bad of ['fail', { ...wire, assignments: 'oops' }, { ...wire, assignments: [{ ...wire.assignments[0], col: -5 }] }]) {
      const { p } = provider(bad);
      const { d, records } = deps(p);
      const r = await handleConsult({ text: '国別の売上', table: payload(F.ONE_METRIC_TSV) }, d);
      expect(r).toMatchObject({ ok: true, roles: null, remaining: 5 });
      expect(records[0]).toMatchObject({ ok: false, reason: 'roles_failed' });
    }
  });
  it('分類が失敗（タイムアウトなど）したら数えず、列の役割は呼ばない', async () => {
    const calls: string[] = [];
    const p: AiProvider = { name: 't', json: (async (r: { schemaName: string }) => { calls.push(r.schemaName); return { ok: false, reason: 'timeout' }; }) as never };
    const { d, records } = deps(p);
    expect(await handleConsult({ text: 'a', table: payload(F.ONE_METRIC_TSV), opId: OP }, d)).toEqual({ ok: false, reason: 'ai_failed' });
    expect(calls).toEqual(['consultation_classification']);
    expect(records[0]).toMatchObject({ ok: false, reason: 'timeout', opId: OP });
  });
  it('表に余計なキー（セルの値など）があれば受けない', async () => {
    const t = payload(F.ONE_METRIC_TSV);
    const { p, calls } = provider();
    expect(await handleConsult({ text: 'a', table: { ...t, rows: [['ZZ_ALAND', 120]] } }, deps(p).d)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleConsult({ text: 'a', table: { ...t, columns: [{ ...t.columns[0], sample: 'ZZ_ALAND' }] } }, deps(p).d)).toEqual({ ok: false, reason: 'bad_input' });
    expect(calls).toHaveLength(0);
  });
  it('同じ操作 ID の再送・連打は、AI を呼ばず、数えない', async () => {
    const { p, calls } = provider();
    const { d } = deps(p, { opSeen: async (_u, op) => op === OP });
    expect(await handleConsult({ text: 'a', table: payload(F.ONE_METRIC_TSV), opId: OP }, d)).toEqual({ ok: false, reason: 'duplicate' });
    expect(calls).toHaveLength(0);
    expect((await handleConsult({ text: 'a', opId: '55555555-5555-4555-8555-555555555555' }, d)).ok).toBe(true);
  });
  it('操作 ID が UUID でなければ受けない', async () => {
    expect(await handleConsult({ text: 'a', opId: 'not-a-uuid' }, deps(provider().p).d)).toEqual({ ok: false, reason: 'bad_input' });
  });
});

describe('列の役割の AI 側の定義', () => {
  it('JSON Schema は strict（全キー必須・追加キーなし）。プロンプトは「値は渡されていない」ことを伝える', () => {
    const s = ROLES_JSON_SCHEMA as unknown as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
    expect(s.additionalProperties).toBe(false);
    expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
    expect(ROLES_SYSTEM).toContain('セルの値は渡されていません');
  });
  it('null 入りの返答を AiRoleResponse に直す。時間・主指標・ヒント・notes を通す', () => {
    const r = toRoleResponse({ ...wire, time: { orientation: 'rows', at: [0], periodKind: 'month' }, secondaryMetric: 2, notes: ['迷った'] } as never);
    expect(r).toMatchObject({ version: 1, time: { orientation: 'rows', at: [0] }, hints: { secondaryMetric: 2 }, notes: ['迷った'] });
    expect(r!.assignments[0]).toEqual({ col: 0, role: 'item' });
  });
  it('表のスキーマは strict', () => {
    expect(ConsultTableSchema.safeParse(payload(F.SEVEN_TSV)).success).toBe(true);
    expect(ConsultTableSchema.safeParse({ ...payload(F.SEVEN_TSV), extra: 1 }).success).toBe(false);
  });
});
