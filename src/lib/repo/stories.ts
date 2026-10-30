import type { SupabaseClient } from '@supabase/supabase-js';
import { mainCount, storyDisplayTitle, storyProgress, type StoryProgress, type StoryState } from '@/features/story/model';
import { projectOfStory } from '@/features/story/storyProject';
import type { StoryRouteId } from '@/registry';
import { RepoError } from './errors';
import { listDeckRows, loadDeckProject, loadStoriesFromRows, loadStoryFromDeck, parseStoredDeck, saveDeckProject, softDeleteDeck, type DeckRow } from './decks';

export interface StorySummary {
  id: string;
  name: string;
  slides: number;
  route: StoryRouteId;
  decisionQuestion: string;
  progress: StoryProgress;
  updatedAt: string;
  createdAt: string;
  /** decks の1行（絵に要るデータをあとでまとめて読む時に使う） */
  deck: DeckRow;
}

/**
 * 保存した Story の一覧。保存してある Story の状態（タイトル・問い・進み具合）だけで、すぐ出す。
 * スライドの絵に要るデータは、画面に出たカードの分だけ loadStoryPreviews で、まとめて取る
 */
export async function listStories(sb: SupabaseClient): Promise<StorySummary[]> {
  const rows = await listDeckRows(sb, 'story', true);
  const out: StorySummary[] = [];
  for (const row of rows) {
    const body = parseStoredDeck(row.working);
    const light = body?.storyState as unknown as StoryState | undefined;
    if (!light || !Array.isArray(light.slides)) continue;
    out.push({
      id: row.id,
      name: row.name || storyDisplayTitle(light),
      slides: mainCount(light),
      route: light.primaryRoute,
      decisionQuestion: light.decisionQuestion,
      progress: storyProgress(light),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      deck: row,
    });
  }
  return out;
}

/** 画面に出たカードの Story を、データ版・出典をまとめて取って読む（15秒返らない時は待たずに空で返す） */
export async function loadStoryPreviews(sb: SupabaseClient, summaries: StorySummary[]): Promise<Map<string, StoryState>> {
  const timeout = new Promise<Map<string, StoryState>>((resolve) => setTimeout(() => resolve(new Map()), 15_000));
  return Promise.race([loadStoriesFromRows(sb, summaries.map((x) => x.deck)).catch(() => new Map<string, StoryState>()), timeout]);
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
