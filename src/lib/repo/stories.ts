import type { SupabaseClient } from '@supabase/supabase-js';
import { mainCount, storyDisplayTitle, storyProgress, type StoryProgress, type StoryState } from '@/features/story/model';
import { projectOfStory } from '@/features/story/storyProject';
import type { StoryRouteId } from '@/registry';
import { RepoError } from './errors';
import { listDeckRows, loadDeckProject, loadStoryFromDeck, parseStoredDeck, saveDeckProject, softDeleteDeck } from './decks';

export interface StorySummary {
  id: string;
  name: string;
  slides: number;
  route: StoryRouteId;
  decisionQuestion: string;
  progress: StoryProgress;
  updatedAt: string;
  createdAt: string;
  /** スライドの絵に要るデータごとの Story。まだ読めていない間は null */
  story: StoryState | null;
}

/** 1件の読み込みが返らない時に、一覧全体を止めないための待ち時間 */
const ITEM_TIMEOUT_MS = 15_000;
const POOL = 4;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

/**
 * 保存した Story の一覧。2段階で出す：
 * 1. 保存してある Story の状態（タイトル・問い・進み具合）だけで、すぐ一覧を出す（データの読み込みは待たない）
 * 2. スライドの絵に要るデータを、上から順に同時に数件ずつ読んで、読めた Story から絵を足す（読めない・返らない1件は絵なしのまま）
 * onProgress は、どちらの段階でも一覧を更新するたびに呼ぶ
 */
export async function listStories(sb: SupabaseClient, onProgress?: (list: StorySummary[]) => void): Promise<StorySummary[]> {
  const rows = await listDeckRows(sb, 'story', true);
  const slots: StorySummary[] = [];
  for (const row of rows) {
    const body = parseStoredDeck(row.working);
    const light = body?.storyState as unknown as StoryState | undefined;
    if (!light || !Array.isArray(light.slides)) continue;
    slots.push({
      id: row.id,
      name: row.name || storyDisplayTitle(light),
      slides: mainCount(light),
      route: light.primaryRoute,
      decisionQuestion: light.decisionQuestion,
      progress: storyProgress(light),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      story: null,
    });
  }
  onProgress?.([...slots]);
  let next = 0;
  const worker = async () => {
    while (next < slots.length) {
      const k = next++;
      try {
        const loaded = await withTimeout(loadDeckProject(sb, slots[k]!.id), ITEM_TIMEOUT_MS);
        const story = loadStoryFromDeck(loaded.body, loaded.project);
        if (story) { slots[k] = { ...slots[k]!, story }; onProgress?.([...slots]); }
      } catch { /* この1件は絵なしのまま */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, slots.length) }, worker));
  return slots;
}

export async function loadStory(sb: SupabaseClient, id: string): Promise<{ id: string; name: string; story: StoryState }> {
  const loaded = await loadDeckProject(sb, id);
  if (loaded.row.kind !== 'story') throw new RepoError('not_found', 'story not found');
  const story = loadStoryFromDeck(loaded.body, loaded.project);
  if (!story) throw new RepoError('bad_ui_state', 'saved story state is missing or from an unknown version');
  return { id, name: loaded.row.name, story };
}

export async function saveStory(sb: SupabaseClient, id: string | null, story: StoryState, name?: string): Promise<string> {
  const project = projectOfStory(story, story.slideLocale);
  const saved = await saveDeckProject(sb, {
    id,
    kind: 'story',
    name: name ?? (id ? null : storyDisplayTitle(story)),
    project,
    story,
    createVersion: false,
    reason: 'save',
  });
  return saved.id;
}

export async function renameStory(sb: SupabaseClient, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new RepoError('empty_name', 'name is empty');
  const loaded = await loadStory(sb, id);
  await saveDeckProject(sb, {
    id,
    kind: 'story',
    name: trimmed.slice(0, 300),
    project: projectOfStory(loaded.story, loaded.story.slideLocale),
    story: loaded.story,
    createVersion: true,
    reason: 'rename',
  });
}

export async function duplicateStory(sb: SupabaseClient, id: string, name: string): Promise<string> {
  const loaded = await loadDeckProject(sb, id);
  const story = loadStoryFromDeck(loaded.body, loaded.project);
  if (!story) throw new RepoError('not_found', 'story not found');
  const saved = await saveDeckProject(sb, {
    id: null,
    kind: 'story',
    name,
    project: loaded.project,
    story,
    createVersion: true,
    reason: 'save',
    copiedFrom: { deckId: id, versionId: loaded.row.current_version_id },
  });
  return saved.id;
}

export async function deleteStory(sb: SupabaseClient, id: string): Promise<void> {
  await softDeleteDeck(sb, id);
}
