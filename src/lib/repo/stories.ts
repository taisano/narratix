import type { SupabaseClient } from '@supabase/supabase-js';
import { mainCount, normalizeStory, storyDisplayTitle, storyProgress, type StoryProgress, type StoryState } from '@/features/story/model';
import type { StoryRouteId } from '@/registry';
import { RepoError } from './charts';

/**
 * Story の保存（表 stories。マイチャートの「Story」タブ）。1つの Story＝1行。docs/story-spec.md 15.4。
 * RLS により、本人の行だけが読み書きできる
 */

export interface StorySummary {
  id: string;
  name: string;
  /** Main Story の枚数 */
  slides: number;
  route: StoryRouteId;
  decisionQuestion: string;
  progress: StoryProgress;
  updatedAt: string;
  createdAt: string;
  /** 中身（マイチャートの縮小表示・「見る」で使う） */
  story: StoryState;
}

type Row = { id: string; name: string; slides: number; route: string; story: unknown; updated_at: string; created_at: string };

const toSummary = (r: Row): StorySummary | null => {
  const s = normalizeStory(r.story);
  if (!s) return null;
  return {
    id: r.id, name: r.name || storyDisplayTitle(s), slides: r.slides, route: s.primaryRoute, decisionQuestion: s.decisionQuestion,
    progress: storyProgress(s), updatedAt: r.updated_at, createdAt: r.created_at, story: s,
  };
};

/** 表の列（一覧用）。名前は自分で付けた名前、無ければ決めたい問い・最初の Question */
const columnsOf = (s: StoryState, name?: string) => ({
  name: (name ?? storyDisplayTitle(s)).trim().slice(0, 300),
  slides: mainCount(s),
  route: s.primaryRoute,
  story: s,
});

export async function listStories(sb: SupabaseClient): Promise<StorySummary[]> {
  const { data, error } = await sb.from('stories').select('id, name, slides, route, story, updated_at, created_at').order('updated_at', { ascending: false });
  if (error) throw new RepoError('list_failed', error.message);
  return ((data ?? []) as Row[]).map(toSummary).filter((x): x is StorySummary => !!x);
}

export async function loadStory(sb: SupabaseClient, id: string): Promise<{ id: string; name: string; story: StoryState }> {
  const { data, error } = await sb.from('stories').select('id, name, story').eq('id', id).maybeSingle();
  if (error) throw new RepoError('load_failed', error.message);
  const r = data as { id: string; name: string; story: unknown } | null;
  const story = r ? normalizeStory(r.story) : null;
  if (!r || !story) throw new RepoError('not_found', 'story not found');
  return { id: r.id, name: r.name, story };
}

/** 保存する。id があれば上書き、無ければ新しく足す。保存した Story の id を返す */
export async function saveStory(sb: SupabaseClient, id: string | null, story: StoryState, name?: string): Promise<string> {
  const row = columnsOf(story, name);
  if (id) {
    const { data, error } = await sb.from('stories').update(row).eq('id', id).select('id');
    if (error) throw new RepoError('save_failed', error.message);
    if (!(data as unknown[]).length) throw new RepoError('not_found', 'story not found');
    return id;
  }
  const { data, error } = await sb.from('stories').insert(row).select('id').single();
  if (error) throw new RepoError('save_failed', error.message);
  return (data as { id: string }).id;
}

export async function renameStory(sb: SupabaseClient, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new RepoError('empty_name', 'name is empty');
  const { error } = await sb.from('stories').update({ name: trimmed.slice(0, 300) }).eq('id', id);
  if (error) throw new RepoError('rename_failed', error.message);
}

/** 複製（別の Story として保存し直す） */
export async function duplicateStory(sb: SupabaseClient, id: string, name: string): Promise<string> {
  const src = await loadStory(sb, id);
  return saveStory(sb, null, src.story, name);
}

export async function deleteStory(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('stories').delete().eq('id', id);
  if (error) throw new RepoError('delete_failed', error.message);
}
