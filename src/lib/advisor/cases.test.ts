import { describe, expect, it } from 'vitest';
import { RECIPE_IDS, rankRecipes } from '@/registry';
import { availableRecipes } from '@/features/start/plan';
import { ADVISOR_CASES } from './cases';
import { classifyConsultation } from './classify';
import { scoreCase, summarizeScores } from './score';

describe('AI 相談の正解表', () => {
  it('正解表の案はどれも実在する切り口', () => {
    for (const c of ADVISOR_CASES) for (const id of [...c.expected, ...(c.ok ?? []), ...(c.ng ?? [])]) expect(RECIPE_IDS).toContain(id);
    expect(new Set(ADVISOR_CASES.map((c) => c.id)).size).toBe(ADVISOR_CASES.length);
  });

  it('ルール版の基準点（下がったら気づけるように、今の点以上を保つ）', () => {
    const scores = ADVISOR_CASES.map((c) => {
      const cls = classifyConsultation(c.text);
      return scoreCase(c, { goal: cls.primary_goal, confidence: cls.confidence, top: rankRecipes(cls, availableRecipes()).map((x) => x.recipe.id) });
    });
    const s = summarizeScores(scores);
    if (process.env.SHOW_SCORE) require('node:fs').writeFileSync('/tmp/score.json', JSON.stringify({ s, scores }));
    expect(s.pass).toBeGreaterThanOrEqual(BASELINE_PASS);
  });
});

/** ルール版の満点の件数（2026-09-25 時点） */
const BASELINE_PASS = 17;
