import type { SupabaseClient } from '@supabase/supabase-js';
import { validateProject, viewOf, type ProjectState } from '@/features/editor/project';
import { normalizeTags, userTags, withLangTag } from '@/lib/tags';
import {
  deckTitle, deckVersionNumbers, listDeckRows, loadDeckProject, parseStoredDeck,
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
  ui?: ProjectState;
}

const tagsOf = (tags: string[], lang: 'ja' | 'en') => withLangTag(normalizeTags(tags, 20), lang);

export async function listCharts(sb: SupabaseClient, opts: { withUi?: boolean } = {}): Promise<ChartSummary[]> {
  const rows = await listDeckRows(sb, 'chart', true);
  const versions = await deckVersionNumbers(sb, rows);
  return Promise.all(rows.map(async (row) => {
    const body = parseStoredDeck(row.working);
    const ui = opts.withUi ? (await loadDeckProject(sb, row.id)).project : undefined;
    return {
      id: row.id,
      name: row.name,
      title: body ? deckTitle(body) : '',
      version: row.current_version_id ? versions.get(row.current_version_id) ?? 0 : 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      tags: tagsOf(row.user_tags, row.lang),
      ...(ui ? { ui } : {}),
    };
  }));
}

export async function loadChart(sb: SupabaseClient, id: string): Promise<{ state: ProjectState; version: number; name: string; tags: string[] }> {
  const { row, project } = await loadDeckProject(sb, id);
  if (row.kind !== 'chart') throw new RepoError('not_found', 'chart not found');
  const versions = await deckVersionNumbers(sb, [row]);
  return {
    state: project,
    version: row.current_version_id ? versions.get(row.current_version_id) ?? 0 : 0,
    name: row.name,
    tags: tagsOf(row.user_tags, row.lang),
  };
}

export async function chartVersion(sb: SupabaseClient, id: string): Promise<number> {
  const { row } = await loadDeckProject(sb, id);
  const versions = await deckVersionNumbers(sb, [row]);
  return row.current_version_id ? versions.get(row.current_version_id) ?? 0 : 0;
}

export async function setChartTags(sb: SupabaseClient, id: string, tags: readonly string[], state: ProjectState): Promise<string[]> {
  const clean = normalizeTags(userTags(tags), 20);
  const { error } = await sb.from('decks').update({ user_tags: clean, lang: state.slideLocale }).eq('id', id);
  if (error) throw new RepoError('tags_failed', error.message);
  return withLangTag(clean, state.slideLocale);
}

export async function saveChart(sb: SupabaseClient, id: string | null, state: ProjectState, name: string | null = null): Promise<{ id: string; version: number }> {
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
    userTags: userTags(src.tags),
    createVersion: true,
    reason: 'save',
    copiedFrom: { deckId: id, versionId: source.row.current_version_id },
  });
  return { id: saved.id, version: saved.version };
}
