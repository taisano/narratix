import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema } from './consultation';
import { analysisFromLegacy, ConsultationAnalysisV2Schema, legacyGoalFromAnalysis, topologyFromObservedData, type ConsultationAnalysisV2 } from './consultation-model';
import { PRESENTATION_CATALOG, rankPresentations } from './presentation-rules';

const classification = (primary_goal: 'TREND' | 'COMPARISON' | 'COMPOSITION' | 'CONTRIBUTION' | 'RELATIONSHIP' | 'EVALUATION', analysis: Partial<ConsultationAnalysisV2>) =>
  ConsultationClassificationSchema.parse({ primary_goal, expected_action: 'RECOMMEND', analysis_v2: ConsultationAnalysisV2Schema.parse(analysis) });

describe('5層分類から表を含む表現を決定する', () => {
  it('3カテゴリー×5価格帯×2時点のシェアと増減はMATRIX_DELTAが第一案で、折れ線を除外する', () => {
    const c = classification('COMPOSITION', {
      decision_job: 'MONITOR', business_questions: ['WHAT_HAPPENED', 'WHERE_HAPPENED'],
      analytical_relationships: ['TWO_POINT_CHANGE', 'MIX_CHANGE', 'CROSS_TAB'],
      dimensions: [
        { name: 'カテゴリー', role: 'CATEGORY', cardinality: 3, hierarchy: [] },
        { name: '価格帯', role: 'CATEGORY', cardinality: 5, hierarchy: [] },
        { name: '時期', role: 'TIME', cardinality: 2, hierarchy: [] },
      ],
      measures: [{ name: 'シェア', semantic: 'SHARE', unit: '%', additivity: 'NON_ADDITIVE' }],
      period_count: 2, share_basis: '各カテゴリー内の販売数量', exact_values: true,
      value_semantics: ['LEVEL', 'DELTA'], cell_count: 15,
    });
    const r = rankPresentations(c);
    expect(r.action).toBe('RECOMMEND');
    expect(r.candidates[0]?.id).toBe('MATRIX_DELTA_SHARE');
    expect(c.analysis_v2?.dimensions.filter((d) => d.role !== 'TIME').map((d) => d.name)).toEqual(['カテゴリー', '価格帯']);
    expect(r.excluded).toContain('TREND_LINE');
  });

  it('5価格帯の5年間のシェアは100%積み上げ。特定価格帯なら折れ線も許可する', () => {
    const base: Partial<ConsultationAnalysisV2> = {
      analytical_relationships: ['CHANGE_OVER_TIME', 'MIX_CHANGE'],
      dimensions: [{ name: '価格帯', role: 'CATEGORY', cardinality: 5, hierarchy: [] }],
      measures: [{ name: 'シェア', semantic: 'SHARE', unit: '%', additivity: 'NON_ADDITIVE' }],
      period_count: 5, share_basis: '市場全体', value_semantics: ['LEVEL'],
    };
    const all = rankPresentations(classification('COMPOSITION', base));
    expect(all.candidates[0]?.id).toBe('TREND_SHARE');
    expect(all.excluded).toContain('TREND_LINE');
    const focused = rankPresentations(classification('COMPOSITION', { ...base, focused_item_count: 1 }));
    expect(focused.candidates.map((x) => x.id)).toContain('TREND_LINE');
  });

  it('5ブランドの前年・今年のシェア増減は1次元の構成比較で、2次元マトリックスにしない', () => {
    const r = rankPresentations(classification('COMPOSITION', {
      analytical_relationships: ['TWO_POINT_CHANGE', 'MIX_CHANGE'],
      dimensions: [{ name: 'ブランド', role: 'CATEGORY', cardinality: 5, hierarchy: [] }],
      measures: [{ name: 'シェア', semantic: 'SHARE', unit: '%', additivity: 'NON_ADDITIVE' }],
      period_count: 2, share_basis: '市場全体', exact_values: true, value_semantics: ['LEVEL', 'DELTA'],
    }));
    expect(r.candidates.map((x) => x.id)).toEqual(['MIX_PAIR_SHARE', 'DELTA_TABLE']);
    expect(r.excluded).toContain('MATRIX_DELTA_SHARE');
  });

  it('地域×製品の利益率は足し上げず、クロス表またはヒートマップを選ぶ', () => {
    const r = rankPresentations(classification('COMPARISON', {
      analytical_relationships: ['MAGNITUDE', 'CROSS_TAB'],
      dimensions: [
        { name: '地域', role: 'GEOGRAPHY', cardinality: 6, hierarchy: [] },
        { name: '製品', role: 'CATEGORY', cardinality: 8, hierarchy: [] },
      ],
      measures: [{ name: '利益率', semantic: 'MARGIN', unit: '%', additivity: 'NON_ADDITIVE' }],
      exact_values: true, value_semantics: ['LEVEL'], cell_count: 48,
    }));
    expect(r.candidates.slice(0, 2).map((x) => x.id)).toEqual(['CROSSTAB_TABLE', 'HEATMAP_VALUE_TABLE']);
    expect(r.excluded).toEqual(expect.arrayContaining(['TREND_SHARE', 'MIX_PAIR_SHARE']));
  });

  it('店舗別売上の分布と外れ値はDISTRIBUTIONとして保持し、ランキングへ縮約しない', () => {
    const r = rankPresentations(classification('COMPARISON', {
      analytical_relationships: ['DISTRIBUTION'],
      dimensions: [{ name: '店舗', role: 'CATEGORY', cardinality: 120, hierarchy: [] }],
      measures: [{ name: '売上', semantic: 'VALUE', unit: '円', additivity: 'ADDITIVE' }],
      value_semantics: ['LEVEL'], cell_count: 120,
    }));
    expect(r.candidates.map((x) => x.id)).toEqual(['BOX_PLOT', 'HISTOGRAM', 'DOT_PLOT']);
    expect(r.candidates.every((x) => x.status === 'UNSUPPORTED')).toBe(true);
    expect(r.excluded).toContain('BAR_RANK');
  });

  it('3シナリオの売上予測と不確実性はActual/Forecastを分け、通常の過去推移線にしない', () => {
    const r = rankPresentations(classification('TREND', {
      decision_job: 'FORECAST_SCENARIO', business_questions: ['WHAT_NEXT', 'WHAT_RISKS'],
      analytical_relationships: ['SCENARIO', 'UNCERTAINTY'],
      dimensions: [{ name: 'シナリオ', role: 'SCENARIO', cardinality: 3, hierarchy: [] }],
      measures: [{ name: '売上予測', semantic: 'VALUE', unit: '円', additivity: 'ADDITIVE' }],
      data_stage: 'MIXED', value_semantics: ['LEVEL', 'UNCERTAINTY'],
    }));
    expect(r.candidates.map((x) => x.id)).toEqual(['SCENARIO_TABLE', 'FORECAST_RANGE', 'FAN_CHART']);
    expect(r.excluded).toContain('TREND_LINE');
    expect(r.criticalThinkingNotes).toContain('SEPARATE_ACTUAL_FORECAST_SCENARIO');
  });

  it('シェア分母が不明な時だけ、一問確認して推薦を止める', () => {
    const r = rankPresentations(classification('COMPOSITION', {
      analytical_relationships: ['TWO_POINT_CHANGE', 'MIX_CHANGE', 'CROSS_TAB'],
      dimensions: [
        { name: 'カテゴリー', role: 'CATEGORY', cardinality: 3, hierarchy: [] },
        { name: '価格帯', role: 'CATEGORY', cardinality: 5, hierarchy: [] },
      ],
      measures: [{ name: 'シェア', semantic: 'SHARE', unit: '%', additivity: 'NON_ADDITIVE' }],
      period_count: 2, exact_values: true, value_semantics: ['LEVEL', 'DELTA'],
    }));
    expect(r).toMatchObject({ action: 'CLARIFY', missingInfo: ['SHARE_BASIS'], candidates: [] });
  });
});

describe('互換性と実データでの再判定', () => {
  it('旧分類は新フィールド無しで読み、互換マッピングできる', () => {
    const old = ConsultationClassificationSchema.parse({ primary_goal: 'COMPARISON', time_mode: 'TWO_POINT', comparison_intent: 'DELTA' });
    expect(old.analysis_v2).toBeNull();
    const mapped = analysisFromLegacy(old);
    expect(mapped.analytical_relationships).toEqual(['DEVIATION']);
    expect(legacyGoalFromAnalysis(mapped, old.primary_goal)).toBe('COMPARISON');
  });

  it('データ入力後はcardinality、period_count、cell_count、missingnessを実測値で上書きする', () => {
    const observed = topologyFromObservedData({
      rowDimension: { name: '地域', role: 'GEOGRAPHY', values: ['東', '西', '東'] },
      columnDimension: { name: '製品', role: 'CATEGORY', values: ['A', 'B'] },
      periods: ['2025', '2026'], values: [[1, 2], [3, null], [4, 5]], dataStage: 'ACTUAL', dataGrain: '地域×製品×年',
    });
    expect(observed.dimensions.map((d) => d.cardinality)).toEqual([2, 2]);
    expect(observed).toMatchObject({ period_count: 2, cell_count: 6, missingness: 'PARTIAL' });
  });

  it('全候補がSUPPORTED / ALTERNATIVE / UNSUPPORTEDのいずれかを明示する', () => {
    expect(Object.values(PRESENTATION_CATALOG).every((x) => ['SUPPORTED', 'ALTERNATIVE', 'UNSUPPORTED'].includes(x.status))).toBe(true);
  });
});
