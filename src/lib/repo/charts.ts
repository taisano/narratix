import type { SupabaseClient } from '@supabase/supabase-js';
import { validateProject, viewOf, type ProjectState } from '@/features/editor/project';
import { hasSetTag, normalizeTags, SET_TAG, userTags, withLangTag } from '@/lib/tags';
import {
  deckTitle, deckVersionNumbers, listDeckRows, loadDeckProject, loadProjectsFromRows, parseStoredDeck,
  saveDeckProject, softDeleteDeck,
} from './decks';
export { RepoError } from './errors';
import { RepoError } from './errors';

export interface ChartSummary {
  id: string;
  name: string;
  title: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  tags: string[];
  /** スライドセット（マイチャートとは別に保存したもの） */
  isSet: boolean;
  ui?: ProjectState;
}

const tagsOf = (tags: string[], lang: 'ja' | 'en') => withLangTag(normalizeTags(tags, 20), lang);

export async function listCharts(sb: SupabaseClient, opts: { withUi?: boolean; /** 既定は 'chart'（スライドセットを除く） */ kind?: 'chart' | 'set' | 'all'; onProgress?: (list: ChartSummary[]) => void } = {}): Promise<ChartSummary[]> {
  const rows = await listDeckRows(sb, 'chart', true);
  const versions = await deckVersionNumbers(sb, rows);
  const uis = new Map<string, ProjectState>();
  const want = opts.kind ?? 'chart';
  const build = (): ChartSummary[] => rows.filter((row) => want === 'all' || hasSetTag(row.user_tags) === (want === 'set')).map((row) => {
    const body = parseStoredDeck(row.working);
    const ui = uis.get(row.id);
    return {
      id: row.id,
      name: row.name,
      title: body ? deckTitle(body) : '',
      version: row.current_version_id ? versions.get(row.current_version_id) ?? 0 : 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      tags: tagsOf(row.user_tags, row.lang),
      isSet: hasSetTag(row.user_tags),
      ...(ui ? { ui } : {}),
    };
  });
  if (!opts.withUi) return build();
  // 先にカードを出し、絵に要るデータ版・出典は16件ずつまとめて取って、取れた分から絵を足す
  opts.onProgress?.(build());
  const parts = Array.from({ length: Math.ceil(rows.length / 16) }, (_, k) => rows.slice(k * 16, k * 16 + 16));
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const part = parts[next++]!;
      try {
        for (const [id, ui] of await loadProjectsFromRows(sb, part)) uis.set(id, ui);
        opts.onProgress?.(build());
      } catch { /* この16件は絵なし */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, parts.length) }, worker));
  return build();
}

export async function loadChart(sb: SupabaseClient, id: string): Promise<{ state: ProjectState; version: number; name: string; tags: string[]; isSet: boolean }> {
  const { row, project } = await loadDeckProject(sb, id);
  if (row.kind !== 'chart') throw new RepoError('not_found', 'chart not found');
  const versions = await deckVersionNumbers(sb, [row]);
  return {
    state: project,
    version: row.current_version_id ? versions.get(row.current_version_id) ?? 0 : 0,
    name: row.name,
    tags: tagsOf(row.user_tags, row.lang),
    isSet: hasSetTag(row.user_tags),
  };
}

export async function chartVersion(sb: SupabaseClient, id: string): Promise<number> {
  const { row } = await loadDeckProject(sb, id);
  const versions = await deckVersionNumbers(sb, [row]);
  return row.current_version_id ? versions.get(row.current_version_id) ?? 0 : 0;
}

export async function setChartTags(sb: SupabaseClient, id: string, tags: readonly string[], state: ProjectState): Promise<string[]> {
  // スライドセットの印は、タグの編集で消さない
  const cur = await sb.from('decks').select('user_tags').eq('id', id).maybeSingle();
  const keep = hasSetTag((cur.data as { user_tags?: string[] } | null)?.user_tags) ? [SET_TAG] : [];
  const clean = [...normalizeTags(userTags(tags), 20), ...keep];
  const { error } = await sb.from('decks').update({ user_tags: clean, lang: state.slideLocale }).eq('id', id);
  if (error) throw new RepoError('tags_failed', error.message);
  return withLangTag(userTags(clean), state.slideLocale);
}

export async function saveChart(sb: SupabaseClient, id: string | null, state: ProjectState, name: string | null = null, opts: { asSet?: boolean } = {}): Promise<{ id: string; version: number }> {
  const v = validateProject(state);
  if (!v.ok) {
    const msg = v.results.flatMap((r, i) => r.issues.filter((x) => x.severity === 'error').map((x) => `#${i + 1} ${x.message}`)).join(' / ');
    throw new RepoError('invalid_spec', msg);
  }
  const saved = await saveDeckProject(sb, {
    id,
    kind: 'chart',
    name: name ?? (id ? null : viewOf(state, 0).title),
    project: state,
    ...(opts.asSet && !id ? { userTags: [SET_TAG] } : {}),
    createVersion: true,
    reason: 'save',
  });
  return { id: saved.id, version: saved.version };
}

export async function deleteChart(sb: SupabaseClient, id: string): Promise<void> {
  await softDeleteDeck(sb, id);
}

export async function renameChart(sb: SupabaseClient, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new RepoError('empty_name', 'name is empty');
  const { error } = await sb.from('decks').update({ name: trimmed.slice(0, 300) }).eq('id', id);
  if (error) throw new RepoError('rename_failed', error.message);
}

export async function duplicateChart(sb: SupabaseClient, id: string, name: string): Promise<{ id: string; version: number }> {
  const src = await loadChart(sb, id);
  const source = await loadDeckProject(sb, id);
  const saved = await saveDeckProject(sb, {
    id: null,
    kind: 'chart',
    name,
    project: src.state,
    userTags: [...userTags(src.tags), ...(src.isSet ? [SET_TAG] : [])],
    createVersion: true,
    reason: 'save',
    copiedFrom: { deckId: id, versionId: source.row.current_version_id },
  });
  return { id: saved.id, version: saved.version };
}
