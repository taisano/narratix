import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, RecommendationStateSchema, registry, type ChartTypeId, type ConsultationClassification } from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import { classifyConsultation, summarize } from '@/lib/advisor/classify';
import {
  addPurposeAngle, angleRecommendation, availableRecipes, chosenRecipes, emphasisChoices, planFromChart, planFromConsultation,
  planFromPurposes, planReady, recommendationState, removeAngle, selectedProposal, setEmphasis, setPresentation, switchReading,
} from './plan';
import { EMPHASES, recommend, type EmphasisId } from './coach';
import { DISHES } from './dishes';

const mainChart = (recipe: string) => registry.recipes[recipe as keyof typeof registry.recipes].view.panels.find((x) => x.id === 'main')!.chart;

function chartKeptCases(chart: ChartTypeId, emphases: readonly EmphasisId[]) {
  describe(`チャートから選ぶ：${chart}を第一案にする`, () => {
    const at = (emphasis: EmphasisId) => {
      const p0 = planFromChart(chart);
      const p = setEmphasis(p0, p0.angles[0]!.id, emphasis);
      const a = p.angles[0]!;
      return { p, a, rec: angleRecommendation(p, a)! };
    };
    it('4つの伝えたいことすべてで、選んだチャートが先頭・既定選択になり、別案は異なるチャートだけ', () => {
      for (const emphasis of emphases) {
        expect(DISHES[emphasis].materials?.[chart]?.chosen, `${chart}/${emphasis}`).toBeTruthy();
        const { p, a, rec } = at(emphasis);
        expect(mainChart(rec.lead.recipe)).toBe(chart);
        expect(rec.switched).toBeFalsy();
        expect(mainChart(selectedProposal(p, a)!.recipe)).toBe(chart);
        const coach = rec.alternatives.slice((rec.chosenCount ?? 1) - 1);
        expect(coach.length).toBeGreaterThan(0);
        expect(coach.every((x) => mainChart(x.recipe) !== chart)).toBe(true);
        expect(rec.advice).toBeTruthy();
        expect(rec.recommendAlt).toBe(DISHES[emphasis].materials?.[chart]?.fit === 'SWITCH_RECOMMENDED');
      }
    });
    it('別案を選んだ時だけ別チャートになり、元の案と別の切り口へ戻せる', () => {
      const { p, a, rec } = at(emphases[0]!);
      const alternative = rec.alternatives.slice((rec.chosenCount ?? 1) - 1)[0]!;
      const q = setPresentation(p, a.id, alternative.recipe);
      expect(mainChart(chosenRecipes(q)[0]!.recipe.id)).not.toBe(chart);
      expect(mainChart(chosenRecipes(setPresentation(q, a.id, rec.lead.recipe))[0]!.recipe.id)).toBe(chart);
      const next = setEmphasis(q, a.id, emphases[1]!);
      expect(mainChart(chosenRecipes(next)[0]!.recipe.id)).toBe(chart);
    });
  });
}

chartKeptCases('share_pair', EMPHASES.composition);
chartKeptCases('waterfall', EMPHASES.contribution);
chartKeptCases('variable_width', EMPHASES.relationship);
chartKeptCases('bubble', EMPHASES.relationship);
chartKeptCases('slope', EMPHASES.trend);
chartKeptCases('rank_slope', EMPHASES.comparison);
chartKeptCases('bar_100', EMPHASES.composition);

describe('100%横棒：データ条件と同一チャートの別の形', () => {
  const at = (emphasis: EmphasisId, conditions: Record<string, string>) => {
    const p0 = planFromChart('bar_100');
    const p = setEmphasis({ ...p0, dataConditions: conditions as never }, p0.angles[0]!.id, emphasis);
    return angleRecommendation(p, p.angles[0]!)!;
  };
  it('2時点未満なら同じ100%横棒で現在の構成を見せ、理由を出す', () => {
    const one = at('mix_shift', { PERIODS_2PLUS: 'no' });
    expect(one.lead.recipe).toBe('MIX_SNAPSHOT');
    expect(mainChart(one.lead.recipe)).toBe('bar_100');
    expect(one.note?.ja).toMatch(/時点が1つ/);
  });
  it('同じ100%横棒の別の形はchosen側、Coach別案は別チャートだけ', () => {
    const current = at('current_mix', {});
    expect(current.chosenCount).toBe(2);
    expect(mainChart(current.alternatives[0]!.recipe)).toBe('bar_100');
    expect(current.alternatives.slice(1).every((x) => mainChart(x.recipe) !== 'bar_100')).toBe(true);
  });
});

chartKeptCases('variance_bar', EMPHASES.comparison);

describe('差分バー：比較元がない時の扱い', () => {
  it('比較元がなくても差分バーを維持し、必要なデータを理由で案内する', () => {
    const p0 = planFromChart('variance_bar');
    const p = setEmphasis({ ...p0, dataConditions: { PERIODS_2PLUS: 'no' } }, p0.angles[0]!.id, 'gap');
    const rec = angleRecommendation(p, p.angles[0]!)!;
    expect(mainChart(rec.lead.recipe)).toBe('variance_bar');
    expect(rec.note?.ja).toMatch(/比較元/);
  });
});

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

describe('チャートから選ぶ：Mekko を選んだら Mekko の案が第一案（自動で別のチャートに替えない）', async () => {
  const { planFromChart, setEmphasis, setPresentation, selectedProposal, chosenRecipes, angleRecommendation } = await import('./plan');
  const { registry } = await import('@/registry');
  const { AUTO_HIGHLIGHT } = await import('../editor/fromRecipe');
  const main = (id: string) => registry.recipes[id as 'MIX_MEKKO'].view.panels.find((x) => x.id === 'main')!.chart;
  const at = (e: 'current_mix' | 'mix_shift' | 'size_and_mix' | 'item_share', conds?: Record<string, string>) => {
    const p0 = planFromChart('mekko');
    const p = setEmphasis(conds ? { ...p0, dataConditions: conds as never } : p0, p0.angles[0]!.id, e);
    return { p, a: p.angles[0]!, rec: angleRecommendation(p, p.angles[0]!)! };
  };
  it('4つの伝えたいことすべてで、Mekko の案が先頭・既定選択。別のチャートは Coach からの別案として後ろ', () => {
    for (const e of ['current_mix', 'mix_shift', 'size_and_mix', 'item_share'] as const) {
      const { p, a, rec } = at(e);
      expect(main(rec.lead.recipe)).toBe('mekko');
      expect(rec.switched).toBeFalsy();
      expect(main(selectedProposal(p, a)!.recipe)).toBe('mekko');
      const coach = rec.alternatives.slice(rec.chosenCount! - 1);
      for (const x of coach) expect(main(x.recipe)).not.toBe('mekko');
      if (coach.length) expect(rec.advice).toBeTruthy();
    }
  });
  it('構成の変化：Mekko＋左に全体の構成（2時点）＋区画の増減。時点が1つなら Mekko だけで理由を出す。別案は100%横棒など', () => {
    const { rec } = at('mix_shift');
    expect(rec.lead.recipe).toBe('MIX_MEKKO_SHIFT');
    expect(rec.lead.complements).toContain('delta_labels');
    expect(rec.alternatives.map((x) => x.recipe)).toContain('MIX_BAR100');
    const one = at('mix_shift', { PERIODS_2PLUS: 'no' }).rec;
    expect(one.lead.recipe).toBe('MIX_MEKKO');
    expect(one.note?.ja).toMatch(/時点が1つ/);
  });
  it('特定項目の比率：Mekko のまま項目を強調。100%横棒は別案で、選んだ時だけメインチャートが替わる。Mekko に戻せる', () => {
    const { p, a, rec } = at('item_share');
    expect(rec.lead.controls?.highlight).toBe(AUTO_HIGHLIGHT);
    const bar = rec.alternatives.find((x) => main(x.recipe) === 'bar_100')!;
    const q = setPresentation(p, a.id, bar.recipe);
    expect(main(chosenRecipes(q)[0]!.recipe.id)).toBe('bar_100');
    expect(main(chosenRecipes(setPresentation(q, a.id, rec.lead.recipe))[0]!.recipe.id)).toBe('mekko');
    // 伝えたいことを替えたら、まず Mekko の案に戻る
    const r = setEmphasis(q, a.id, 'mix_shift');
    expect(main(chosenRecipes(r)[0]!.recipe.id)).toBe('mekko');
    expect(r.chart).toBe('mekko');
  });
  it('全体規模と構成：Mekko が向く（印）。別案は Mekko の別の形だけ', () => {
    const { rec } = at('size_and_mix');
    expect(rec.fits).toBe(true);
    expect(rec.alternatives.every((x) => main(x.recipe) === 'mekko')).toBe(true);
  });
});

describe('チャートから選ぶ（Mekko）：選んだ案が編集画面へ引き継がれる', async () => {
  const { planFromChart, setEmphasis } = await import('./plan');
  const { newProjectFromPlan, viewOf } = await import('../editor/project');
  const open = (e: 'mix_shift' | 'item_share') => {
    const p0 = planFromChart('mekko');
    return viewOf(newProjectFromPlan(setEmphasis(p0, p0.angles[0]!.id, e), 'ja')!, 0);
  };
  it('構成の変化：Mekko＋左の全体の構成＋区画の増減。特定項目の比率：Mekko で項目を強調（実際の項目名に決まる）', () => {
    const s = open('mix_shift');
    expect(s.chart).toBe('mekko');
    expect(s.recipe).toBe('MIX_MEKKO_SHIFT');
    expect(s.complements.delta_labels).toBe(true);
    const h = open('item_share');
    expect(h.chart).toBe('mekko');
    expect(h.dataset.cols).toContain(h.controls.highlight);
  });
});

describe('チャートから選ぶ：得意な伝えたいことから並べ、最初から選ぶ。「別案」と「おすすめの別案」を分ける', async () => {
  const { planFromChart, emphasisChoices, angleRecommendation, setEmphasis } = await import('./plan');
  it('得意な順に並び、先頭が最初から選ばれていて、② にすぐ案が出る', () => {
    const cases = { mekko: 'current_mix', share_pair: 'mix_shift', waterfall: 'bridge', variable_width: 'size_position', bubble: 'size_position', slope: 'trajectory', slope_pair: 'trajectory', rank_slope: 'balance', bar_100: 'current_mix', variance_bar: 'gap' } as const;
    for (const [chart, best] of Object.entries(cases)) {
      const p = planFromChart(chart as 'mekko');
      expect(emphasisChoices(p, p.angles[0]!)[0]).toBe(best);
      expect(p.angles[0]!.emphasis).toBe(best);
      expect(angleRecommendation(p, p.angles[0]!)).toBeTruthy();
    }
    const w = planFromChart('waterfall');
    expect(emphasisChoices(w, w.angles[0]!)).toEqual(['bridge', 'increase', 'decrease', 'posneg']);
  });
  it('向いていない伝えたいことは出さない（幅が変わる縦棒の相関・重点領域・象限）', () => {
    const p = planFromChart('variable_width');
    expect(emphasisChoices(p, p.angles[0]!)).toEqual(['size_position']);
  });
  it('選んだチャートが向いている時はただの別案、向いていない時は Coach のおすすめの別案', () => {
    const p = planFromChart('mekko');
    expect(angleRecommendation(p, p.angles[0]!)!.recommendAlt).toBe(false);
    const q = setEmphasis(p, p.angles[0]!.id, 'mix_shift');
    expect(angleRecommendation(q, q.angles[0]!)!.recommendAlt).toBe(true);
  });
});
