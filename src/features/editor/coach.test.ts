import { describe, expect, it } from 'vitest';
import { planCoverage, registry } from '@/registry';
import { planFromPurposes, setEmphasis } from '../start/plan';
import {
  addAlternativeSlide, addSupplementSlide, dismissSupplement, editorCoach, replaceWithAlternative, slideAlternatives, slideSupplement,
} from './coach';
import { addRecipeSlide, fromBuilder, projectFromPlan, viewOf, withView } from './project';
import { setCell } from './edit';
import { applyRecipe } from './fromRecipe';
import { initialState } from './state';

const R = registry.recipes;

describe('選んだ案の組み合わせで判断する', () => {
  it('1案なら、その案で見えないこと。成長率つきの案も選べば、成長率は「見えない」から消える', () => {
    const one = planCoverage([{ recipe: R.TREND_LINE }]);
    expect(one.gaps.map((g) => g.aspect)).toContain('growth');
    const two = planCoverage([{ recipe: R.TREND_LINE }, { recipe: R.TREND_CAGR_TABLE }]);
    expect(two.gaps.map((g) => g.aspect)).not.toContain('growth');
    expect(two.shows.find((s) => s.aspect === 'growth')!.by).toEqual(['TREND_CAGR_TABLE']);
  });
  it('補完パーツを足した案は、その分も見せられる', () => {
    const c = planCoverage([{ recipe: R.TREND_LINE, complements: ['cagr_note'] }]);
    expect(c.gaps.map((g) => g.aspect)).not.toContain('growth');
  });
  it('補えないことは、まだ選んでいない案を1つ案内する（選んだ案は案内しない）', () => {
    const c = planCoverage([{ recipe: R.TREND_LINE }]);
    const mix = c.gaps.find((g) => g.aspect === 'mix')!;
    expect(mix.recipe).toBeDefined();
    const c2 = planCoverage([{ recipe: R.TREND_LINE }, { recipe: R[mix.recipe!] }]);
    expect(c2.gaps.map((g) => g.aspect)).not.toContain('mix');
  });
});

describe('編集画面の補完アドバイス（全スライドで判断）', () => {
  const lineProject = () => fromBuilder({ ...applyRecipe(initialState(), R.TREND_LINE), recipe: 'TREND_LINE' }, 'TREND_LINE');
  it('オンにしていない補完パーツを案内し、オンにすると消える', () => {
    const p = lineProject();
    expect(editorCoach(p).complements.map((c) => c.id)).toContain('cagr_note');
    const v = viewOf(p);
    const on = withView(p, 0, { ...v, complements: { ...v.complements, cagr_note: true } });
    expect(editorCoach(on).complements.map((c) => c.id)).not.toContain('cagr_note');
  });
});

describe('ほかのスライドで見せていることは案内しない', () => {
  it('2枚目に成長率の表があれば、1枚目に伸び率注記を勧めない', () => {
    const p = fromBuilder({ ...applyRecipe(initialState(), R.TREND_LINE), recipe: 'TREND_LINE' }, 'TREND_LINE');
    const two = addRecipeSlide(p, 'TREND_CAGR_TABLE');
    expect(editorCoach({ ...two, current: 0 }).complements.map((c) => c.id)).not.toContain('cagr_note');
  });
});

describe('データを入れた後：別の見せ方と補助スライド', () => {
  const growth = () => {
    let plan = planFromPurposes(['trend']);
    plan = setEmphasis(plan, plan.angles[0]!.id, 'growth_rate');
    const p = projectFromPlan(plan, initialState(), 'ja')!;
    // データを1つ書き換えておく（差し替えても残ること）
    return withView(p, 0, setCell(viewOf(p, 0), 'current', 0, 0, 777));
  };
  it('② で決めたおすすめ1つだけがスライドになり、別の見せ方を2つ持つ', () => {
    const p = growth();
    expect(p.slides).toHaveLength(1);
    expect(p.slides[0]!.recipe).toBe('TREND_LINE');
    const alts = slideAlternatives(viewOf(p));
    expect(alts).toHaveLength(2);
    expect(alts.map((a) => a.recipe)).not.toContain('TREND_LINE');
  });
  it('差し替えるとスライドの枚数は同じ・データはそのまま・おすすめが替わる。元の案は別の見せ方に回る', () => {
    const p = growth();
    const alt = slideAlternatives(viewOf(p))[0]!;
    const r = replaceWithAlternative(p, alt);
    expect(r.slides).toHaveLength(1);
    expect(r.slides[0]!.recipe).toBe(alt.recipe);
    expect(viewOf(r).dataset.periods.current.values[0]![0]).toBe(777);
    expect(viewOf(r).title).toBe(R[alt.recipe].question.ja);
    expect(slideAlternatives(viewOf(r)).map((a) => a.recipe)).toContain('TREND_LINE');
  });
  it('書き換えた見出しは、差し替えても残る', () => {
    const p0 = growth();
    const p = withView(p0, 0, { ...viewOf(p0), title: '自分の見出し' });
    expect(viewOf(replaceWithAlternative(p, slideAlternatives(viewOf(p))[0]!)).title).toBe('自分の見出し');
  });
  it('補助スライドの提案は別の問い。別の見せ方と同じ案は出さない。追加で1枚増え、「今は追加しない」で消える', () => {
    const p = growth();
    const sup = slideSupplement(p)!;
    expect(sup).not.toBeNull();
    expect(R[sup.recipe].goals[0]).not.toBe('trend');
    expect(slideAlternatives(viewOf(p)).map((a) => a.recipe)).not.toContain(sup.recipe);
    const added = addSupplementSlide(p, sup.recipe);
    expect(added.slides).toHaveLength(2);
    expect(added.slides[1]!.recipe).toBe(sup.recipe);
    expect(slideSupplement(dismissSupplement(p, sup.recipe))?.recipe).not.toBe(sup.recipe);
  });
  it('別の見せ方を補助スライドとして足すと1枚増え、元のスライドの別の見せ方からは消える', () => {
    const p = growth();
    const alt = slideAlternatives(viewOf(p))[0]!;
    const added = addAlternativeSlide(p, alt);
    expect(added.slides).toHaveLength(2);
    expect(added.slides[0]!.recipe).toBe('TREND_LINE');
    expect(added.slides[1]!.recipe).toBe(alt.recipe);
    expect(viewOf(added, 1).dataset.periods.current.values[0]![0]).toBe(777);
    expect(slideAlternatives(viewOf(added, 0)).map((a) => a.recipe)).not.toContain(alt.recipe);
  });
});
