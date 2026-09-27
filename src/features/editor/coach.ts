import { localize, planCoverage, primaryChart, recipesForChart, registry, type AspectId, type ComplementId, type CoverageItem, type LocalizedText, type RecipeDef, type RecipeId } from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { recipeRenderable } from '@/engine/recipes';
import { duplicateSlide, familyOf, viewOf, withView, type ProjectState } from './project';
import { applyRecipe } from './fromRecipe';
import { emphasisOfRecipe, recommend, supplementFor, type Proposal, type SlideCoach } from '../start/coach';
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

// ──────────── データ入力後：同じデータの別の見せ方・補助スライド（Coach 型。AI は使わない） ────────────

/** 今のスライドの案（差し替えた時に「元の案」として別案に戻せるように） */
export function currentProposal(v: BuilderState): Proposal | null {
  const r = slideRecipe(v);
  if (!r) return null;
  const complements = activeComplements(v, 'in_chart');
  return { recipe: r.id, ...(complements.length ? { complements } : {}) };
}

/** スライドの Coach の情報。無ければ（編集画面で作ったスライドなど）、今の案から規則で作る */
export function slideCoach(v: BuilderState): SlideCoach | null {
  if (v.coach) return v.coach;
  const r = slideRecipe(v);
  if (!r) return null;
  const purpose = r.goals[0]!;
  const emphasis = emphasisOfRecipe(r.id, purpose);
  const rec = emphasis ? recommend({ entryType: 'purpose', purpose, emphasis, audience: null, preferredChart: null, confidence: 1 }) : null;
  const alternatives = rec ? [rec.lead, ...rec.alternatives].filter((x) => x.recipe !== r.id).slice(0, 2) : [];
  return { purpose, emphasis, alternatives };
}

/** 別の見せ方（同じ問い・同じデータの形のもの。最大2つ） */
export function slideAlternatives(v: BuilderState): Proposal[] {
  const c = slideCoach(v);
  const fam = familyOf(v.chart);
  const cur = slideRecipe(v)?.id;
  return (c?.alternatives ?? []).filter((x) => x.recipe !== cur && familyOf(primaryChart(registry.recipes[x.recipe])) === fam).slice(0, 2);
}

/** 案を今のデータに当てる（プレビュー・差し替え用）。データ・タイトル・チャートタイトルの設定はそのまま */
export function applyProposal(v: BuilderState, pr: Proposal): BuilderState {
  const r = registry.recipes[pr.recipe];
  const next = applyRecipe({ ...v }, r, pr.complements ?? []);
  return { ...next, dataset: v.dataset, source: v.source, title: v.title, controls: { ...next.controls, ...(pr.controls ?? {}) }, recipe: r.id };
}

/** 見出しが前の案の「答える問い」のままなら、新しい案の問いに替える（書き換えた見出しは残す） */
function titleFor(v: BuilderState, pr: Proposal, locale: 'ja' | 'en'): string {
  const old = slideRecipe(v);
  return old && v.title === localize(old.question, locale) ? localize(registry.recipes[pr.recipe].question, locale) : v.title;
}

/**
 * 別の見せ方に差し替える（スライドは増えない。データはそのまま）。
 * 元の案は別の見せ方に回すので、もう一度差し替えれば戻せる
 */
export function replaceWithAlternative(p: ProjectState, pr: Proposal): ProjectState {
  const v = viewOf(p);
  const c = slideCoach(v);
  const before = currentProposal(v);
  const alternatives = [...(before ? [before] : []), ...(c?.alternatives ?? []).filter((x) => x.recipe !== pr.recipe && x.recipe !== before?.recipe)].slice(0, 2);
  const next: BuilderState = { ...applyProposal(v, pr), title: titleFor(v, pr, p.slideLocale), coach: { purpose: c?.purpose ?? registry.recipes[pr.recipe].goals[0]!, emphasis: c?.emphasis ?? null, alternatives, ...(c?.dismissed ? { dismissed: c.dismissed } : {}) } };
  const w = withView(p, p.current, next);
  return { ...w, slides: w.slides.map((s, i) => (i === w.current ? { ...s, recipe: pr.recipe } : s)) };
}

/** 補助スライドの提案（別の問い）。「今は追加しない」にしたもの・別の見せ方に出しているものは出さない */
export function slideSupplement(p: ProjectState): { recipe: RecipeId; aspect: AspectId } | null {
  const views = p.slides.map((_, i) => viewOf(p, i));
  const cur = views[p.current]!;
  const c = slideCoach(cur);
  if (!c) return null;
  const items = views.flatMap((v) => { const x = slideRecipe(v); return x ? [{ recipe: x, complements: activeComplements(v, 'in_chart') }] : []; });
  return supplementFor(items, c.purpose, [...slideAlternatives(cur).map((x) => x.recipe), ...(c.dismissed ?? [])]);
}

/** 補助スライドを「今は追加しない」にする（そのスライドでは出さない） */
export function dismissSupplement(p: ProjectState, recipe: RecipeId): ProjectState {
  const v = viewOf(p);
  const c = slideCoach(v);
  if (!c) return p;
  return withView(p, p.current, { ...v, coach: { ...c, dismissed: [...new Set([...(c.dismissed ?? []), recipe])] } });
}

/** 補助スライドとして追加（同じデータで後ろに1枚。そのスライドにも別の見せ方を持たせる） */
export function addSupplementSlide(p: ProjectState, recipe: RecipeId): ProjectState {
  const d = duplicateSlide(p);
  const v = viewOf(d, d.current);
  const r = registry.recipes[recipe];
  const purpose = r.goals[0]!;
  const emphasis = emphasisOfRecipe(recipe, purpose);
  const rec = emphasis ? recommend({ entryType: 'purpose', purpose, emphasis, audience: null, preferredChart: null, confidence: 1 }) : null;
  const next: BuilderState = { ...applyRecipe(v, r), title: localize(r.question, p.slideLocale),
    coach: { purpose, emphasis, alternatives: rec ? [rec.lead, ...rec.alternatives].filter((x) => x.recipe !== recipe).slice(0, 2) : [] } };
  const w = withView(d, d.current, next);
  return { ...w, slides: w.slides.map((s, i) => (i === w.current ? { ...s, recipe } : s)) };
}

/**
 * 別の見せ方を、補助スライドとして後ろに1枚足す（今のスライドはそのまま）。
 * 足した案は今のスライドの「別の見せ方」から外し、足したスライドでは元の案を別の見せ方にする
 */
export function addAlternativeSlide(p: ProjectState, pr: Proposal): ProjectState {
  const v0 = viewOf(p);
  const c = slideCoach(v0);
  const before = currentProposal(v0);
  const kept = withView(p, p.current, { ...v0, coach: c ? { ...c, alternatives: c.alternatives.filter((x) => x.recipe !== pr.recipe) } : undefined });
  const d = duplicateSlide(kept);
  const v = viewOf(d, d.current);
  const next: BuilderState = { ...applyProposal(v, pr), title: titleFor(v, pr, p.slideLocale),
    coach: { purpose: c?.purpose ?? registry.recipes[pr.recipe].goals[0]!, emphasis: c?.emphasis ?? null, alternatives: before ? [before] : [] } };
  const w = withView(d, d.current, next);
  return { ...w, slides: w.slides.map((s, i) => (i === w.current ? { ...s, recipe: pr.recipe } : s)) };
}
