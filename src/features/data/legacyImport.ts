import { normalizeProject, type ProjectState } from '@/features/editor/project';
import { normalizeStory, storyDisplayTitle, type StoryState } from '@/features/story/model';
import { projectOfStory } from '@/features/story/storyProject';
import { normalizeTags, withLangTag } from '@/lib/tags';

export interface LegacyChartRow {
  id: string;
  name?: string | null;
  title?: string | null;
  ui: unknown;
  version?: number | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface LegacyStoryRow {
  id: string;
  name?: string | null;
  story: unknown;
  created_at: string;
  updated_at: string;
}

export interface LegacyDeckDraft {
  id: string;
  sourceTable: 'view_specs' | 'stories';
  kind: 'chart' | 'story';
  name: string;
  project: ProjectState;
  story?: StoryState;
  userTags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** 旧表の現在状態を、新しいdeckへ保存できる画面内の形に戻す。読めない行が1件でもあれば全体を止める。 */
export function prepareLegacyDecks(charts: LegacyChartRow[], stories: LegacyStoryRow[]): LegacyDeckDraft[] {
  const out: LegacyDeckDraft[] = [];
  const ids = new Set<string>();
  for (const row of charts) {
    if (ids.has(row.id)) throw new Error(`duplicate legacy id: ${row.id}`);
    ids.add(row.id);
    const project = normalizeProject(row.ui);
    if (!project) throw new Error(`invalid legacy chart: ${row.name || row.title || row.id}`);
    out.push({
      id: row.id, sourceTable: 'view_specs', kind: 'chart', name: (row.name || row.title || '').trim(), project,
      userTags: withLangTag(normalizeTags(row.tags ?? [], 20), project.slideLocale),
      version: Math.max(1, Math.floor(row.version ?? 1)), createdAt: row.created_at, updatedAt: row.updated_at,
    });
  }
  for (const row of stories) {
    if (ids.has(row.id)) throw new Error(`duplicate legacy id: ${row.id}`);
    ids.add(row.id);
    const story = normalizeStory(row.story);
    if (!story) throw new Error(`invalid legacy story: ${row.name || row.id}`);
    const project = projectOfStory(story, story.slideLocale);
    out.push({
      id: row.id, sourceTable: 'stories', kind: 'story', name: (row.name || storyDisplayTitle(story)).trim(), project, story,
      userTags: withLangTag([], project.slideLocale), version: 1, createdAt: row.created_at, updatedAt: row.updated_at,
    });
  }
  return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
}
