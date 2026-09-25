import { describe, expect, it } from 'vitest';
import { RECIPE_IDS, rankRecipes, type ConsultationClassification } from '@/registry';
import { availableRecipes } from '@/features/start/plan';
import { ADVISOR_CASES } from './cases';
import { classifyConsultation } from './classify';
import { scoreCase, summarizeScores, type AdvisorAnswer } from './score';

/** ルール版の答え。推薦なのに案が0件なら「まだ作れない」 */
export function ruleAnswer(text: string): AdvisorAnswer & { cls: ConsultationClassification } {
  const cls = classifyConsultation(text);
  const top = rankRecipes(cls, availableRecipes()).map((x) => x.recipe.id);
  const action = cls.expected_action === 'RECOMMEND' && !top.length ? 'UNSUPPORTED' : cls.expected_action;
  return { cls, action, goal: cls.primary_goal, top };
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

/** ルール版の点（2026-09-25 分類項目と並べ方の規則を追加後。開発セットに合わせて直したので満点は当然。検証セットで測る） */
const BASELINE = { pass: 30, safe: 30 };

describe('検証セット（言い換え・境界）', () => {
  it('形が正しく、ルール版の点を記録する（調整には使わない）', async () => {
    const { VALIDATION_CASES } = await import('./cases-validation');
    for (const c of VALIDATION_CASES) for (const id of [...c.expected, ...(c.ok ?? []), ...(c.ng ?? [])]) expect(RECIPE_IDS).toContain(id);
    const scores = VALIDATION_CASES.map((c) => scoreCase(c, ruleAnswer(c.text)));
    const s = summarizeScores(scores);
    if (process.env.SHOW_SCORE) require('node:fs').writeFileSync('/tmp/score-val.json', JSON.stringify({ s, scores, answers: VALIDATION_CASES.map((c) => ({ id: c.id, ...ruleAnswer(c.text) })) }));
    expect(s.pass).toBeGreaterThanOrEqual(VALIDATION_BASELINE.pass);
  });
});

/** 検証セットのルール版の点（2026-09-25） */
const VALIDATION_BASELINE = { pass: 15 };

describe('確認の答えで切り口が出る', () => {
  it('「部門の数字をまとめたい」→ 見方と数字を答えると案が出る', async () => {
    const { applyClarify } = await import('./clarify');
    const cls = classifyConsultation('部門の数字をまとめたい。');
    expect(cls.expected_action).toBe('CLARIFY');
    expect(rankRecipes(cls, availableRecipes())).toEqual([]);
    const after = applyClarify(cls, { VIEW: 1, MEASURE: 0, DECISION: 0 });
    expect(after.expected_action).toBe('RECOMMEND');
    expect(rankRecipes(after, availableRecipes())[0]?.recipe.id).toBe('COMP_RANK');
  });
  it('「平均より伸びている」→ 伸び率の平均を選ぶと CAGR の案', async () => {
    const { applyClarify } = await import('./clarify');
    const cls = classifyConsultation('店舗ごとの売上の推移を見て、平均より伸びている店を営業会議で確認したい。');
    expect(cls.missing_info).toEqual(['AVERAGE_BASIS']);
    const ids = rankRecipes(applyClarify(cls, { AVERAGE_BASIS: 1 }), availableRecipes()).map((x) => x.recipe.id);
    expect(ids).toContain('TREND_CAGR_TABLE');
    const lvl = rankRecipes(applyClarify(cls, { AVERAGE_BASIS: 0 }), availableRecipes()).map((x) => x.recipe.id);
    expect(lvl[0]).toBe('TREND_LINE_AVG');
  });
});
