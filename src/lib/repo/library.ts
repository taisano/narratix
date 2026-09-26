import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProject, type ProjectState } from '@/features/editor/project';

/** Library（見本）の1件。project は複製して自分で作る時の元（保存したプロジェクトと同じ形） */
export interface LibraryItem {
  id: string;
  title: string;
  description: string;
  category: string;
  project: ProjectState;
  published: boolean;
  sort: number;
  updatedAt: string;
}

type Row = { id: string; title: string; description: string; category: string; project: unknown; published: boolean; sort: number; updated_at: string };
const COLS = 'id, title, description, category, project, published, sort, updated_at';
const toItem = (r: Row): LibraryItem | null => {
  const project = normalizeProject(r.project);
  return project ? { id: r.id, title: r.title, description: r.description, category: r.category, project, published: r.published, sort: r.sort, updatedAt: r.updated_at } : null;
};

/** 見本の一覧（登録前でも読める。管理者には非公開のものも出る） */
export async function listLibrary(sb: SupabaseClient): Promise<LibraryItem[]> {
  const { data, error } = await sb.from('library_items').select(COLS).order('sort').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toItem).filter((x): x is LibraryItem => !!x);
}

export async function getLibraryItem(sb: SupabaseClient, id: string): Promise<LibraryItem> {
  const { data, error } = await sb.from('library_items').select(COLS).eq('id', id).single();
  if (error) throw new Error(error.message);
  const item = toItem(data as Row);
  if (!item) throw new Error('invalid project');
  return item;
}

/** 見本として公開する（管理者だけ。相談の履歴への紐付けなど、その人だけのものは外す） */
export async function publishToLibrary(sb: SupabaseClient, v: { title: string; description: string; category: string; project: ProjectState }): Promise<string> {
  const { recommendation, ...rest } = v.project;
  const project: ProjectState = { ...rest, current: 0, ...(recommendation ? { recommendation: { ...recommendation, consultation_history_id: undefined } } : {}) };
  const { data, error } = await sb.from('library_items').insert({ title: v.title.trim(), description: v.description.trim(), category: v.category.trim(), project }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function setLibraryPublished(sb: SupabaseClient, id: string, published: boolean): Promise<void> {
  const { error } = await sb.from('library_items').update({ published, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLibraryItem(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('library_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 管理者か（Library に公開できるか） */
export async function isAdmin(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.rpc('is_admin');
  return !error && data === true;
}

/** 複製したプロジェクト：保存前の新しい作業として、1枚目から */
export const copyOfLibrary = (item: LibraryItem): ProjectState => ({ ...structuredClone(item.project), current: 0 });
