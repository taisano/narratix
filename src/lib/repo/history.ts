import type { SupabaseClient } from '@supabase/supabase-js';
import { RECIPE_DB_VERSION, type ConsultationClassification, type RecipeId } from '@/registry';

/** 相談の履歴（マイページの「相談の履歴」）。☆なしは新しい100件だけ残る（DB の trigger） */
export interface HistoryItem {
  id: string;
  createdAt: string;
  text: string;
  classifier: 'ai' | 'rules';
  recommended: RecipeId[];
  starred: boolean;
  chartId: string | null;
}

export const HISTORY_LIMIT = 100;
const COLS = 'id, created_at, text, classifier, recommended_recipe_ids, starred, chart_id';

type Row = { id: string; created_at: string; text: string; classifier: 'ai' | 'rules'; recommended_recipe_ids: string[] | null; starred: boolean; chart_id: string | null };
const toItem = (r: Row): HistoryItem => ({
  id: r.id, createdAt: r.created_at, text: r.text, classifier: r.classifier,
  recommended: (r.recommended_recipe_ids ?? []) as RecipeId[], starred: r.starred, chartId: r.chart_id,
});

/** 相談を1件残す。残せなかった時（表がまだ無いなど）は null（相談そのものは続ける） */
export async function addHistory(sb: SupabaseClient, h: { text: string; classifier: 'ai' | 'rules'; classification: ConsultationClassification; recommended: RecipeId[] }): Promise<string | null> {
  const { data, error } = await sb.from('consultation_history').insert({
    text: h.text.slice(0, 4000), classifier: h.classifier, classification: h.classification,
    recommended_recipe_ids: h.recommended, recommendation_version: RECIPE_DB_VERSION,
  }).select('id').single();
  return error ? null : (data as { id: string }).id;
}

/** 新しい順。☆付きは100件を超えても出る */
export async function listHistory(sb: SupabaseClient): Promise<HistoryItem[]> {
  const { data, error } = await sb.from('consultation_history').select(COLS).order('created_at', { ascending: false }).limit(HISTORY_LIMIT + 500);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toItem);
}

export async function setStarred(sb: SupabaseClient, id: string, starred: boolean): Promise<void> {
  const { error } = await sb.from('consultation_history').update({ starred }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteHistory(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('consultation_history').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 相談から作ったチャートを保存した時に、履歴とつなぐ（まだつないでいない時だけ） */
export async function linkChart(sb: SupabaseClient, id: string, chartId: string): Promise<void> {
  await sb.from('consultation_history').update({ chart_id: chartId }).eq('id', id).is('chart_id', null);
}

/** 履歴の「この相談でもう一度」：相談の入り口に文を入れて開く（自動では相談しない） */
export const REUSE_KEY = 'chart-advisor:reuse-consultation';
