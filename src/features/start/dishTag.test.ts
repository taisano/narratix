import { describe, expect, it } from 'vitest';
import { registry, type ChartTypeId } from '@/registry';
import { applyRecipe, resolveAutoControls } from '../editor/fromRecipe';
import { initialProject, viewOf, slideOf, type ProjectState } from '../editor/project';
import { facetItem, facetOptions, matchesFacets, EMPTY_SELECTION } from '../shared/facets';
import { DISHES, resolveCell } from './dishes';
import { DISH_IDS, dishOfSlide, dishesOf, examplesFor, purposeOfDish, setSlideDish, suggestDish } from './dishTag';

const base = () => initialProject('ja');

/** 料理 × 材料のおすすめの通りに作ったスライド */
function slideFor(dish: (typeof DISH_IDS)[number], chart: ChartTypeId) {
  const lead = resolveCell(DISHES[dish].materials![chart]!, {}).lead;
  const r = registry.recipes[lead.recipe];
  const s0 = applyRecipe(viewOf(base(), 0), r, lead.complements ?? []);
  const s = resolveAutoControls({ ...s0, controls: { ...s0.controls, ...(lead.controls ?? {}) } });
  return { lead, slide: slideOf(s, 'x', r.id) };
}

describe('見本の料理 ID', () => {
  it('20品すべてに目的がある', () => {
    expect(DISH_IDS).toHaveLength(20);
    for (const d of DISH_IDS) expect(purposeOfDish(d)).toBeTruthy();
  });

  it('料理を付ける・外す（Coach の別の見せ方は残す）', () => {
    let p: ProjectState = base();
    expect(dishOfSlide(p.slides[0]!)).toBeNull();
    p = setSlideDish(p, 0, 'growth_driver');
    expect(p.slides[0]!.coach).toMatchObject({ purpose: 'trend', emphasis: 'growth_driver', alternatives: [] });
    expect(dishesOf(p)).toEqual(['growth_driver']);
    p = setSlideDish(p, 0, null);
    expect(dishOfSlide(p.slides[0]!)).toBeNull();
    expect(p.slides[0]!.coach?.alternatives).toEqual([]);
  });

  it('推定：おすすめ通りに作ったスライドは、同じおすすめになる料理に推定される', () => {
    for (const d of DISH_IDS) {
      for (const chart of Object.keys(DISHES[d].materials ?? {}) as ChartTypeId[]) {
        const { lead, slide } = slideFor(d, chart);
        if (lead.recipe && registry.recipes[lead.recipe].view.panels.find((x) => x.id === 'main')?.chart !== chart) continue;
        const g = suggestDish(slide);
        expect(g, `${d}×${chart}`).not.toBeNull();
        expect(resolveCell(DISHES[g!].materials![chart]!, {}).lead.recipe, `${d}×${chart}`).toBe(lead.recipe);
      }
    }
  });

  it('推定：レシピが無いスライドは推定しない', () => {
    expect(suggestDish({ ...base().slides[0]!, recipe: null })).toBeNull();
  });

  it('② の見本：同じ料理・同じチャートだけ', () => {
    const p = setSlideDish(base(), 0, 'trajectory');
    const chart = p.slides[0]!.chart;
    const items = [{ id: 'a', project: p }, { id: 'b', project: base() }];
    expect(examplesFor(items, 'trajectory', chart).map((x) => x.id)).toEqual(['a']);
    expect(examplesFor(items, 'growth_rate', chart)).toEqual([]);
    expect(examplesFor(items, 'trajectory', chart === 'line' ? 'slope' : 'line')).toEqual([]);
  });

  it('絞り込みに「伝えたいこと」', () => {
    const a = facetItem(setSlideDish(base(), 0, 'mix_change'), []);
    const b = facetItem(base(), []);
    expect(a.dishes).toEqual(['mix_change']);
    const opts = facetOptions([a, b], EMPTY_SELECTION, 'ja');
    expect(opts.dish).toEqual([{ value: 'mix_change', label: '内訳の移り変わり', count: 1 }]);
    expect(matchesFacets(a, { ...EMPTY_SELECTION, dish: ['mix_change'] })).toBe(true);
    expect(matchesFacets(b, { ...EMPTY_SELECTION, dish: ['mix_change'] })).toBe(false);
  });
});
