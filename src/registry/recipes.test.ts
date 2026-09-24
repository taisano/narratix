import { describe, expect, it } from 'vitest';
import {
  CHART_TYPE_IDS, ConsultationClassificationSchema, ConsultationResultSchema, RECIPE_IDS, RECIPE_SCORING, RecommendationStateSchema,
  activeRecipes, chartsForPurpose, consultationJsonSchema, primaryChart, rankRecipes, recipeAspects, recipeRemedies,
  recipeToViewSpec, recipesForChart, recipesForPurpose, registry, validateViewSpec, type RecipeId,
  standardComplements, lostWhenRemoved, recipeParts,
} from './index';

const R = registry.recipes;

describe('推薦レシピの登録', () => {
  it('キーと id が一致し、RECIPE_IDS と同じ', () => {
    expect(Object.keys(R).sort()).toEqual([...RECIPE_IDS].sort());
    for (const [k, v] of Object.entries(R)) expect(v.id).toBe(k);
  });

  it.each(RECIPE_IDS)('%s：説明文（日英）と ViewSpec が正しい', (id) => {
    const r = R[id];
    for (const t of [r.name, r.question, r.reason, r.strength, r.limitation]) expect(t.ja && t.en).toBeTruthy();
    expect(r.goals.length).toBeGreaterThan(0);
    const v = validateViewSpec(recipeToViewSpec(r, { datasetId: 'x', slideLocale: 'ja', title: 'T' }));
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.spec!.recipe).toEqual({ id, version: expect.any(String) });
    expect(() => primaryChart(r)).not.toThrow();
  });

  it.each(RECIPE_IDS)('%s：構成の種類とパネルが合っている', (id) => {
    const r = R[id];
    const tables = r.view.panels.filter((p) => p.kind === 'table').length;
    const charts = r.view.panels.filter((p) => p.kind === 'chart').length;
    const expected = tables ? 'CHART_TABLE' : charts > 1 ? 'TWO_CHARTS' : 'SINGLE_CHART';
    expect(r.composition).toBe(expected);
  });

  it('推移・比較・構成のチャートには、チャート1つだけのレシピが必ずある', () => {
    for (const p of ['trend', 'comparison', 'composition'] as const) {
      for (const c of chartsForPurpose(p)) {
        const singles = recipesForChart(c.id).filter((r) => r.composition === 'SINGLE_CHART');
        expect(singles.length, `${c.id} に単品のレシピがない`).toBeGreaterThan(0);
      }
    }
  });

  it('ViewSpec はレシピの定義を書き換えない（コピーを返す）', () => {
    const v = recipeToViewSpec(R.TREND_CAGR_TABLE, { datasetId: 'x', slideLocale: 'ja', title: 'T' });
    v.panels[0]!.chart = 'bar_rank';
    expect(R.TREND_CAGR_TABLE.view.panels[0]!.chart).toBe('line');
  });
});

describe('入り口ごとの絞り込み', () => {
  it('目的から：主な目的が一致するものが先', () => {
    const trend = recipesForPurpose('trend');
    expect(trend[0]!.id).toBe('TREND_LINE');
    const firstSub = trend.findIndex((r) => r.goals[0] !== 'trend');
    expect(trend.slice(firstSub).every((r) => r.goals[0] !== 'trend')).toBe(true);
    expect(trend.map((r) => r.id)).toEqual(expect.arrayContaining(['TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'START_END_CAGR']));
  });
  it('チャートから：単品が先、次にそのチャートを使う組み合わせ', () => {
    expect(recipesForChart('line').map((r) => r.id)).toEqual(['TREND_LINE', 'TREND_LINE_AVG', 'TREND_CAGR_TABLE']);
    expect(recipesForChart('stacked_column').map((r) => r.id)).toEqual(['TREND_STACKED', 'SIZE_MIX_CAGR']);
  });
});

describe('見せられること・見えにくいことと、その案内', () => {
  it('チャート・補完パーツ・表の定義から組み立てる', () => {
    const a = recipeAspects(R.TREND_CAGR_TABLE);
    expect(a.shows).toEqual(expect.arrayContaining(['trend', 'growth']));
    expect(a.cannotShow).toContain('size');
    expect(a.cannotShow).not.toContain('growth');
  });
  it('補えるなら補完パーツ、補えないなら別のレシピ', () => {
    const line = recipeRemedies(R.TREND_LINE);
    expect(line.find((x) => x.aspect === 'growth')).toEqual({ aspect: 'growth', complement: 'cagr_note' });
    const mix = line.find((x) => x.aspect === 'mix')!;
    expect(mix.complement).toBeUndefined();
    expect(mix.recipe && recipeAspects(R[mix.recipe]).shows).toContain('mix');
  });
  it('使えるものだけに絞れる', () => {
    const r = recipeRemedies(R.TREND_LINE, { complement: () => false, recipe: (id) => id === 'TREND_CAGR_TABLE' });
    expect(r.find((x) => x.aspect === 'growth')).toEqual({ aspect: 'growth', recipe: 'TREND_CAGR_TABLE' });
  });
});

describe('相談から入った時の並べ方', () => {
  const example = ConsultationResultSchema.parse({
    consultation_summary: '海外5地域の売上成長を経営会議で説明したい',
    interpreted_question: '継続的な成長、成長率、規模の違いをどう伝えるか',
    classification: {
      primary_goal: 'TREND', audience: 'EXECUTIVE_MEETING', time_scope: '2021-2025', comparison_dimension: 'REGION', measure: 'SALES',
      needs_exact_values: true, needs_size_context: true, needs_rate_context: true,
    },
    recommendations: [
      { recipe_id: 'TREND_CAGR_TABLE', rank: 1, reason_codes: ['TIME_SERIES', 'RATE_REQUIRED', 'EXECUTIVE_USE'] },
      { recipe_id: 'SIZE_MIX_CAGR', rank: 2, reason_codes: ['SIZE_REQUIRED', 'MIX_CHANGE', 'RATE_REQUIRED'] },
      { recipe_id: 'START_END_CAGR', rank: 3, reason_codes: ['START_END_COMPARISON', 'IMPACT', 'RATE_REQUIRED'] },
    ],
  });

  it('指示書の例（海外5地域・経営会議）は、指示書と同じ3案・同じ順になる', () => {
    const ranked = rankRecipes(example.classification);
    expect(ranked.map((x) => x.recipe.id)).toEqual(['TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'START_END_CAGR']);
    expect(ranked[0]!.reasons).toEqual(expect.arrayContaining(['GOAL_MATCH', 'TIME_SERIES', 'RATE_REQUIRED', 'EXECUTIVE_USE']));
  });

  it('最大3案・同じメインのチャートは1つまで・基準点未満は出さない', () => {
    const goals = ['TREND', 'COMPARISON', 'COMPOSITION'] as const;
    for (const g of goals) {
      for (const t of ['2021-2025', null]) {
        const c = ConsultationClassificationSchema.parse({ primary_goal: g, time_scope: t });
        const ranked = rankRecipes(c);
        expect(ranked.length).toBeLessThanOrEqual(RECIPE_SCORING.max);
        expect(new Set(ranked.map((x) => primaryChart(x.recipe))).size).toBe(ranked.length);
        for (const x of ranked) expect(x.score).toBeGreaterThanOrEqual(RECIPE_SCORING.minScore);
        expect(ranked[0]!.recipe.goals).toContain({ TREND: 'trend', COMPARISON: 'comparison', COMPOSITION: 'composition' }[g]);
      }
    }
  });

  it('期間が分からない相談では、年が必要なレシピを上に出さない', () => {
    const c = ConsultationClassificationSchema.parse({ primary_goal: 'TREND', time_scope: null, needs_rate_context: true });
    const top = rankRecipes(c)[0]!;
    expect(top.recipe.requirements.timeAxis).toBeFalsy();
  });

  it('候補を絞れる（描けるものだけ など）', () => {
    const only: RecipeId[] = ['TREND_LINE', 'COMP_RANK'];
    const ranked = rankRecipes(example.classification, activeRecipes().filter((r) => only.includes(r.id)));
    expect(ranked.map((x) => x.recipe.id)).toEqual(['TREND_LINE']);
  });

  it('不明な項目は unknown / null のまま（既定値）', () => {
    const c = ConsultationClassificationSchema.parse({ primary_goal: 'TREND' });
    expect(c).toMatchObject({ audience: 'UNKNOWN', time_scope: null, needs_exact_values: 'unknown', decision_context: null });
  });

  it('AI に渡す JSON Schema と、保存する推薦の状態', () => {
    const js = consultationJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['classification', 'recommendations']));
    expect(() => ConsultationResultSchema.parse({ ...example, recommendations: [{ recipe_id: 'NOT_A_RECIPE', rank: 1 }] })).toThrow();
    const st = RecommendationStateSchema.parse({
      entry_mode: 'CONSULTATION', consultation_text: '…', consultation_classification: example.classification,
      recommended_recipe_ids: ['TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'START_END_CAGR'], selected_recipe_ids: ['TREND_CAGR_TABLE'],
      recommendation_version: '2026-09-24', ai_used_after_data_input: false,
    });
    expect(st.selected_recipe_ids).toEqual(['TREND_CAGR_TABLE']);
    expect(() => RecommendationStateSchema.parse({ ...st, ai_used_after_data_input: true })).toThrow();
  });
});

describe('参照の整合', () => {
  it('レシピが使うチャートはすべてレジストリにある', () => {
    for (const r of activeRecipes()) for (const p of r.view.panels) if (p.chart) expect(CHART_TYPE_IDS).toContain(p.chart);
  });
});

describe('標準構成と任意補完', () => {
  it.each(RECIPE_IDS)('%s：任意補完はメインのチャートに付けられ、標準構成と重ならない', (id) => {
    const r = R[id];
    const chart = primaryChart(r);
    const std = standardComplements(r);
    for (const o of r.optional ?? []) {
      expect(registry.complements[o.complement].appliesTo, `${o.complement} → ${chart}`).toContain(chart);
      expect(std).not.toContain(o.complement);
      expect(o.reason.ja && o.reason.en).toBeTruthy();
    }
    for (const a of r.advice ?? []) expect(a.ja && a.en).toBeTruthy();
  });
  it('標準構成：チャートの中の部品と、Mekko の揃えた表', () => {
    expect(standardComplements(R.TREND_LINE_AVG)).toEqual(['reference_line']);
    expect(standardComplements(R.TREND_LINE)).toEqual([]);
    expect(standardComplements(R.MIX_MEKKO_GROWTH)).toEqual(['aligned_table']);
  });
  it('外すと見えにくくなること', () => {
    expect(lostWhenRemoved(R.TREND_LINE_AVG, 'reference_line')).toEqual(['benchmark']);
    expect(lostWhenRemoved(R.START_END_CAGR, 'cagr_note')).toEqual(['growth']);
  });
  it('構成の短い名前', () => {
    const ja = (x: { en: string; ja?: string }) => x.ja ?? x.en;
    expect(recipeParts(R.TREND_CAGR_TABLE, ja)).toBe('折れ線＋CAGR表');
    expect(recipeParts(R.TREND_LINE_AVG, ja)).toBe('折れ線＋参照線');
  });
});
