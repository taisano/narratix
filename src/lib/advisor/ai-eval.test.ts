import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { classifyWithAi } from '@/lib/ai/consult';
import { AI_MODELS, openAiProvider } from '@/lib/ai/provider';
import { ADVISOR_CASES } from './cases';
import { VALIDATION_CASES } from './cases-validation';
import { answerFromClassification } from './answer';
import { pickClassification } from './pick';
import { classifyConsultation } from './classify';
import { scoreCase, summarizeScores, type CaseScore } from './score';
import type { AdvisorCase } from './cases';

/**
 * AI 版の採点（本物の OpenAI を呼ぶ。ふだんのテストでは飛ばす）。
 * 実行：npm run eval:ai（.env.local の OPENAI_API_KEY を使う）。結果は .eval/ai-eval.json（git には入れない）
 * プロンプトを直す時は開発セットの結果だけを見る。検証セットは最後に点を見るだけ（合わせ込まない）。
 */
const RUN = !!process.env.AI_EVAL;
if (RUN && existsSync('.env.local')) process.loadEnvFile('.env.local');

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]!); } }));
  return out;
}

describe.skipIf(!RUN)('AI 版の採点（本物の API）', () => {
  it('開発セット・検証セットで、ルール版と AI 版を比べる', async () => {
    expect(process.env.OPENAI_API_KEY, '.env.local に OPENAI_API_KEY を入れてください').toBeTruthy();
    const provider = openAiProvider();
    const run = async (set: AdvisorCase[]) => {
      const rows = await pool(set, 4, async (c) => {
        const rule = answerFromClassification(classifyConsultation(c.text));
        const ai = await classifyWithAi(c.text, provider);
        // 画面と同じく、AI の分類で案が0件ならルール版に切り替えた答えで採点する
        const picked = ai.ok ? pickClassification(ai.data, c.text) : null;
        const aiAns = picked ? answerFromClassification(picked.classification) : null;
        return {
          id: c.id, text: c.text,
          expected: { action: c.action, goal: c.goal, top: c.expected },
          rule: { answer: { action: rule.action, goal: rule.goal, top: rule.top }, score: scoreCase(c, rule) },
          ai: ai.ok ? { answer: { action: aiAns!.action, goal: aiAns!.goal, top: aiAns!.top }, cls: ai.data, used: picked!.used, score: scoreCase(c, aiAns!), usage: ai.usage } : { failed: ai.reason },
        };
      });
      const aiScores = rows.map((r) => ('score' in r.ai ? r.ai.score : null)).filter((x): x is CaseScore => !!x);
      const tokens = rows.reduce((s, r) => s + ('usage' in r.ai && r.ai.usage ? r.ai.usage.inputTokens + r.ai.usage.outputTokens : 0), 0);
      return { n: set.length, rule: summarizeScores(rows.map((r) => r.rule.score)), ai: summarizeScores(aiScores), aiFailed: rows.filter((r) => 'failed' in r.ai).length, tokens, rows };
    };
    const dev = await run(ADVISOR_CASES);
    const val = await run(VALIDATION_CASES);
    mkdirSync('.eval', { recursive: true });
    const model = AI_MODELS.ai_consult;
    writeFileSync('.eval/ai-eval.json', JSON.stringify({ at: new Date().toISOString(), model: model.model, effort: model.effort, dev, val }, null, 1));
    const line = (name: string, r: typeof dev) => `${name}: ルール版 ${r.rule.pass}/${r.n}　AI 版 ${r.ai.pass}/${r.n}（安全 ${r.ai.safe}、失敗 ${r.aiFailed}、${r.tokens} トークン）`;
    console.log(`\nモデル ${model.model}（${model.effort}）\n${line('開発セット', dev)}\n${line('検証セット', val)}\n詳しくは .eval/ai-eval.json\n`);
  }, 300_000);
});
