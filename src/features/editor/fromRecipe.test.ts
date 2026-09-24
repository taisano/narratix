import { describe, expect, it } from 'vitest';
import { registry } from '@/registry';
import { checkRecipeData, renderableRecipeIds } from '@/engine/recipes';
import { applyRecipe, isSampleData } from './fromRecipe';
import { evaluate } from './preview';
import { initialState, sampleFor, toDataset, toViewSpec } from './state';

const R = registry.recipes;

describe('選んだレシピをエディタの状態にする', () => {
  it('チャートとチャート内の補完パーツがレシピどおり', () => {
    const s = applyRecipe(initialState(), R.TREND_LINE_AVG);
    expect(s.chart).toBe('line');
    const main = toViewSpec(s).panels.find((p) => p.id === 'main')!;
    expect(main.inChartComplements?.map((c) => c.id)).toEqual(['reference_line']);
    // 見えにくいことから足した補完パーツもオン
    const t = applyRecipe(initialState(), R.TREND_LINE, ['cagr_note']);
    expect(toViewSpec(t).panels[0]!.inChartComplements?.map((c) => c.id)).toEqual(['cagr_note']);
  });

  it('サンプルのままなら、レシピに合うサンプルに替える。入れたデータはそのまま', () => {
    const s = applyRecipe(initialState(), R.TREND_LINE);
    expect(s.dataset).toEqual(sampleFor('trend').dataset);
    expect(isSampleData(s)).toBe(true);
    const mine = { ...initialState(), dataset: { ...initialState().dataset, rows: ['A', 'B', 'C', 'D', 'E'] } };
    expect(applyRecipe(mine, R.TREND_LINE).dataset.rows).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('Mekko：全体の構成と成長率表の有無', () => {
    const plain = applyRecipe(applyRecipe(initialState(), R.TREND_LINE), R.MIX_MEKKO);
    expect(plain.dataset).toEqual(sampleFor('composition').dataset);
    expect(toViewSpec(plain).panels.map((p) => p.id)).toEqual(['main']);
    const growth = applyRecipe(initialState(), R.MIX_MEKKO_GROWTH);
    expect(toViewSpec(growth).panels.map((p) => p.id)).toEqual(['total', 'main', 'growth']);
  });

  it.each(renderableRecipeIds())('%s：描けるレシピはサンプルで1枚になる', (id) => {
    const r = R[id];
    const s = applyRecipe(initialState(), r);
    expect(checkRecipeData(r, toDataset(s)).ok).toBe(true);
    const res = evaluate(s);
    expect(res.error).toBeUndefined();
    expect(res.scene).toBeTruthy();
  });
});
