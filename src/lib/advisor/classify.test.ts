import { describe, expect, it } from 'vitest';
import { rankRecipes } from '@/registry';
import { classifyConsultation, findTimeScope, summarize } from './classify';

describe('相談文の分類（ルール版）', () => {
  it('指示書の例', () => {
    const c = classifyConsultation('海外5地域の売上（2021〜2025年）で、どこが成長しているかを経営会議で伝えたい。');
    expect(c).toMatchObject({
      primary_goal: 'TREND', audience: 'EXECUTIVE_MEETING', time_scope: '2021-2025',
      comparison_dimension: '地域', measure: '売上', needs_rate_context: true,
      // 相談文に書かれていないことは決めない
      needs_size_context: 'unknown', needs_exact_values: 'unknown', decision_context: null,
    });
    expect(summarize('', c, 'ja')).toEqual({
      consultation_summary: '地域別の売上（2021-2025）の推移を、経営会議で伝えたい',
      interpreted_question: '成長率も含めて、どう伝えるか',
    });
    // 数値や結論は作らない
    expect(JSON.stringify(summarize('', c, 'ja'))).not.toMatch(/中国|北米|\d+%/);
  });

  it('目的の言葉', () => {
    expect(classifyConsultation('営業会議で、製品別の売上ランキングを見せたい').primary_goal).toBe('COMPARISON');
    expect(classifyConsultation('市場のシェアの内訳を報告したい').primary_goal).toBe('COMPOSITION');
    expect(classifyConsultation('利益が減った要因を分解したい').primary_goal).toBe('CONTRIBUTION');
  });

  it('目的の言葉が無ければ、期間があれば推移、無ければ比較。確信度は低い', () => {
    const a = classifyConsultation('2020年から2024年の売上をまとめたい');
    expect(a.primary_goal).toBe('TREND');
    expect(a.confidence).toBeLessThan(0.5);
    expect(classifyConsultation('部門の数字をまとめたい').primary_goal).toBe('COMPARISON');
  });

  it('期間の書き方', () => {
    expect(findTimeScope('2019-2023の推移')).toBe('2019-2023');
    expect(findTimeScope('2021年から2025年まで')).toBe('2021-2025');
    expect(findTimeScope('過去5年の動き')).toBe('5y');
    expect(findTimeScope('3年間の売上')).toBe('3y');
    expect(findTimeScope('今期の売上')).toBeNull();
  });

  it('場面', () => {
    expect(classifyConsultation('役員向けに').audience).toBe('EXECUTIVE_MEETING');
    expect(classifyConsultation('月報に載せる').audience).toBe('REPORT');
    expect(classifyConsultation('見せたい').audience).toBe('UNKNOWN');
  });

  it('分類から最大3案が並ぶ（描けるものだけに絞っても空にならない）', () => {
    const c = classifyConsultation('海外5地域の売上（2021〜2025年）で、どこが成長しているかを経営会議で伝えたい。');
    const all = rankRecipes(c);
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]!.recipe.goals).toContain('trend');
  });
});

describe('指示書の例（描けるレシピだけで）', () => {
  it('部品がそろったので、指示書と同じ3案が同じ順に並ぶ', async () => {
    const { availableRecipes } = await import('@/features/start/plan');
    const c = { ...classifyConsultation('海外5地域の売上（2021〜2025年）で、どこが成長しているかを経営会議で伝えたい。'), needs_size_context: true as const, needs_exact_values: true as const };
    expect(rankRecipes(c, availableRecipes()).map((x) => x.recipe.id)).toEqual(['TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'START_END_CAGR']);
  });
});
