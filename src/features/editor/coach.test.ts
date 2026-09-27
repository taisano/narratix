import { describe, expect, it } from 'vitest';
import { planCoverage, registry } from '@/registry';
import { planFromPurposes, setFocus, toggleChosen, chosenRecipes } from '../start/plan';
import { editorCoach } from './coach';
import { addRecipeSlide, fromBuilder, viewOf, withView } from './project';
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

describe('② の右の欄：押した案の説明を出す', () => {
  it('「選択する」を押すと、その案が説明の対象になる', () => {
    let p = planFromPurposes(['trend']);
    const a = p.angles[0]!;
    const sub = a.items.find((i) => i.role === 'sub')!;
    p = setFocus(p, a.items[0]!.recipe);
    p = toggleChosen(p, a.id, sub.recipe);
    expect(p.focus).toBe(sub.recipe);
    expect(chosenRecipes(p).map((c) => c.recipe.id)).toContain(sub.recipe);
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
  it('見せられないことは別の案を1つだけ案内し、「スライドを追加」で足すと消える', () => {
    const p = lineProject();
    const recs = editorCoach(p).recipes;
    expect(recs).toHaveLength(1);
    const added = addRecipeSlide(p, recs[0]!.recipe);
    expect(added.slides).toHaveLength(2);
    expect(added.current).toBe(1);
    expect(added.slides[1]!.recipe).toBe(recs[0]!.recipe);
    expect(viewOf(added, 1).title).toBe(R[recs[0]!.recipe].question.ja);
    expect(editorCoach({ ...added, current: 0 }).recipes.map((r) => r.aspect)).not.toContain(recs[0]!.aspect);
  });
});

describe('ほかのスライドで見せていることは案内しない', () => {
  it('2枚目に成長率の表があれば、1枚目に伸び率注記を勧めない', () => {
    const p = fromBuilder({ ...applyRecipe(initialState(), R.TREND_LINE), recipe: 'TREND_LINE' }, 'TREND_LINE');
    const two = addRecipeSlide(p, 'TREND_CAGR_TABLE');
    expect(editorCoach({ ...two, current: 0 }).complements.map((c) => c.id)).not.toContain('cagr_note');
  });
});
