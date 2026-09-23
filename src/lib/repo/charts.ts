import type { SupabaseClient } from '@supabase/supabase-js';
import { isBuilderState, toDataset, validateState, type BuilderState } from '@/features/mekko-builder/state';

export interface ChartSummary {
  id: string;
  title: string;
  version: number;
  updatedAt: string;
}

export class RepoError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** 自分が保存したチャートの一覧（新しい順）。RLS により他人の行は返らない */
export async function listCharts(sb: SupabaseClient): Promise<ChartSummary[]> {
  const { data, error } = await sb.from('view_specs').select('id, title, version, updated_at').order('updated_at', { ascending: false });
  if (error) throw new RepoError('list_failed', error.message);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, version: r.version, updatedAt: r.updated_at }));
}

/** 保存したチャートを開く（画面の状態を返す） */
export async function loadChart(sb: SupabaseClient, id: string): Promise<{ state: BuilderState; version: number }> {
  const { data, error } = await sb.from('view_specs').select('ui, version').eq('id', id).single();
  if (error) throw new RepoError('load_failed', error.message);
  if (!isBuilderState(data.ui)) throw new RepoError('bad_ui_state', 'saved editor state is missing or from an unknown version');
  return { state: data.ui, version: data.version };
}

/**
 * 保存。レジストリで検証を通った ViewSpec だけを保存する。
 * id が null なら新規、あれば上書き（version が1つ進み、履歴が1行増える）。
 */
export async function saveChart(sb: SupabaseClient, id: string | null, state: BuilderState): Promise<{ id: string; version: number }> {
  const v = validateState(state);
  if (!v.ok) throw new RepoError('invalid_spec', v.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / '));
  const { data, error } = await sb.rpc('save_chart', {
    p_view_spec_id: id,
    p_title: state.title,
    p_dataset: toDataset(state),
    p_spec: v.spec,
    p_ui: state,
  });
  if (error) throw new RepoError('save_failed', error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { saved_id: string; saved_version: number } | undefined;
  if (!row) throw new RepoError('save_failed', 'no result');
  return { id: row.saved_id, version: row.saved_version };
}

/** 削除。データを消すと、それを使う ViewSpec と履歴も消える（外部キーの cascade） */
export async function deleteChart(sb: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await sb.from('view_specs').select('dataset_id').eq('id', id).single();
  if (error) throw new RepoError('delete_failed', error.message);
  const del = await sb.from('datasets').delete().eq('id', data.dataset_id);
  if (del.error) throw new RepoError('delete_failed', del.error.message);
}
