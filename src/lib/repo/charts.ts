import type { SupabaseClient } from '@supabase/supabase-js';
import { toDataset } from '@/features/editor/state';
import { normalizeProject, validateProject, viewOf, type ProjectState } from '@/features/editor/project';

export interface ChartSummary {
  id: string;
  /** 一覧で見分けるための名前 */
  name: string;
  /** スライドのタイトル */
  title: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  /** 縮小プレビュー用の画面の状態（withUi のときだけ） */
  ui?: ProjectState;
}

export class RepoError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** 自分が保存したチャートの一覧（新しい順）。RLS により他人の行は返らない */
export async function listCharts(sb: SupabaseClient, opts: { withUi?: boolean } = {}): Promise<ChartSummary[]> {
  const cols = 'id, name, title, version, updated_at, created_at' + (opts.withUi ? ', ui' : '');
  const { data, error } = await sb.from('view_specs').select(cols).order('updated_at', { ascending: false });
  if (error) throw new RepoError('list_failed', error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const ui = opts.withUi ? normalizeProject(r.ui) : null;
    return {
    id: r.id as string,
    name: (r.name as string) ?? '',
    title: (r.title as string) ?? '',
    version: r.version as number,
    updatedAt: r.updated_at as string,
    createdAt: r.created_at as string,
    ...(ui ? { ui } : {}),
    };
  });
}

/** 保存したチャートを開く（画面の状態を返す） */
export async function loadChart(sb: SupabaseClient, id: string): Promise<{ state: ProjectState; version: number; name: string }> {
  const { data, error } = await sb.from('view_specs').select('ui, version, name').eq('id', id).single();
  if (error) throw new RepoError('load_failed', error.message);
  const state = normalizeProject(data.ui);
  if (!state) throw new RepoError('bad_ui_state', 'saved editor state is missing or from an unknown version');
  return { state, version: data.version, name: data.name ?? '' };
}

/**
 * 保存。レジストリで検証を通った ViewSpec だけを保存する。
 * id が null なら新規、あれば上書き（version が1つ進み、履歴が1行増える）。
 * name が null なら、新規ではスライドのタイトル、上書きでは今の名前のまま。
 */
export async function saveChart(sb: SupabaseClient, id: string | null, state: ProjectState, name: string | null = null): Promise<{ id: string; version: number }> {
  // 全スライドを検証する。DB の spec 列には1枚目の ViewSpec、ui 列にプロジェクト全体（全スライド）を入れる
  const v = validateProject(state);
  if (!v.ok) {
    const msg = v.results.flatMap((r, i) => r.issues.filter((x) => x.severity === 'error').map((x) => `#${i + 1} ${x.message}`)).join(' / ');
    throw new RepoError('invalid_spec', msg);
  }
  const first = viewOf(state, 0);
  const { data, error } = await sb.rpc('save_chart', {
    p_view_spec_id: id,
    p_name: name,
    p_title: first.title,
    p_dataset: toDataset(first),
    p_spec: v.results[0]!.spec,
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

/** 名前だけを変える（版は進めない） */
export async function renameChart(sb: SupabaseClient, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new RepoError('empty_name', 'name is empty');
  const { error } = await sb.from('view_specs').update({ name: trimmed }).eq('id', id);
  if (error) throw new RepoError('rename_failed', error.message);
}

/** 複製（別のチャートとして、版1から保存し直す） */
export async function duplicateChart(sb: SupabaseClient, id: string, name: string): Promise<{ id: string; version: number }> {
  const src = await loadChart(sb, id);
  return saveChart(sb, null, src.state, name);
}
