import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProject, type ProjectState } from '@/features/editor/project';
import { EMPTY_DOC, type DocRef } from '@/features/editor/storage';
import type { Draft } from '@/features/editor/drafts';

/** アカウントに残す下書き（chart_drafts）。docs/decisions.md「下書きをアカウントに残す」 */
export const REMOTE_DRAFT_LIMIT = 50;
const COLS = 'id, title, slides, project, doc, updated_at';

type Row = { id: string; title: string; slides: number; project: unknown; doc: Partial<DocRef> | null; updated_at: string };
const toDraft = (r: Row): Draft | null => {
  const project = normalizeProject(r.project);
  if (!project) return null;
  return { id: r.id, savedAt: Date.parse(r.updated_at), title: r.title, slides: r.slides, project, doc: { ...EMPTY_DOC, ...(r.doc ?? {}) } };
};

export async function listRemoteDrafts(sb: SupabaseClient): Promise<Draft[]> {
  const { data, error } = await sb.from('chart_drafts').select(COLS).order('updated_at', { ascending: false }).limit(REMOTE_DRAFT_LIMIT);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toDraft).filter((d): d is Draft => !!d);
}

export async function getRemoteDraft(sb: SupabaseClient, id: string): Promise<Draft | null> {
  const { data, error } = await sb.from('chart_drafts').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDraft(data as Row) : null;
}

/** 下書きを残す。id があれば置き換え、無ければ新しく足す。残した下書きの id を返す */
export async function putRemoteDraft(sb: SupabaseClient, d: { id: string | null; title: string; slides: number; project: ProjectState; doc: DocRef }): Promise<string> {
  const row = { title: d.title.slice(0, 300), slides: d.slides, project: d.project, doc: d.doc, chart_id: d.doc.id ?? null };
  if (d.id) {
    const { data, error } = await sb.from('chart_drafts').update(row).eq('id', d.id).select('id');
    if (error) throw new Error(error.message);
    if ((data as unknown[]).length) return d.id;
    // 別の端末で消されていた時は、新しく足す
  }
  const { data, error } = await sb.from('chart_drafts').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteRemoteDraft(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('chart_drafts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
