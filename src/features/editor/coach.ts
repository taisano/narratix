import { planCoverage, recipesForChart, registry, type AspectId, type ComplementId, type CoverageItem, type LocalizedText, type RecipeDef, type RecipeId } from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { recipeRenderable } from '@/engine/recipes';
import { viewOf, type ProjectState } from './project';
import { activeComplements, isComplementOn, type BuilderState } from './state';

/** スライドの案（レシピ）。レシピから作っていなければ、そのチャートの単品レシピ */
export function slideRecipe(s: BuilderState): RecipeDef | null {
  if (s.recipe) return registry.recipes[s.recipe];
  return recipesForChart(s.chart).find((r) => r.composition === 'SINGLE_CHART') ?? null;
}

export interface EditorCoach {
  /** 今のスライドに足せる補完パーツ（まだオンにしていないもの）。reason はレシピに書いた理由 */
  complements: { id: ComplementId; aspect?: AspectId; reason?: LocalizedText }[];
  /** どのスライドでも見せられないことと、もう1枚として足せる案 */
  recipes: { aspect: AspectId; recipe: RecipeId }[];
}

/**
 * 編集画面の「補完アドバイス」：プロジェクトの全スライドの組み合わせで判断する（1枚だけで判断しない）。
 * 手で書いた定型文ではなく、見せられること・見えにくいことの定義から作る
 */
export function editorCoach(p: ProjectState): EditorCoach {
  const views = p.slides.map((_, i) => viewOf(p, i));
  const cur = views[p.current]!;
  const r = slideRecipe(cur);
  if (!r) return { complements: [], recipes: [] };
  const items: CoverageItem[] = views.flatMap((v) => { const x = slideRecipe(v); return x ? [{ recipe: x, complements: activeComplements(v, 'in_chart') }] : []; });
  const cov = planCoverage(items, {
    complement: (id, chart) => (IMPLEMENTED_COMPLEMENTS[chart] ?? []).includes(id),
    recipe: (id) => recipeRenderable(registry.recipes[id]),
  });
  const impl = IMPLEMENTED_COMPLEMENTS[cur.chart] ?? [];
  const complements: EditorCoach['complements'] = [];
  // レシピに書いた「付けられる補完」（理由つき）を先に。オンにしていないものだけ
  for (const o of r.optional ?? []) {
    if (o.requiresFields?.length || !impl.includes(o.complement) || isComplementOn(cur, o.complement)) continue;
    // ほかのスライドですでに見せていることなら案内しない（例：2枚目の CAGR 表で成長率を見せている）
    const shown = new Set(cov.shows.map((x) => x.aspect));
    if (registry.complements[o.complement].covers.every((a) => shown.has(a))) continue;
    complements.push({ id: o.complement, reason: o.reason });
  }
  // 組み合わせで見えないことのうち、このスライドに補完を足せば補えるもの
  for (const g of cov.gaps) {
    if (g.complement && g.complement.on === r.id && !complements.some((c) => c.id === g.complement!.id) && !isComplementOn(cur, g.complement.id)) {
      complements.push({ id: g.complement.id, aspect: g.aspect });
    }
  }
  // 別の案の提案は1つまで（見えないことを全部並べると、ただの注意書きの山になるため）
  const recipes = cov.gaps.filter((g) => g.recipe && !g.complement).slice(0, 1).map((g) => ({ aspect: g.aspect, recipe: g.recipe! }));
  return { complements, recipes };
}
