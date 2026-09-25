import { describe, expect, it } from 'vitest';
import { RECIPE_IDS, rankRecipes, type ConsultationClassification } from '@/registry';
import { availableRecipes } from '@/features/start/plan';
import { ADVISOR_CASES } from './cases';
import { classifyConsultation } from './classify';
import { scoreCase, summarizeScores, type AdvisorAnswer } from './score';

/** ルール版の答え。今のアプリは確認をしないので、案が0件なら「まだ作れない」、それ以外は推薦 */
export function ruleAnswer(text: string): AdvisorAnswer & { cls: ConsultationClassification } {
  const cls = classifyConsultation(text);
  const top = rankRecipes(cls, availableRecipes()).map((x) => x.recipe.id);
  return { cls, action: top.length ? 'RECOMMEND' : 'UNSUPPORTED', goal: cls.primary_goal, top };
}

describe('AI 相談の正解表', () => {
  it('正解表の形：案は実在し、行動と期待案が合っている', () => {
    for (const c of ADVISOR_CASES) {
      for (const id of [...c.expected, ...(c.ok ?? []), ...(c.ng ?? [])]) expect(RECIPE_IDS).toContain(id);
      if (c.action === 'RECOMMEND') expect(c.expected.length).toBeGreaterThan(0);
      else expect(c.expected).toEqual([]);
      if (c.action === 'CLARIFY') expect(c.questions?.length).toBeGreaterThan(0);
      // 期待と NG が重ならない
      expect(c.expected.filter((id) => c.ng?.includes(id))).toEqual([]);
    }
    expect(new Set(ADVISOR_CASES.map((c) => c.id)).size).toBe(ADVISOR_CASES.length);
  });

  it('ルール版の基準点（下がったら気づけるように、今の点以上を保つ）', () => {
    const scores = ADVISOR_CASES.map((c) => scoreCase(c, ruleAnswer(c.text)));
    const s = summarizeScores(scores);
    if (process.env.SHOW_SCORE) require('node:fs').writeFileSync('/tmp/score.json', JSON.stringify({ s, scores, answers: ADVISOR_CASES.map((c) => ({ id: c.id, ...ruleAnswer(c.text) })) }));
    expect(s.pass).toBeGreaterThanOrEqual(BASELINE.pass);
    expect(s.safe).toBeGreaterThanOrEqual(BASELINE.safe);
  });
});

/** ルール版の点（2026-09-25 レビュー反映後） */
const BASELINE = { pass: 15, safe: 25 };
