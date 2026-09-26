import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, RecommendationStateSchema, registry, type ConsultationClassification, type RecipeId } from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import { classifyConsultation, summarize } from '@/lib/advisor/classify';
import {
  addComplement, addPurposeAngle, availableRecipes, chooseAll, chooseRecipe, chosenRecipes, otherPurposeSuggestions,
  planFromChart, planFromConsultation, planFromPurposes, recommendationState, switchReading, toggleAngle, toggleChosen,
} from './plan';

const ids = (p: ReturnType<typeof planFromPurposes>, i = 0) => p.angles[i]!.items.map((x) => `${x.role}:${x.recipe}`);

describe('入り口ごとの計画', () => {
  it('描けるレシピだけを出す', () => {
    expect(availableRecipes().every(recipeRenderable)).toBe(true);
    expect(availableRecipes().length).toBeGreaterThan(5);
  });

  it('相談：最大3案、先頭だけ選んだ状態', () => {
    const text = '海外5地域の売上（2021〜2025年）で、どこが成長しているかを経営会議で伝えたい。';
    const c = classifyConsultation(text);
    const plan = planFromConsultation({ text, classification: c, ...(({ consultation_summary: summary, interpreted_question: question }) => ({ summary, question }))(summarize(text, c, 'ja')) });
    expect(plan.angles.length).toBeGreaterThan(0);
    expect(plan.angles.length).toBeLessThanOrEqual(3);
    expect(chosenRecipes(plan)).toHaveLength(1);
    expect(plan.angles.every((a) => a.items.every((i) => recipeRenderable(registry.recipes[i.recipe])))).toBe(true);
    const all = chosenRecipes(chooseAll(plan));
    expect(all).toHaveLength(plan.angles.length);
    const st = RecommendationStateSchema.parse(recommendationState(plan));
    expect(st.entry_mode).toBe('CONSULTATION');
    expect(st.consultation_text).toBe(text);
  });

  it('目的：リード1＋サブ2＋ほかの候補。リードだけ選んだ状態', () => {
    const plan = planFromPurposes(['trend']);
    const items = plan.angles[0]!.items;
    expect(items[0]).toMatchObject({ role: 'lead', chosen: true, recipe: 'TREND_LINE' });
    expect(items.filter((i) => i.role === 'sub')).toHaveLength(2);
    expect(items.filter((i) => i.chosen)).toHaveLength(1);
  });

  it('目的を2つ選ぶと、同じレシピは主な目的の側にだけ出る', () => {
    const plan = planFromPurposes(['trend', 'composition']);
    expect(plan.angles).toHaveLength(2);
    const trend = plan.angles[0]!.items.map((i) => i.recipe);
    const comp = plan.angles[1]!.items.map((i) => i.recipe);
    expect(trend).not.toContain('TREND_SHARE'); // 主な目的は構成
    expect(comp).toContain('TREND_SHARE');
    expect(trend.filter((r) => comp.includes(r))).toEqual([]);
  });

  it('チャート：そのチャートの単品が先、同じチャートを使う組み合わせがサブ、目的の残りはほかの候補', () => {
    const plan = planFromChart('line');
    expect(ids(plan)[0]).toBe('lead:TREND_LINE');
    expect(ids(plan)).toContain('sub:TREND_LINE_AVG');
    expect(plan.angles[0]!.items.filter((i) => i.role === 'other').every((i) => registry.recipes[i.recipe].view.panels[0]!.chart !== 'line')).toBe(true);
    // ほかの目的なら：比較・構成の先頭レシピ
    const sug = otherPurposeSuggestions(plan);
    expect(sug.map((r) => registry.recipes[r].goals[0])).toEqual(['comparison', 'composition']);
  });
});

describe('画面の操作', () => {
  it('選ぶ・外す・切り口の開閉', () => {
    let plan = planFromPurposes(['trend']);
    const a = plan.angles[0]!;
    const sub = a.items.find((i) => i.role === 'sub')!.recipe;
    plan = toggleChosen(plan, a.id, sub);
    expect(chosenRecipes(plan).map((c) => c.recipe.id)).toEqual(['TREND_LINE', sub]);
    plan = toggleAngle(plan, a.id, 'included');
    expect(chosenRecipes(plan)).toEqual([]);
  });

  it('別のレシピを選ぶ：あればそこで選択、無ければ主な目的の切り口を足す', () => {
    let plan = planFromPurposes(['trend']);
    plan = chooseRecipe(plan, 'TREND_BAR');
    expect(plan.angles[0]!.showOthers).toBe(true);
    expect(chosenRecipes(plan).map((c) => c.recipe.id)).toContain('TREND_BAR');
    plan = chooseRecipe(plan, 'COMP_RANK');
    expect(plan.angles).toHaveLength(2);
    expect(plan.angles[1]!.purpose).toBe('comparison');
    expect(plan.focus).toBe('COMP_RANK');
  });

  it('補完パーツを足すと、そのレシピを選んだ状態になる', () => {
    let plan = planFromPurposes(['trend']);
    plan = addComplement(plan, 'TREND_STACKED', 'cagr_note');
    const c = chosenRecipes(plan).find((x) => x.recipe.id === 'TREND_STACKED')!;
    expect(c.addComplements).toEqual(['cagr_note']);
  });

  it('切り口を足す（同じ目的をもう1つ足すこともできる）', () => {
    let plan = planFromPurposes(['trend']);
    plan = addPurposeAngle(plan, 'comparison');
    plan = addPurposeAngle(plan, 'comparison');
    expect(plan.angles.map((a) => a.purpose)).toEqual(['trend', 'comparison', 'comparison']);
    // 同じレシピを2回選んでもスライドは1枚
    const first: RecipeId = plan.angles[1]!.items[0]!.recipe;
    expect(chosenRecipes(plan).filter((c) => c.recipe.id === first)).toHaveLength(1);
  });
});

describe('相談の履歴とつなぐ', () => {
  it('履歴の id は保存する推薦の状態に入り、確認の答えの後も残る', async () => {
    const { planFromConsultation, recommendationState } = await import('./plan');
    const { classifyConsultation } = await import('@/lib/advisor/classify');
    const text = '地域別の売上の推移を見せたい';
    const p = planFromConsultation({ text, classification: classifyConsultation(text), classifier: 'rules', historyId: 'h1', summary: '', question: '' });
    expect(recommendationState(p).consultation_history_id).toBe('h1');
    expect(recommendationState({ ...p, consultation: { ...p.consultation!, historyId: undefined } }).consultation_history_id).toBeUndefined();
  });
});

describe('2つの問いの切り替えと、2チャートの切り口', () => {
  const cls = (over: Partial<ConsultationClassification>): ConsultationClassification => ConsultationClassificationSchema.parse({
    primary_goal: 'TREND', business_question: 'どの地域が成長を牽引し、どこが停滞したか', audience: 'EXECUTIVE_MEETING', time_scope: '2021-2025',
    comparison_dimension: '地域', measure: '売上', decision_context: null, needs_exact_values: 'unknown', needs_size_context: true, needs_rate_context: true,
    confidence: 0.8, expected_action: 'RECOMMEND', missing_info: [], time_mode: 'MULTI_PERIOD', comparison_intent: 'DELTA', composition_intent: 'NONE',
    measure_additivity: 'ADDITIVE', series_count: 'MULTIPLE', ...over,
  });
  const alt = { question: '2025年時点で、規模が大きく成長率も高い地域はどこか', classification: cls({ primary_goal: 'RELATIONSHIP', time_mode: 'NONE', comparison_intent: 'NONE' }), focus: ['規模と成長率'] };
  const plan = planFromConsultation({ text: '相談', classification: cls({}), classifier: 'ai', summary: 's', question: 'どの地域が成長を牽引したか', focus: ['成長を牽引'], alternative: alt, reading: 'primary' });

  it('推移で「牽引（差）」なら、折れ線＋増減額の2チャートの切り口が1番目', () => {
    expect(plan.consultation!.ranked[0]!.recipe).toBe('TREND_LINE_DELTA');
    expect(registry.recipes.TREND_LINE_DELTA.composition).toBe('TWO_CHARTS');
  });
  it('もう1つの問いに切り替えると関係の切り口に。戻すと元に戻る。相談文・もう1つの問いは残る', () => {
    const b = switchReading(plan, 'alternative');
    expect(b.consultation!.reading).toBe('alternative');
    expect(registry.recipes[b.consultation!.ranked[0]!.recipe].goals[0]).toBe('relationship');
    expect(b.consultation!.question).toBe(alt.question);
    expect(b.consultation!.focus).toEqual(['規模と成長率']);
    const a = switchReading(b, 'primary');
    expect(a.consultation!.ranked.map((r) => r.recipe)).toEqual(plan.consultation!.ranked.map((r) => r.recipe));
    expect(a.consultation!.focus).toEqual(['成長を牽引']);
    expect(a.consultation!.alternative).toEqual(alt);
  });
});
