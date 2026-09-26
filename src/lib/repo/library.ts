import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProject, type ProjectState } from '@/features/editor/project';
import { normalizeTags, withLangTag } from '@/lib/tags';

/** Library（見本）の1件。project は複製して自分で作る時の元（保存したプロジェクトと同じ形） */
export interface LibraryItem {
  id: string;
  title: string;
  description: string;
  /** タグ（先頭は言語のタグ。前のカテゴリもタグに入る） */
  tags: string[];
  project: ProjectState;
  published: boolean;
  sort: number;
  updatedAt: string;
}

type Row = { id: string; title: string; description: string; category: string; tags?: string[] | null; project: unknown; published: boolean; sort: number; updated_at: string };
const COLS = 'id, title, description, category, tags, project, published, sort, updated_at';
/** タグの列がまだ無い（SQL を流す前）時の列 */
const COLS_OLD: string = 'id, title, description, category, project, published, sort, updated_at';
const noTagsColumn = (e: { code?: string; message?: string }) => e.code === '42703' || /tags/.test(e.message ?? '');
type Res = { data: unknown; error: { code?: string; message: string } | null };
/** タグの列で読めなければ、タグなしで読み直す */
async function withFallback(q: (cols: string) => PromiseLike<Res>): Promise<unknown> {
  let r = await q(COLS);
  if (r.error && noTagsColumn(r.error)) r = await q(COLS_OLD);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const toItem = (r: Row): LibraryItem | null => {
  const project = normalizeProject(r.project);
  if (!project) return null;
  // タグの列が空（SQL を流す前など）なら、言語とカテゴリから作る
  const tags = r.tags?.length ? normalizeTags(r.tags, 20) : withLangTag(r.category ? [r.category] : [], project.slideLocale);
  return { id: r.id, title: r.title, description: r.description, tags, project, published: r.published, sort: r.sort, updatedAt: r.updated_at };
};

/** 見本の一覧（登録前でも読める。管理者には非公開のものも出る） */
export async function listLibrary(sb: SupabaseClient): Promise<LibraryItem[]> {
  const data = await withFallback((cols) => sb.from('library_items').select(cols).order('sort').order('created_at', { ascending: false }));
  return (data as Row[]).map(toItem).filter((x): x is LibraryItem => !!x);
}

export async function getLibraryItem(sb: SupabaseClient, id: string): Promise<LibraryItem> {
  const data = await withFallback((cols) => sb.from('library_items').select(cols).eq('id', id).single());
  const item = toItem(data as Row);
  if (!item) throw new Error('invalid project');
  return item;
}

/** 見本に入れるプロジェクト：相談文・相談の履歴への紐付け・前の見本の元など、作った人だけのものは外す */
export function libraryProject(p: ProjectState): ProjectState {
  const { recommendation, origin: _origin, ...rest } = p;
  void _origin;
  if (!recommendation) return { ...rest, current: 0 };
  const { consultation_text: _t, consultation_history_id: _h, ...rec } = recommendation;
  void _t; void _h;
  return { ...rest, current: 0, recommendation: rec };
}

/** 見本として公開する（管理者だけ）。タグの先頭にはスライドの言語のタグを付ける */
export async function publishToLibrary(sb: SupabaseClient, v: { title: string; description: string; tags: string[]; project: ProjectState }): Promise<string> {
  const project = libraryProject(v.project);
  const { data, error } = await sb.from('library_items').insert({ title: v.title.trim(), description: v.description.trim(), tags: withLangTag(v.tags, project.slideLocale), project }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** 見本を直す（管理者だけ）。名前・説明・タグ・スライド（プロジェクト）のうち、渡したものだけ。タグには言語のタグを付け直す */
export async function updateLibraryItem(sb: SupabaseClient, id: string, v: { title?: string; description?: string; tags?: string[]; project?: ProjectState; locale?: ProjectState['slideLocale'] }): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.title != null) patch.title = v.title.trim();
  if (v.description != null) patch.description = v.description.trim();
  const project = v.project ? libraryProject(v.project) : null;
  if (project) patch.project = project;
  const locale = project?.slideLocale ?? v.locale;
  if (v.tags && locale) patch.tags = withLangTag(v.tags, locale);
  const { error } = await sb.from('library_items').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
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

/** 複製したプロジェクト：保存前の新しい作業として、1枚目から。左側には相談文の代わりに「Library から」と出す */
export const copyOfLibrary = (item: LibraryItem): ProjectState => ({
  ...libraryProject(structuredClone(item.project)),
  origin: { kind: 'library', id: item.id, title: item.title },
});
