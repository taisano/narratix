import type { SupabaseClient } from '@supabase/supabase-js';
import { mainCount, storyDisplayTitle, storyProgress, type StoryProgress, type StoryState } from '@/features/story/model';
import { projectOfStory } from '@/features/story/storyProject';
import type { StoryRouteId } from '@/registry';
import { RepoError } from './errors';
import { listDeckRows, loadDeckProject, loadStoryFromDeck, saveDeckProject, softDeleteDeck } from './decks';

export interface StorySummary {
  id: string;
  name: string;
  slides: number;
  route: StoryRouteId;
  decisionQuestion: string;
  progress: StoryProgress;
  updatedAt: string;
  createdAt: string;
  story: StoryState;
}

export async function listStories(sb: SupabaseClient): Promise<StorySummary[]> {
  const rows = await listDeckRows(sb, 'story', true);
  const out: StorySummary[] = [];
  for (const row of rows) {
    const loaded = await loadDeckProject(sb, row.id);
    const story = loadStoryFromDeck(loaded.body, loaded.project);
    if (!story) continue;
    out.push({
      id: row.id,
      name: row.name || storyDisplayTitle(story),
      slides: mainCount(story),
      route: story.primaryRoute,
      decisionQuestion: story.decisionQuestion,
      progress: storyProgress(story),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      story,
    });
  }
  return out;
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
