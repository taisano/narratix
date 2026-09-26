import type { SupabaseClient } from '@supabase/supabase-js';
import { toDataset } from '@/features/editor/state';
import { normalizeProject, validateProject, viewOf, type ProjectState } from '@/features/editor/project';
import { normalizeTags, withLangTag } from '@/lib/tags';

export interface ChartSummary {
  id: string;
  /** 一覧で見分けるための名前 */
  name: string;
  /** スライドのタイトル */
  title: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  /** タグ（先頭は言語のタグ） */
  tags: string[];
  /** 縮小プレビュー用の画面の状態（withUi のときだけ） */
  ui?: ProjectState;
}

const noTagsColumn = (e: { code?: string; message?: string }) => e.code === '42703' || /tags/.test(e.message ?? '');
/** 保存したタグ。無ければ（SQL を流す前・古い保存）スライドの言語から */
const tagsOf = (v: unknown, ui: ProjectState | null): string[] =>
  Array.isArray(v) && v.length ? normalizeTags(v as string[], 20) : ui ? withLangTag([], ui.slideLocale) : [];

export class RepoError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** 自分が保存したチャートの一覧（新しい順）。RLS により他人の行は返らない */
export async function listCharts(sb: SupabaseClient, opts: { withUi?: boolean } = {}): Promise<ChartSummary[]> {
  const cols = 'id, name, title, version, updated_at, created_at' + (opts.withUi ? ', ui' : '');
  let { data, error } = await sb.from('view_specs').select(cols + ', tags').order('updated_at', { ascending: false });
  // タグの列がまだ無い（SQL を流す前）時は、タグなしで読む
  if (error && noTagsColumn(error)) ({ data, error } = await sb.from('view_specs').select(cols).order('updated_at', { ascending: false }));
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
    tags: tagsOf(r.tags, ui),
    ...(ui ? { ui } : {}),
    };
  });
}

/** 保存したチャートを開く（画面の状態を返す） */
export async function loadChart(sb: SupabaseClient, id: string): Promise<{ state: ProjectState; version: number; name: string; tags: string[] }> {
  let { data, error } = await sb.from('view_specs').select('ui, version, name, tags').eq('id', id).single();
  if (error && noTagsColumn(error)) ({ data, error } = await sb.from('view_specs').select('ui, version, name').eq('id', id).single());
  if (error || !data) throw new RepoError('load_failed', error?.message ?? 'not found');
  const row = data as { ui: unknown; version: number; name: string | null; tags?: unknown };
  const state = normalizeProject(row.ui);
  if (!state) throw new RepoError('bad_ui_state', 'saved editor state is missing or from an unknown version');
  return { state, version: row.version, name: row.name ?? '', tags: tagsOf(row.tags, state) };
}

/**
 * タグを付け直す（版は進めない）。先頭にスライドの言語のタグを自動で付ける。
 * タグの列がまだ無い（SQL を流す前）時は何もしない
 */
export async function setChartTags(sb: SupabaseClient, id: string, tags: readonly string[], state: ProjectState): Promise<string[]> {
  const next = withLangTag(tags, state.slideLocale);
  const { error } = await sb.from('view_specs').update({ tags: next }).eq('id', id);
  if (error && !noTagsColumn(error)) throw new RepoError('tags_failed', error.message);
  return next;
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
  const r = await saveChart(sb, null, src.state, name);
  await setChartTags(sb, r.id, src.tags, src.state);
  return r;
}
