import { registry, type RecipeId } from '@/registry';
import type { ColumnRoleMap } from './columnRoles';
import type { DraftShape } from './shape';

/**
 * 候補の生成と並び（固定の順番にしない）。理由コードで「なぜその順か」を返す。
 * 並べ方：形の既定の並び → 質問の言い回しに合う候補を先頭へ（question_fit）。件数が合わない候補は除き、理由を返す
 */
export type ReasonCode = 'default_for_shape' | 'short_items' | 'exact_values_asked' | 'question_fit' | 'compare_pair' | 'has_size' | 'exact_table' | 'two_kinds' | 'heat_table' | 'kpi_latest' | 'multi_metric';
export interface Candidate { recipe: RecipeId; reason: ReasonCode }
export interface Excluded { recipe: RecipeId; why: 'too_many_series' | 'too_few_rows' | 'not_additive' | 'one_series' | 'no_size' }
export interface CandidateSet { candidates: Candidate[]; excluded: Excluded[]; /** 正確な値が主目的（表を先頭にした） */ wantsExactTable: boolean }

const BASE: Partial<Record<DraftShape, RecipeId[]>> = {
  item_metric: ['COMP_RANK', 'COMP_COLUMN'],
  time_metric: ['TREND_LINE', 'TREND_COLUMN', 'TREND_STACKED'],
  // 実績と比較先（予算・前年など）：水準を並べて差を添える → 差だけ → 順位と増減
  item_compare: ['COMP_TWO_DELTA', 'COMP_VARIANCE', 'COMP_RANK_DELTA'],
  // 2〜3 指標の関係（関係は同じ段階の最後）
  relation: ['REL_SCATTER', 'REL_BUBBLE', 'REL_QUADRANT'],
};
/** 規模（大きさ）も見たい言い方 */
const SCALE = /規模|大きさ|サイズ|ボリューム|スケール|\bscale\b|\bsize\b|bubble|バブル/i;
const EXACT = /いくら|正確|正しい数|具体的な数|一覧|数値を確認|exact|precise|exact values/i;
/** 項目名が短く少数（縦棒の名前が読める目安） */
const SHORT = { maxItems: 8, maxLen: 12 };

export interface DatasetFacts { rows: number; cols: number; unit?: string; itemNames?: string[]; /** 関係：大きさの列があるか */ hasSize?: boolean; /** 量と率のように、種類（単位）の違う指標が並ぶか */ mixedKinds?: boolean; /** 時系列：最新の値と前の期間の比較を KPI カードにできるか（行が期間で、指標が多すぎない） */ canKpi?: boolean }

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
    if (id === 'TREND_STACKED' && facts.cols < 2) { excluded.push({ recipe: id, why: 'one_series' }); continue; }
    if (id === 'TREND_STACKED' && (facts.unit === '%' || facts.unit === 'pp')) { excluded.push({ recipe: id, why: 'not_additive' }); continue; }
    list.push({ recipe: id, reason: shape === 'item_compare' && id === 'COMP_TWO_DELTA' ? 'compare_pair' : id === 'REL_BUBBLE' ? 'has_size' : 'default_for_shape' });
  }
  // 項目名が短く少数なら、縦棒が候補に入る理由
  if (shape === 'item_metric' && facts.itemNames && facts.itemNames.length <= SHORT.maxItems && facts.itemNames.every((n) => n.length <= SHORT.maxLen)) {
    list = list.map((c) => (c.recipe === 'COMP_COLUMN' ? { ...c, reason: 'short_items' as const } : c));
  }
  // 正確な数値を表で見る候補。項目ごとの形（大小・実績と比較先・関係）では、基本表は「exact_table」の形（全部の数値の列）が受け持つので、ここでは増減表だけ。
  // 時系列は、期間×系列の表がそのまま基本表になる
  // 量と率のように種類の違う指標が並ぶ表：1つの指標の棒では片方が見えないので、2軸の縦棒＋折れ線を先頭に
  if (shape === 'exact_table' && facts.mixedKinds && facts.rows >= 2) list.push({ recipe: 'COMP_COMBO', reason: 'two_kinds' });
  if (shape === 'item_compare' || shape === 'time_metric' || shape === 'exact_table') {
    for (const id of shape === 'item_compare' ? (['TABLE_DELTA'] as const) : (['TABLE_BASIC'] as const)) {
      const r = registry.recipes[id].requirements;
      if (r.minRows != null && facts.rows < r.minRows) { excluded.push({ recipe: id, why: 'too_few_rows' }); continue; }
      list.push({ recipe: id, reason: 'exact_table' });
    }
  }
  // 量と率の時系列：縦棒（量）＋折れ線（率）の2軸で1枚（専用の形 time_combo。量は1つ、率は全部）
  if (shape === 'time_combo' && facts.rows >= 2) list.push({ recipe: 'COMP_COMBO', reason: 'two_kinds' });
  // KPI カード：最新の値と前の期間の比較（行が期間の表）。単位の違う指標も全部並べるので、専用の形（time_kpi）で持つ
  if (shape === 'time_kpi' && facts.canKpi) list.push({ recipe: 'TABLE_KPI', reason: 'kpi_latest' });
  // 色の濃淡つきの表：行が3つ以上・数値の列が2つ以上の表（高低の位置を見つける）。列ごとに色をつけるので、単位の違う列があっても使える
  if ((shape === 'time_metric' || shape === 'exact_table') && facts.rows >= 3 && facts.cols >= 2) list.push({ recipe: 'TABLE_HEAT', reason: 'heat_table' });
  // 項目×複数指標（評価）：指標ごとの小さな棒。項目は3〜12、指標は2〜6
  if (shape === 'exact_table' && facts.rows >= 3 && facts.rows <= 12 && facts.cols >= 2 && facts.cols <= 6) list.push({ recipe: 'EVAL_SMALL_BARS', reason: 'multi_metric' });
  // 質問の言い回しに合う候補を先頭へ（レシピの keywords。同じ質問なら同じ結果）
  const fit = (id: RecipeId) => {
    const k = registry.recipes[id].keywords;
    return [...(k.ja ?? []), ...(k.en ?? [])].some((w) => w && q.includes(w.toLowerCase()));
  };
  const fits = list.filter((c) => fit(c.recipe));
  if (fits.length === 1 && list[0]!.recipe !== fits[0]!.recipe) {
    list = [{ ...fits[0]!, reason: 'question_fit' }, ...list.filter((c) => c.recipe !== fits[0]!.recipe)];
  }
  // 規模も聞かれた関係の相談は、大きさつきのバブルを先頭へ
  if (shape === 'relation' && SCALE.test(question) && list.some((c) => c.recipe === 'REL_BUBBLE')) {
    list = [{ recipe: 'REL_BUBBLE', reason: 'question_fit' }, ...list.filter((c) => c.recipe !== 'REL_BUBBLE')];
  }
  // 正確な値を聞かれた相談は、表を先頭へ（理由：exact_values_asked）
  const wantsExactTable = EXACT.test(question);
  if (wantsExactTable) {
    const isTable = (c: Candidate) => c.recipe === 'TABLE_BASIC' || c.recipe === 'TABLE_DELTA' || c.recipe === 'TABLE_HEAT';
    list = [...list.filter(isTable).map((c) => (c.recipe === 'TABLE_HEAT' ? c : { ...c, reason: 'exact_values_asked' as const })), ...list.filter((c) => !isTable(c))];
  }
  return { candidates: list, excluded, wantsExactTable };
}
