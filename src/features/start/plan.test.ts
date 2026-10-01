import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, RecommendationStateSchema, registry, type ConsultationClassification } from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import { classifyConsultation, summarize } from '@/lib/advisor/classify';
import {
  addPurposeAngle, angleRecommendation, availableRecipes, chosenRecipes, emphasisChoices, planFromChart, planFromConsultation,
  planFromPurposes, planReady, recommendationState, removeAngle, setEmphasis, switchReading,
} from './plan';
import { EMPHASES, recommend } from './coach';

const consult = (text: string) => {
  const c = classifyConsultation(text);
  const s = summarize(text, c, 'ja');
  return planFromConsultation({ text, classification: c, classifier: 'rules', summary: s.consultation_summary, question: s.interpreted_question });
};

describe('3つの入り口は同じ形（切り口＝目的＋重視点）になる', () => {
  it('描けるレシピだけを出す', () => {
    expect(availableRecipes().every(recipeRenderable)).toBe(true);
  });

  it('相談で重視点がはっきりしていれば自動で選び、おすすめは1つ・別案2つ（別案はスライドにしない）', () => {
    const plan = consult('海外5地域の売上（2021〜2025年）で、どこが成長を牽引しているかを経営会議で伝えたい。');
    const a = plan.angles[0]!;
    expect(a).toMatchObject({ purpose: 'trend', emphasis: 'growth_driver', emphasisSource: 'inferred' });
    expect(planReady(plan)).toBe(true);
    const rec = angleRecommendation(plan, a)!;
    expect(rec.alternatives).toHaveLength(2);
    const chosen = chosenRecipes(plan);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]!.recipe.id).toBe(rec.lead.recipe);
    expect(chosen[0]!.alternatives.map((x) => x.recipe)).toEqual(rec.alternatives.map((x) => x.recipe));
    const st = RecommendationStateSchema.parse(recommendationState(plan));
    expect(st.entry_mode).toBe('CONSULTATION');
    expect(st.selected_recipe_ids).toEqual([rec.lead.recipe]);
  });

  it('相談があいまいなら、重視点を質問する（まだデータへ進めない）', () => {
    const plan = consult('海外売上の状況を説明したい。');
    expect(plan.angles[0]!.emphasis).toBeNull();
    expect(planReady(plan)).toBe(false);
    expect(chosenRecipes(plan)).toEqual([]);
    expect(emphasisChoices(plan, plan.angles[0]!).length).toBeLessThanOrEqual(4);
  });

  it('目的「推移」＋「成長率」なら、折れ線＋伸び率注記がおすすめ', () => {
    let plan = planFromPurposes(['trend']);
    expect(plan.angles[0]!.emphasis).toBeNull();
    plan = setEmphasis(plan, plan.angles[0]!.id, 'growth_rate');
    const c = chosenRecipes(plan)[0]!;
    expect(c.recipe.id).toBe('TREND_LINE');
    expect(c.addComplements).toContain('cagr_note');
    expect(plan.angles[0]!.emphasisSource).toBe('user');
  });

  it('チャート「積み上げ縦棒」＋「成長率」なら、積み上げのまま伸び率注記を付ける', () => {
    let plan = planFromChart('stacked_column');
    expect(plan.chart).toBe('stacked_column');
    plan = setEmphasis(plan, plan.angles[0]!.id, 'growth_rate');
    const c = chosenRecipes(plan)[0]!;
    expect(registry.recipes[c.recipe.id].view.panels[0]!.chart).toBe('stacked_column');
    expect(c.addComplements).toContain('cagr_note');
    // 別案は、そのチャート以外
    const rec = angleRecommendation(plan, plan.angles[0]!)!;
    expect(rec.alternatives.every((x) => registry.recipes[x.recipe].view.panels[0]!.chart !== 'stacked_column')).toBe(true);
  });

  it('重視点の選択肢は目的ごとに最大4つ。どの重視点でも、おすすめ1つ＋別案2つが出せる', () => {
    for (const [purpose, list] of Object.entries(EMPHASES)) {
      expect(list.length).toBeLessThanOrEqual(4);
      for (const emphasis of list) {
        const r = recommend({ entryType: 'purpose', purpose: purpose as never, emphasis, audience: null, preferredChart: null, confidence: 1 });
        expect(r, `${purpose}/${emphasis}`).not.toBeNull();
        expect(r!.alternatives.length).toBe(2);
        expect(r!.alternatives.map((x) => x.recipe)).not.toContain(r!.lead.recipe);
        expect([r!.lead, ...r!.alternatives].every((x) => recipeRenderable(registry.recipes[x.recipe]))).toBe(true);
      }
    }
  });
});

describe('切り口を足す（Advanced）', () => {
  it('目的を足すと別の問いのスライドが1枚増え、外すと消える', () => {
    let plan = planFromPurposes(['trend']);
    plan = setEmphasis(plan, plan.angles[0]!.id, 'trajectory');
    plan = addPurposeAngle(plan, 'comparison');
    expect(planReady(plan)).toBe(false);
    plan = setEmphasis(plan, plan.angles[1]!.id, 'ranking');
    expect(chosenRecipes(plan).map((c) => c.purpose)).toEqual(['trend', 'comparison']);
    plan = removeAngle(plan, plan.angles[1]!.id);
    expect(chosenRecipes(plan)).toHaveLength(1);
  });
});

describe('相談の履歴とつなぐ', () => {
  it('履歴の id は保存する推薦の状態に入る', () => {
    const text = '地域別の売上の推移を見せたい';
    const p = planFromConsultation({ text, classification: classifyConsultation(text), classifier: 'rules', historyId: 'h1', summary: '', question: '' });
    expect(recommendationState(p).consultation_history_id).toBe('h1');
  });
});

describe('2つの問いの切り替え（AI は使わない）', () => {
  const cls = (over: Partial<ConsultationClassification>): ConsultationClassification => ConsultationClassificationSchema.parse({
    primary_goal: 'TREND', business_question: 'どの地域が成長を牽引し、どこが停滞したか', audience: 'EXECUTIVE_MEETING', time_scope: '2021-2025',
    comparison_dimension: '地域', measure: '売上', decision_context: null, needs_exact_values: 'unknown', needs_size_context: true, needs_rate_context: true,
    confidence: 0.8, expected_action: 'RECOMMEND', missing_info: [], time_mode: 'MULTI_PERIOD', comparison_intent: 'DELTA', composition_intent: 'NONE',
    measure_additivity: 'ADDITIVE', series_count: 'MULTIPLE', ...over,
  });
  const alt = { question: '2025年時点で、規模が大きく成長率も高い地域はどこか', classification: cls({ primary_goal: 'RELATIONSHIP', time_mode: 'NONE', comparison_intent: 'NONE' }), focus: ['規模と成長率'] };
  const text = '地域別の売上で、どこが成長を牽引したかを伝えたい';
  const plan = planFromConsultation({ text, classification: cls({}), classifier: 'ai', summary: 's', question: 'どの地域が成長を牽引したか', focus: ['成長を牽引'], alternative: alt, reading: 'primary' });

  it('推移で「牽引」なら、成長の牽引役を重視（折れ線＋増減額）', () => {
    expect(plan.angles[0]!.emphasis).toBe('growth_driver');
    expect(chosenRecipes(plan)[0]!.recipe.id).toBe('TREND_LINE_DELTA');
  });
  it('もう1つの問いに切り替えると関係の切り口に。戻すと元に戻る。相談文・もう1つの問いは残る', () => {
    const b = switchReading(plan, 'alternative');
    expect(b.consultation!.reading).toBe('alternative');
    expect(b.angles[0]!.purpose).toBe('relationship');
    expect(b.consultation!.question).toBe(alt.question);
    expect(b.consultation!.text).toBe(text);
    const a = switchReading(b, 'primary');
    expect(a.angles.map((x) => [x.purpose, x.emphasis])).toEqual(plan.angles.map((x) => [x.purpose, x.emphasis]));
    expect(a.consultation!.alternative).toEqual(alt);
  });
});

describe('1枚のスライドを作る画面：③ スライドの形を選ぶ（AI は使わない）', async () => {
  const { planFromConsultation, setPresentation, setEmphasis, selectedProposal, presentationOptions, chosenRecipes } = await import('./plan');
  const { ConsultationClassificationSchema } = await import('@/registry');
  const p0 = planFromConsultation({ text: '地域別の売上の推移', summary: '', question: '', classifier: 'rules', classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }) });
  const withE = setEmphasis(p0, p0.angles[0]!.id, 'trajectory');
  const a = () => withE.angles[0]!;
  it('おすすめもほかの形も選べ、選んだ形が編集画面へ渡る。選ばなかった形は別案に回る', () => {
    const opts = presentationOptions(withE, a());
    expect(opts.length).toBeGreaterThan(1);
    expect(selectedProposal(withE, a())!.recipe).toBe(opts[0]!.recipe);
    const other = opts[1]!.recipe;
    const p = setPresentation(withE, a().id, other);
    expect(chosenRecipes(p)[0]!.recipe.id).toBe(other);
    expect(chosenRecipes(p)[0]!.alternatives.map((x) => x.recipe)).toContain(opts[0]!.recipe);
    expect(chosenRecipes(p)[0]!.alternatives.map((x) => x.recipe)).not.toContain(other);
    // おすすめを選び直すと「選んでいない」に戻る
    expect(setPresentation(p, a().id, opts[0]!.recipe).angles[0]!.recipe).toBeUndefined();
  });
  it('切り口を替えて、選んでいた形が新しい候補に無ければおすすめに戻る', () => {
    const opts = presentationOptions(withE, a());
    const p = setPresentation(withE, a().id, opts[1]!.recipe);
    const q = setEmphasis(p, a().id, 'growth_rate');
    const now = presentationOptions(q, q.angles[0]!).map((x) => x.recipe);
    if (!now.includes(opts[1]!.recipe)) expect(q.angles[0]!.recipe).toBeUndefined();
    expect(now).toContain(selectedProposal(q, q.angles[0]!)!.recipe);
  });
});
