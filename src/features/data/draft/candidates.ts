import { registry, type RecipeId } from '@/registry';
import type { ColumnRoleMap } from './columnRoles';
import type { DraftShape } from './shape';

/**
 * 候補の生成と並び（固定の順番にしない）。理由コードで「なぜその順か」を返す。
 * 並べ方：形の既定の並び → 質問の言い回しに合う候補を先頭へ（question_fit）。件数が合わない候補は除き、理由を返す
 */
export type ReasonCode = 'default_for_shape' | 'short_items' | 'exact_values_asked' | 'question_fit' | 'compare_pair' | 'has_size';
export interface Candidate { recipe: RecipeId; reason: ReasonCode }
export interface Excluded { recipe: RecipeId; why: 'too_many_series' | 'too_few_rows' | 'not_additive' | 'no_size' }
export interface CandidateSet { candidates: Candidate[]; excluded: Excluded[]; /** 正確な値が主目的（表を上位にしたい。表は段階 1c） */ wantsExactTable: boolean }

const BASE: Partial<Record<DraftShape, RecipeId[]>> = {
  item_metric: ['COMP_RANK', 'COMP_COLUMN'],
  time_metric: ['TREND_LINE', 'TREND_COLUMN', 'TREND_STACKED'],
  // 実績と比較先（予算・前年など）：水準を並べて差を添える → 差だけ → 順位と増減
  item_compare: ['COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA'],
  // 2〜3 指標の関係（関係は同じ段階の最後）
  relation: ['REL_SCATTER', 'REL_BUBBLE'],
};
const EXACT = /いくら|正確|正しい数|具体的な数|一覧|数値を確認|exact|precise|exact values/i;
/** 項目名が短く少数（縦棒の名前が読める目安） */
const SHORT = { maxItems: 8, maxLen: 12 };

export interface DatasetFacts { rows: number; cols: number; unit?: string; itemNames?: string[]; /** 関係：大きさの列があるか */ hasSize?: boolean }

export function candidatesFor(shape: DraftShape, question: string, facts: DatasetFacts, _map?: Pick<ColumnRoleMap, 'assignments'>): CandidateSet {
  const q = question.toLowerCase();
  const excluded: Excluded[] = [];
  let list: Candidate[] = [];
  for (const id of BASE[shape] ?? []) {
    const r = registry.recipes[id].requirements;
    if (r.minRows != null && facts.rows < r.minRows) { excluded.push({ recipe: id, why: 'too_few_rows' }); continue; }
    if (id === 'REL_BUBBLE' && !facts.hasSize) { excluded.push({ recipe: id, why: 'no_size' }); continue; }
    if (r.maxSeries != null && facts.cols > r.maxSeries) { excluded.push({ recipe: id, why: 'too_many_series' }); continue; }
    // 積み上げは足して意味のある値だけ（% や率は足さない）
    if (id === 'TREND_STACKED' && (facts.cols < 2 || facts.unit === '%' || facts.unit === 'pp')) { excluded.push({ recipe: id, why: 'not_additive' }); continue; }
    list.push({ recipe: id, reason: shape === 'item_compare' && id === 'COMP_TWO_DELTA' ? 'compare_pair' : id === 'REL_BUBBLE' ? 'has_size' : 'default_for_shape' });
  }
  // 項目名が短く少数なら、縦棒が候補に入る理由
  if (shape === 'item_metric' && facts.itemNames && facts.itemNames.length <= SHORT.maxItems && facts.itemNames.every((n) => n.length <= SHORT.maxLen)) {
    list = list.map((c) => (c.recipe === 'COMP_COLUMN' ? { ...c, reason: 'short_items' as const } : c));
  }
  // 質問の言い回しに合う候補を先頭へ（レシピの keywords。同じ質問なら同じ結果）
  const fit = (id: RecipeId) => {
    const k = registry.recipes[id].keywords;
    return [...(k.ja ?? []), ...(k.en ?? [])].some((w) => w && q.includes(w.toLowerCase()));
  };
  const fits = list.filter((c) => fit(c.recipe));
  if (fits.length === 1 && list[0]!.recipe !== fits[0]!.recipe) {
    list = [{ ...fits[0]!, reason: 'question_fit' }, ...list.filter((c) => c.recipe !== fits[0]!.recipe)];
  }
  return { candidates: list, excluded, wantsExactTable: EXACT.test(question) };
}
