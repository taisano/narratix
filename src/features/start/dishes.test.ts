import { describe, expect, it } from 'vitest';
import { PROOF_NEED_IDS, registry, type ChartTypeId } from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import { EMPHASES, recommend, type CoachIntent, type EmphasisId } from './coach';
import { CHART_EMPHASES, DISHES, FEW_SERIES_MAX, resolveCell, type Conditions } from './dishes';
import { activeAnswers, answerAsk, angleRecommendation, chosenRecipes, clearAsk, planFromChart, planReady, setEmphasis } from './plan';

const TREND = EMPHASES.trend;
const main = (r: string) => registry.recipes[r as keyof typeof registry.recipes].view.panels.find((p) => p.id === 'main')!.chart;
const intent = (chart: ChartTypeId | null, emphasis: EmphasisId, conditions: Conditions = {}, extra: Partial<CoachIntent> = {}): CoachIntent =>
  ({ entryType: chart ? 'chart' : 'purpose', purpose: 'trend', emphasis, audience: null, preferredChart: chart, confidence: 1, conditions, ...extra });

describe('一品料理の表（料理 × 材料）', () => {
  it('料理は 20 品。proof_needs は共通語彙だけ、推移の4品は材料のマスを持つ', () => {
    expect(Object.keys(DISHES)).toHaveLength(20);
    for (const d of Object.values(DISHES)) for (const n of d.proofNeeds) expect(PROOF_NEED_IDS).toContain(n);
    for (const e of TREND) expect(Object.keys(DISHES[e].materials ?? {}).length).toBeGreaterThanOrEqual(5);
    // 寄与は CONTRIBUTION（因果の DRIVER ではない）。規模と構成は原子的な2つに分ける
    expect(DISHES.growth_driver.proofNeeds).toContain('CONTRIBUTION');
    expect(DISHES.size_and_mix.proofNeeds).toEqual(['SIZE_CONTEXT', 'CURRENT_MIX']);
  });

  it('マスが指すレシピはすべて描ける', () => {
    for (const e of [...TREND, ...EMPHASES.comparison, ...EMPHASES.composition]) for (const cell of Object.values(DISHES[e].materials ?? {})) {
      for (const p of [cell.plate, ...(cell.alts ?? []), ...cell.switchTo, ...(cell.variants ?? []).map((v) => v.plate)]) {
        expect(recipeRenderable(registry.recipes[p.recipe]), `${e}:${p.recipe}`).toBe(true);
      }
    }
  });

  it('100%積み上げから入ると、4つの料理で見た目が必ず変わる（確認に答えた後）', () => {
    const leads = TREND.map((e) => {
      const r = recommend(intent('stacked_100', e, { WITH_MIX_CHANGE: 'yes' }))!;
      return JSON.stringify(r.lead);
    });
    expect(new Set(leads).size).toBe(4);
  });

  it('変化の軌跡 × 100%積み上げ：選んだチャートを第一案にし、実額はおすすめの別案にする', () => {
    const r = recommend(intent('stacked_100', 'trajectory'))!;
    expect(r.fit).toBe('SWITCH_RECOMMENDED');
    expect(main(r.lead.recipe)).toBe('stacked_100');
    expect(r.switched).toBe(false);
    expect(r.recommendAlt).toBe(true);
    expect(r.alternatives.map((p) => main(p.recipe))).toContain('stacked_column');
  });

  it('伸びの速さ・成長の牽引役 × 100%積み上げ：未回答でも選んだチャートの案を出す', () => {
    for (const e of ['growth_rate', 'growth_driver'] as const) {
      const r = recommend(intent('stacked_100', e))!;
      expect(main(r.lead.recipe)).toBe('stacked_100');
      expect(r.ask).toBeUndefined();
    }
  });

  it('構成変化も見せる → 左右構成（2/3：1/3）。見せない → 全体の伸びが見える材料', () => {
    const yes = recommend(intent('stacked_100', 'growth_driver', { WITH_MIX_CHANGE: 'yes' }))!;
    expect(yes.lead.recipe).toBe('TREND_SHARE_DELTA');
    expect(registry.recipes.TREND_SHARE_DELTA.view.layout).toEqual({ id: 'p03_left_right', ratios: [0.67] });
    const no = recommend(intent('stacked_100', 'growth_driver', { WITH_MIX_CHANGE: 'no' }))!;
    expect(no.lead.recipe).toBe('TREND_SHARE');
    expect(no.note?.ja).toBeTruthy();
    const speed = recommend(intent('stacked_100', 'growth_rate', { WITH_MIX_CHANGE: 'yes' }))!;
    expect(speed.lead.recipe).toBe('TREND_SHARE_CAGR');
  });

  it('100%積み上げから増加額・CAGR を出すのは、絶対値のデータがある時だけ', () => {
    const r = recommend(intent('stacked_100', 'growth_rate', { WITH_MIX_CHANGE: 'yes', ABSOLUTE_BASE_AVAILABLE: 'no' }))!;
    expect(r.lead.recipe).toBe('TREND_SHARE');
    expect(r.switched).toBe(false);
    expect(r.note?.ja).toBeTruthy();
  });

  it('寄与は項目が全体を構成する時だけ（内訳でなければ寄与として出さない）', () => {
    const r = recommend(intent('stacked_column', 'growth_driver', { PARTS_FORM_WHOLE: 'no' }))!;
    expect(r.lead.recipe).not.toBe('TREND_STACKED_DELTA');
    const ok = recommend(intent('stacked_column', 'growth_driver'))!;
    expect(ok.lead.recipe).toBe('TREND_STACKED_DELTA');
  });

  it('積み上げ縦棒 × 伸びの速さ：同じチャートの2つの形をplatesに置く', () => {
    expect(FEW_SERIES_MAX).toBe(4);
    const few = recommend(intent('stacked_column', 'growth_rate', { FEW_SERIES: 'yes' }))!;
    expect(few.lead.recipe).toBe('TREND_STACKED_CAGR');
    expect(few.alternatives[0]).toMatchObject({ recipe: 'TREND_STACKED', complements: ['cagr_note'] });
    const many = recommend(intent('stacked_column', 'growth_rate', { FEW_SERIES: 'no' }))!;
    expect(many.lead.recipe).toBe('TREND_STACKED_CAGR');
  });

  it('折れ線とスロープは期間数で分ける', () => {
    const two = recommend(intent('line', 'trajectory', { PERIODS_3PLUS: 'no', PERIODS_2: 'yes' }))!;
    expect(main(two.lead.recipe)).toBe('line');
    expect(two.note?.ja).toMatch(/2つ/);
    expect(two.alternatives.map((x) => main(x.recipe))).toContain('slope');
    // チャートからスロープを選んだ時は、3時点以上でもスロープのまま（最初と最後を結ぶ。理由を出し、折れ線は別案）
    const many = recommend(intent('slope', 'trajectory', { PERIODS_2: 'no', PERIODS_3PLUS: 'yes' }))!;
    expect(main(many.lead.recipe)).toBe('slope');
    expect(many.note?.ja).toMatch(/最初と最後/);
    expect(many.alternatives.map((x) => main(x.recipe))).toContain('line');
    expect(main(recommend(intent('slope', 'trajectory', { PERIODS_2: 'yes' }))!.lead.recipe)).toBe('slope');
  });

  it('「構成比 × 伸びの速さ」を両方求められたら、中心の問いを一問だけ聞く（構成比→左右、市場→実額の積み上げ1つ）', () => {
    const both = { alsoNeeds: ['MIX_CHANGE', 'GROWTH_SPEED'] as ('MIX_CHANGE' | 'GROWTH_SPEED')[] };
    expect(recommend(intent(null, 'growth_rate', {}, both))!.ask).toBe('central');
    expect(recommend(intent(null, 'growth_rate', { WITH_MIX_CHANGE: 'yes' }, both))!.lead.recipe).toBe('TREND_SHARE_CAGR');
    const market = recommend(intent(null, 'growth_rate', { WITH_MIX_CHANGE: 'no' }, both))!;
    expect(market.lead).toMatchObject({ recipe: 'TREND_STACKED', complements: ['cagr_note'] });
    expect(registry.recipes[market.lead.recipe].view.panels).toHaveLength(1);
  });

  it('SWITCH_RECOMMENDED でも、選んだチャートの案は消さずに別案に残す', () => {
    const cell = DISHES.mix_change.materials!.line!;
    const r = resolveCell(cell, {});
    expect(r.fit).toBe('SWITCH_RECOMMENDED');
    expect(r.alternatives[0]).toMatchObject({ recipe: 'TREND_LINE', tag: 'kept' });
  });
});

describe('②の画面の流れ（チャートから入る）', () => {
  it('100%積み上げは確認を待たず、選んだチャートで始められる', () => {
    let plan = planFromChart('stacked_100');
    const a = plan.angles[0]!;
    plan = setEmphasis(plan, a.id, 'growth_driver');
    expect(planReady(plan)).toBe(true);
    expect(angleRecommendation(plan, plan.angles[0]!)!.lead.recipe).toBe('TREND_SHARE_DELTA');
    expect(chosenRecipes(plan)[0]!.recipe.id).toBe('TREND_SHARE_DELTA');
  });
  it('答えは切り口に残り、別の料理に変えても聞き直さない', () => {
    let plan = planFromChart('stacked_100');
    const id = plan.angles[0]!.id;
    plan = answerAsk(setEmphasis(plan, id, 'growth_driver'), id, 'with_mix', 'no');
    plan = setEmphasis(plan, id, 'growth_rate');
    const r = angleRecommendation(plan, plan.angles[0]!)!;
    expect(r.ask).toBeUndefined();
    expect(main(r.lead.recipe)).toBe('stacked_100');
  });
  it('効いている答えを見せ、取り消すともう一度聞く', () => {
    let plan = planFromChart('stacked_100');
    const id = plan.angles[0]!.id;
    plan = answerAsk(setEmphasis(plan, id, 'growth_rate'), id, 'with_mix', 'yes');
    expect(activeAnswers(plan, plan.angles[0]!)).toEqual([]);
    // 変化の軌跡では答えは効かない（聞かない料理）
    expect(activeAnswers(setEmphasis(plan, id, 'trajectory'), plan.angles[0]!)).toEqual([]);
    plan = clearAsk(plan, id, 'with_mix');
    expect(angleRecommendation(plan, plan.angles[0]!)!.ask).toBeUndefined();
  });
});

describe('比較の4品（docs/composition-review.md の B1・B2・B4）', () => {
  const cmp = (chart: ChartTypeId | null, emphasis: EmphasisId, conditions: Conditions = {}): CoachIntent =>
    ({ entryType: chart ? 'chart' : 'purpose', purpose: 'comparison', emphasis, audience: null, preferredChart: chart, confidence: 1, conditions });
  it('横棒ランキングから入ると、4つの料理で構成が変わる（順位／順位＋前回からの増減／平均線／2つの指標）', () => {
    const leads = EMPHASES.comparison.map((e) => recommend(cmp('bar_rank', e))!.lead.recipe);
    expect(leads).toEqual(['COMP_RANK', 'COMP_RANK_DELTA', 'COMP_RANK_AVG', 'COMP_RANK_METRIC2']);
    // 差の大きさが主な答えの時は、右の増減を左と同じ幅に
    expect(recommend(cmp('bar_rank', 'gap'))!.lead.controls).toMatchObject({ side_ratio: 'half' });
  });
  it('差の大きさ × 横棒ランキング：時点が1つなら順位の横棒だけ（前回が無い）', () => {
    const r = recommend(cmp('bar_rank', 'gap', { PERIODS_2PLUS: 'no' }))!;
    expect(r.lead.recipe).toBe('COMP_RANK');
    expect(r.switched).toBe(false);
  });
  it('順位 × 差分バー：選んだ差分バーを第一案にし、現在値の横棒ランキングは別案にする', () => {
    const r = recommend(cmp('variance_bar', 'ranking'))!;
    expect(r.fit).toBe('SWITCH_RECOMMENDED');
    expect(r.lead.recipe).toBe('COMP_VARIANCE');
    expect(r.switched).toBe(false);
    expect(r.alternatives.map((p) => p.recipe)).toContain('COMP_RANK');
  });
  it('2つの指標のバランス：質問から入っても、行をそろえた2指標比較が標準（指標間の順位スロープは別案）', () => {
    const r = recommend(cmp(null, 'balance'))!;
    expect(r.lead.recipe).toBe('COMP_RANK_METRIC2');
    expect(r.alternatives.map((p) => p.recipe)).toContain('COMP_RANK_SLOPE');
    expect(recommend(cmp('bar_rank', 'balance'))!.alternatives.map((p) => p.recipe)).toContain('COMP_RANK_SLOPE');
  });
  it('順位スロープから入ると、4つの料理すべてで順位スロープを第一案にする', () => {
    const leads = EMPHASES.comparison.map((e) => recommend(cmp('rank_slope', e))!.lead.recipe);
    expect(leads).toEqual(['COMP_RANK_SLOPE', 'COMP_RANK_SLOPE', 'COMP_RANK_SLOPE', 'COMP_RANK_SLOPE']);
    expect(EMPHASES.comparison.every((e) => recommend(cmp('rank_slope', e))!.switched === false)).toBe(true);
    expect(recommend(cmp('rank_slope', 'ranking'))!.fit).toBe('SWITCH_RECOMMENDED');
    expect(recommend(cmp('rank_slope', 'balance'))!.fit).toBe('DIRECT_FIT');
  });
  it('順位スロープの強調の初期値は、左右の指標で順位が最も動いた項目', async () => {
    const { proposalState } = await import('./dishView');
    const s = proposalState(recommend(cmp('rank_slope', 'balance'))!.lead, 'ja');
    expect(s.chart).toBe('rank_slope');
    expect(s.dataset.periods.base.values.some((r) => r.some((v) => v != null))).toBe(true);
    expect(typeof s.controls.highlight).toBe('string');
    expect(s.dataset.cols).toContain(s.controls.highlight);
    expect(String(s.controls.highlight).startsWith('@')).toBe(false);
  });
});

describe('構成の4品', () => {
  const mix = (chart: ChartTypeId | null, emphasis: EmphasisId, conditions: Conditions = {}): CoachIntent =>
    ({ entryType: chart ? 'chart' : 'purpose', purpose: 'composition', emphasis, audience: null, preferredChart: chart, confidence: 1, conditions });
  it('100%横棒から入ると、4つの料理すべてで100%横棒を第一案にし、Mekkoなどは別案にする', () => {
    const leads = EMPHASES.composition.map((e) => recommend(mix('bar_100', e))!.lead.recipe);
    expect(leads).toEqual(['MIX_SNAPSHOT', 'MIX_BAR100', 'MIX_SNAPSHOT', 'MIX_BAR100']);
    const size = recommend(mix('bar_100', 'size_and_mix'))!;
    expect(size.switched).toBe(false);
    expect(size.advice?.ja).toMatch(/規模/);
    expect(size.alternatives.map((x) => main(x.recipe))).toContain('mekko');
  });
  it('時点が1つなら、比率の動きではなくその時点の構成', () => {
    expect(recommend(mix('bar_100', 'mix_shift', { PERIODS_2PLUS: 'no' }))!.lead.recipe).toBe('MIX_SNAPSHOT');
  });
});

describe('構成：特定項目の比率は、動いた項目を初期の強調に', () => {
  it('100%横棒 × 特定項目の比率：構成比が最も動いた項目を強調（比率の動きとは強調で見分けられる）', async () => {
    const { proposalState } = await import('./dishView');
    const r = recommend({ entryType: 'chart', purpose: 'composition', emphasis: 'item_share', audience: null, preferredChart: 'bar_100', confidence: 1, conditions: {} })!;
    const s = proposalState(r.lead, 'ja');
    expect(typeof s.controls.highlight).toBe('string');
    expect(s.dataset.cols).toContain(s.controls.highlight);
    const shift = recommend({ entryType: 'chart', purpose: 'composition', emphasis: 'mix_shift', audience: null, preferredChart: 'bar_100', confidence: 1, conditions: {} })!;
    expect(proposalState(shift.lead, 'ja').controls.highlight).toBeUndefined();
  });
});

describe('全20品：どの材料から入っても、選ぶと見た目が変わる', () => {
  it('すべての料理が材料のマスを持つ', () => {
    for (const d of Object.values(DISHES)) expect(Object.keys(d.materials ?? {}).length, d.id).toBeGreaterThanOrEqual(3);
  });
  it('マスが指すレシピはすべて描ける（要因・関係も）', () => {
    for (const e of [...EMPHASES.contribution, ...EMPHASES.relationship]) for (const cell of Object.values(DISHES[e].materials ?? {})) {
      for (const p of [cell.plate, ...(cell.alts ?? []), ...cell.switchTo]) expect(recipeRenderable(registry.recipes[p.recipe]), `${e}:${p.recipe}`).toBe(true);
    }
  });
  it.each(['trend', 'comparison', 'composition', 'contribution', 'relationship'] as const)('%s：同じ材料でも、表示する料理すべてに描けるリードがある', (purpose) => {
    const dishes = EMPHASES[purpose] as readonly EmphasisId[];
    const materials = [...new Set(dishes.flatMap((e) => Object.keys(DISHES[e].materials ?? {})))] as ChartTypeId[];
    for (const chart of materials) {
      // チャートから入った時に ① に出さない（向いていない）伝えたいことは除く
      const shown = dishes.filter((e) => !CHART_EMPHASES[chart]?.hidden?.includes(e));
      const leads = shown.map((e) => JSON.stringify(recommend({ entryType: 'chart', purpose, emphasis: e, audience: null, preferredChart: chart, confidence: 1, conditions: { WITH_MIX_CHANGE: 'yes' } })!.lead));
      expect(leads).toHaveLength(shown.length);
      expect(leads.every(Boolean), `${purpose}×${chart}`).toBe(true);
    }
  });
});
