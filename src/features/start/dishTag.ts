import { registry, type ChartTypeId, type PurposeId } from '@/registry';
import type { ProjectState, SlideState } from '../editor/project';
import { EMPHASES, type EmphasisId } from './coach';
import { DISHES, resolveCell } from './dishes';

/**
 * 見本（Library）の料理 ID（docs/dish-matrix.md 8章の5）。
 * 料理はスライドの Coach の重視点（`coach.emphasis`）として持つ。② から作ったスライドには最初から入っている。
 * 自分で作った見本には、管理者が公開・更新の時に付ける（推定を出す）。proof_needs は料理の表から引く（保存しない）
 */

export const DISH_IDS = Object.values(EMPHASES).flat() as EmphasisId[];
const isDish = (x: unknown): x is EmphasisId => typeof x === 'string' && (DISH_IDS as string[]).includes(x);

export const purposeOfDish = (d: EmphasisId): PurposeId =>
  (Object.keys(EMPHASES) as PurposeId[]).find((p) => (EMPHASES[p] as readonly string[]).includes(d))!;

/** スライドの料理（無ければ null） */
export const dishOfSlide = (s: Pick<SlideState, 'coach'>): EmphasisId | null => (isDish(s.coach?.emphasis) ? s.coach!.emphasis : null);

/** 見本に付いている料理（重なりなし、スライドの順） */
export function dishesOf(p: ProjectState | null | undefined): EmphasisId[] {
  const out: EmphasisId[] = [];
  for (const s of p?.slides ?? []) { const d = dishOfSlide(s); if (d && !out.includes(d)) out.push(d); }
  return out;
}

/**
 * 料理の推定：料理の表で、このチャート（材料）のおすすめがこのスライドのレシピになる料理。
 * 候補が複数なら、おすすめの設定（並び順・強調など）がスライドの設定と最も合うもの。推定できなければ null
 */
export function suggestDish(s: Pick<SlideState, 'recipe' | 'chart' | 'controls'>): EmphasisId | null {
  if (!s.recipe) return null;
  let best: EmphasisId | null = null, score = -Infinity;
  for (const d of DISH_IDS) {
    const cell = DISHES[d].materials?.[s.chart];
    if (!cell) continue;
    const lead = resolveCell(cell, {}).lead;
    if (lead.recipe !== s.recipe) continue;
    // 自動の強調（@…）は、スライドに強調があれば合っているとみなす
    // 合う設定は＋1、合わない設定は−1（例：相関係数の表示が無いスライドは「相関」になりにくい）
    const n = Object.entries(lead.controls ?? {}).reduce((acc, [k, v]) => {
      const have = (s.controls as Record<string, unknown>)[k];
      const hit = typeof v === 'string' && v.startsWith('@') ? have != null && have !== '' : have === v;
      return acc + (hit ? 1 : -1);
    }, 0);
    if (n > score) { score = n; best = d; }
  }
  return best;
}

/** スライドに料理を付ける（null で外す）。Coach の他の情報（別の見せ方）はそのまま */
export function setSlideDish(p: ProjectState, index: number, dish: EmphasisId | null): ProjectState {
  const slides = p.slides.map((s, i) => {
    if (i !== index) return s;
    if (!dish) return s.coach ? { ...s, coach: { ...s.coach, emphasis: null } } : s;
    return { ...s, coach: { ...(s.coach ?? { alternatives: [] }), purpose: purposeOfDish(dish), emphasis: dish } };
  });
  return { ...p, slides };
}

/** ② の「この料理の見本」：同じ料理・同じ材料（主役のチャート）のスライドを持つ見本 */
export function examplesFor<T extends { project: ProjectState }>(items: readonly T[], dish: EmphasisId, chart: ChartTypeId): T[] {
  return items.filter((x) => x.project.slides.some((s) => dishOfSlide(s) === dish && s.chart === chart));
}

/** レシピの主役のチャート */
export const mainChartOf = (recipe: keyof typeof registry.recipes): ChartTypeId | null =>
  registry.recipes[recipe]?.view.panels.find((x) => x.id === 'main')?.chart ?? null;
