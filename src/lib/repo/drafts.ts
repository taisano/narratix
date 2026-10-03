import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectState } from '@/features/editor/project';
import { EMPTY_DOC, type DocRef } from '@/features/editor/storage';
import type { Draft } from '@/features/editor/drafts';
import { RepoError } from './errors';
import { listDeckRows, loadDeckProject, saveDeckProject, softDeleteDeck } from './decks';

export const REMOTE_DRAFT_LIMIT = 50;

const toDraft = async (sb: SupabaseClient, id: string): Promise<Draft | null> => {
  try {
    const { row, body, project } = await loadDeckProject(sb, id);
    if (row.kind !== 'chart' || row.current_version_id || !body.draft) return null;
    return {
      id: row.id,
      savedAt: Date.parse(row.updated_at),
      title: row.name,
      slides: project.slides.length,
      project,
      doc: { ...EMPTY_DOC, ...body.draft.doc },
    };
  } catch {
    return null;
  }
};

export async function listRemoteDrafts(sb: SupabaseClient): Promise<Draft[]> {
  const rows = (await listDeckRows(sb, 'chart', false)).slice(0, REMOTE_DRAFT_LIMIT);
  const drafts = await Promise.all(rows.map((x) => toDraft(sb, x.id)));
  return drafts.filter((x): x is Draft => !!x);
}

export async function getRemoteDraft(sb: SupabaseClient, id: string): Promise<Draft | null> {
  return toDraft(sb, id);
}

export async function putRemoteDraft(sb: SupabaseClient, d: { id: string | null; title: string; slides: number; project: ProjectState; doc: DocRef }): Promise<string> {
  const save = (id: string | null) => saveDeckProject(sb, {
    id,
    kind: 'chart' as const,
    name: d.title.slice(0, 300),
    project: d.project,
    draft: { doc: d.doc },
    createVersion: false,
  });
  try {
    return (await save(d.id)).id;
  } catch (error) {
    if (d.id && error instanceof RepoError && error.code === 'not_found') return (await save(null)).id;
    throw error;
  }
}

export async function deleteRemoteDraft(sb: SupabaseClient, id: string): Promise<void> {
  await softDeleteDeck(sb, id);
}
