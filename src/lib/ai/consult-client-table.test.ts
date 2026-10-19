import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildConsultPayload } from '@/features/data/draft/consultPayload';
import * as F from '@/features/data/draft/fixtures';
import { analyzeTable, buildDraft, resolveRoles } from '@/features/data/draft/session';
import { consultWithAi } from './consult-client';
import ja from '@/i18n/messages/ja.json';
import en from '@/i18n/messages/en.json';

const OP = '66666666-6666-4666-8666-666666666666';
const tableOf = (tsv: string) => { const a = analyzeTable(tsv); if (!a.ok) throw new Error(); const { question: _q, ...t } = buildConsultPayload('q', a.profile); return t; };

describe('T-FLOW：画面から AI を呼ぶ時', () => {
  it('表の特徴と操作 ID を送る。送る本文に、セルの値・項目名は無い', async () => {
    let body = '';
    const f = (async (_u: string, init: RequestInit) => { body = String(init.body); return new Response(JSON.stringify({ ok: false, reason: 'ai_failed' })); }) as unknown as typeof fetch;
    await consultWithAi('国別の売上', 'tok', f, 1000, undefined, 'ja', { table: tableOf(F.SEVEN_TSV), opId: OP });
    const sent = JSON.parse(body);
    expect(sent.opId).toBe(OP);
    expect(sent.table.columns.length).toBe(9);
    for (const s of F.SENTINELS) expect(body, s).not.toContain(s);
    expect(body).not.toMatch(/21\.2%|€89|Price-led/);
  });
  it('表が無ければ今までどおりの本文（table も opId も付けない）', async () => {
    let body = '';
    const f = (async (_u: string, init: RequestInit) => { body = String(init.body); return new Response('{}'); }) as unknown as typeof fetch;
    await consultWithAi('a', 'tok', f);
    expect(JSON.parse(body)).toEqual({ text: 'a' });
  });
  it('AI の返事の列の役割を受け取る。読めなかった時（null）は規則による推定で続けられる', async () => {
    const roles = { version: 1, assignments: [{ col: 0, role: 'item' }, { col: 1, role: 'metric' }] };
    const ok = (r: unknown) => (async () => new Response(JSON.stringify({ ok: true, source: 'ai', classification: {}, reading: null, remaining: 3, roles: r }))) as unknown as typeof fetch;
    expect(await consultWithAi('a', 't', ok(roles))).toMatchObject({ source: 'ai', roles });
    expect(await consultWithAi('a', 't', ok(null))).toMatchObject({ source: 'ai', roles: null });
    const a = analyzeTable(F.ONE_METRIC_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null);
    expect(r).toMatchObject({ status: 'ready', map: { source: 'rules' } });
  });
  it('タイムアウト・不正な返答でもルール版に戻り、手元の推定で候補が描ける（AI に頼らない）', async () => {
    const f = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await consultWithAi('a', 't', f, 1000, undefined, 'ja', { table: tableOf(F.LONG_TSV), opId: OP })).toEqual({ source: 'rules', fallback: 'failed' });
    const a = analyzeTable(F.LONG_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    expect(buildDraft(a.table, r.map, '')).toMatchObject({ ok: true, shape: 'time_metric' });
  });
  it('同じ操作 ID の再送（409）は、結果を作り直さず rules/failed として扱う（画面は最初の結果を使う）', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: false, reason: 'duplicate' }), { status: 409 })) as unknown as typeof fetch;
    expect(await consultWithAi('a', 't', f, 1000, undefined, 'ja', { opId: OP })).toEqual({ source: 'rules', fallback: 'failed' });
  });
});

describe('T-I18N：AI に送る内容の説明を、3 か所で同じ文にそろえる', () => {
  const U = { ja: 'AIには相談文と、表の列見出し・形式を送ります。セルの値は送りません。', en: 'The AI receives your request text and your table’s column headings and format. Cell values are never sent.' };
  for (const [lang, m] of [['ja', ja], ['en', en]] as const) {
    it(`${lang}：共通の文のキーがあり、AI 相談画面・データの取り扱い・トップが同じ文を使う`, () => {
      const msgs = m as Record<string, string>;
      expect(msgs['privacy.aiSends']).toBe(U[lang]);
      expect(msgs['entry.ai.privacyShort']).toBe(U[lang]);
      expect(msgs['privacy.point2']!.startsWith(U[lang])).toBe(true);
      expect(msgs['landing.beta.t2.body']!.startsWith(U[lang])).toBe(true);
    });
  }
  it('貼り付け欄（AI 相談ボタンの近く）が共通のキーを表示する', () => {
    expect(readFileSync('src/features/start/DraftPaste.tsx', 'utf8')).toContain("t('privacy.aiSends')");
  });
  it('ja／en とも、「表のデータは送りません」と言い切る古い文言が残っていない', () => {
    for (const m of [ja, en] as Record<string, string>[]) {
      for (const k of ['entry.ai.rule', 'privacy.point1', 'privacy.data.2', 'beta.terms.t3', 'landing.beta.t2.body']) {
        expect(m[k], k).not.toMatch(/表のデータ(は|を)(AI|送)|Table data (is|are) (never )?sent|Table data is not sent/);
      }
    }
  });
});
