import type { SupabaseClient } from '@supabase/supabase-js';
import {
  projectFromCanonical, projectToCanonical,
  type CanonicalDatasetDraft, type CanonicalProjectDraft, type DeckContent, type DatasetProjection,
} from '@/features/data/canonical';
import type { ProjectState } from '@/features/editor/project';
import { normalizeStory, type StoryDataset, type StoryState } from '@/features/story/model';
import type { DocRef } from '@/features/editor/storage';
import { RepoError } from './errors';

export type DeckKind = 'chart' | 'story';
type DatasetRef = { assetId: string; versionId: string };
type StoredStory = Omit<StoryState, 'datasets'> & { datasets: Omit<StoryDataset, 'data'>[] };

export interface StoredDeck extends DeckContent {
  editor: CanonicalProjectDraft['editor'];
  datasetRefs: Record<string, DatasetRef>;
  storyState?: StoredStory;
  draft?: { doc: DocRef };
}

export interface DeckRow {
  id: string;
  workspace_id: string;
  kind: DeckKind;
  name: string;
  lang: 'ja' | 'en';
  user_tags: string[];
  working: unknown;
  current_version_id: string | null;
  copied_from_deck_id: string | null;
  copied_from_version_id: string | null;
  created_at: string;
  updated_at: string;
}

const DECK_COLS = 'id, workspace_id, kind, name, lang, user_tags, working, current_version_id, copied_from_deck_id, copied_from_version_id, created_at, updated_at';

export const parseStoredDeck = (value: unknown): StoredDeck | null => {
  const x = value as Partial<StoredDeck> | null;
  return x && typeof x === 'object' && x.schemaVersion === 1 && Array.isArray(x.slides)
    && x.editor && typeof x.editor === 'object' && x.datasetRefs && typeof x.datasetRefs === 'object'
    ? x as StoredDeck : null;
};

const storyWithoutData = (story: StoryState): StoredStory => ({
  ...structuredClone(story),
  datasets: story.datasets.map(({ data: _data, ...meta }) => meta),
});

const storyWithProject = (story: StoredStory, project: ProjectState): StoryState | null => {
  const meta = new Map(story.datasets.map((x) => [x.id, x]));
  const datasets: StoryDataset[] = [
    { id: 'table', label: meta.get('table')?.label ?? '', data: project.dataset, source: project.source, ...(meta.get('table')?.periodType ? { periodType: meta.get('table')!.periodType } : {}) },
  ];
  if (project.datasets?.bridge) datasets.push({ id: 'bridge', label: meta.get('bridge')?.label ?? '', data: project.datasets.bridge, source: project.source });
  if (project.datasets?.relation) datasets.push({ id: 'relation', label: meta.get('relation')?.label ?? '', data: project.datasets.relation, source: project.source });
  for (const [id, x] of Object.entries(project.extra ?? {})) {
    const m = meta.get(id);
    datasets.push({ id, label: m?.label ?? x.label, data: x.dataset, source: x.source, family: m?.family ?? x.family, ...(m?.periodType ? { periodType: m.periodType } : {}) });
  }
  return normalizeStory({ ...story, datasets });
};

async function rowOf(sb: SupabaseClient, id: string): Promise<DeckRow> {
  const { data, error } = await sb.from('decks').select(DECK_COLS).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new RepoError('load_failed', error.message);
  if (!data) throw new RepoError('not_found', 'deck not found');
  return data as unknown as DeckRow;
}

export async function listDeckRows(sb: SupabaseClient, kind: DeckKind, versioned: boolean): Promise<DeckRow[]> {
  let q = sb.from('decks').select(DECK_COLS).eq('kind', kind).is('deleted_at', null);
  q = versioned ? q.not('current_version_id', 'is', null) : q.is('current_version_id', null);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw new RepoError('list_failed', error.message);
  return (data ?? []) as unknown as DeckRow[];
}

async function versionNumbers(sb: SupabaseClient, ids: (string | null)[]): Promise<Map<string, number>> {
  const actual = ids.filter((x): x is string => !!x);
  if (!actual.length) return new Map();
  const { data, error } = await sb.from('deck_versions').select('id, version').in('id', actual);
  if (error) throw new RepoError('list_failed', error.message);
  return new Map(((data ?? []) as unknown as { id: string; version: number }[]).map((x) => [x.id, x.version]));
}

export async function deckVersionNumbers(sb: SupabaseClient, rows: DeckRow[]): Promise<Map<string, number>> {
  return versionNumbers(sb, rows.map((x) => x.current_version_id));
}

async function personalWorkspaceId(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.from('workspaces').select('id').eq('kind', 'personal').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error || !data) throw new RepoError('save_failed', error?.message ?? 'personal workspace not found');
  return (data as { id: string }).id;
}

async function saveDatasetsWithWorkspace(sb: SupabaseClient, project: ProjectState, previous: StoredDeck | null, workspaceId: string): Promise<{ canonical: CanonicalProjectDraft; refs: Record<string, DatasetRef> }> {
  const canonical = projectToCanonical(project, new Date().toISOString());
  const refs: Record<string, DatasetRef> = {};
  for (const [localId, draft] of Object.entries(canonical.datasetVersions)) {
    const slot = canonical.editor.slots[localId]!;
    const before = previous?.datasetRefs[localId];
    const { data, error } = await sb.rpc('save_dataset_asset_version', {
      p_workspace_id: workspaceId,
      p_asset_id: before?.assetId ?? null,
      p_name: slot.label,
      p_lang: project.slideLocale,
      p_payload: draft.table,
      p_input: { ...draft.input, projection: draft.projection },
      p_content_hash: draft.contentHash,
      p_semantics_hash: draft.semanticsHash,
      p_original_table_hash: draft.originalTableHash,
    });
    if (error) throw new RepoError('save_failed', error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { asset_id: string; version_id: string } | undefined;
    if (!row) throw new RepoError('save_failed', 'dataset version was not saved');
    refs[localId] = { assetId: row.asset_id, versionId: row.version_id };
  }
  return { canonical, refs };
}

const envelope = (canonical: CanonicalProjectDraft, refs: Record<string, DatasetRef>, story?: StoryState, draft?: { doc: DocRef }): StoredDeck => ({
  ...canonical.content,
  editor: canonical.editor,
  datasetRefs: refs,
  ...(story ? { storyState: storyWithoutData(story) } : {}),
  ...(draft ? { draft } : {}),
});

export async function saveDeckProject(sb: SupabaseClient, options: {
  id: string | null;
  kind: DeckKind;
  name: string | null;
  project: ProjectState;
  userTags?: string[];
  story?: StoryState;
  draft?: { doc: DocRef };
  createVersion: boolean;
  reason?: 'save' | 'rename' | 'interval' | 'template_import';
  copiedFrom?: { deckId: string; versionId: string | null };
}): Promise<{ id: string; version: number; versionId: string | null }> {
  const previousRow = options.id ? await rowOf(sb, options.id) : null;
  const previous = previousRow ? parseStoredDeck(previousRow.working) : null;
  const workspaceId = previousRow?.workspace_id ?? await personalWorkspaceId(sb);
  const { canonical, refs } = await saveDatasetsWithWorkspace(sb, options.project, previous, workspaceId);
  const body = envelope(canonical, refs, options.story, options.draft);
  const { data, error } = await sb.rpc('save_deck_state', {
    p_deck_id: options.id,
    p_kind: options.kind,
    p_name: options.name,
    p_lang: options.project.slideLocale,
    p_user_tags: options.userTags ?? previousRow?.user_tags ?? [],
    p_working: body,
    p_content: body,
    p_create_version: options.createVersion,
    p_reason: options.reason ?? 'save',
    p_copied_from_deck_id: options.copiedFrom?.deckId ?? null,
    p_copied_from_version_id: options.copiedFrom?.versionId ?? null,
  });
  if (error) throw new RepoError('save_failed', error.message);
  const saved = (Array.isArray(data) ? data[0] : data) as { saved_id: string; saved_version: number; saved_version_id: string | null } | undefined;
  if (!saved) throw new RepoError('save_failed', 'deck was not saved');
  return { id: saved.saved_id, version: saved.saved_version, versionId: saved.saved_version_id };
}

async function projectOfEnvelope(sb: SupabaseClient, body: StoredDeck): Promise<ProjectState> {
  const ids = Object.values(body.datasetRefs).map((x) => x.versionId);
  const { data, error } = await sb.from('dataset_versions')
    .select('id, payload, input, content_hash, semantics_hash, original_table_hash')
    .in('id', ids);
  if (error) throw new RepoError('load_failed', error.message);
  const rows = new Map(((data ?? []) as unknown as {
    id: string; payload: CanonicalDatasetDraft['table']; input: CanonicalDatasetDraft['input'] & { projection?: DatasetProjection };
    content_hash: string; semantics_hash: string; original_table_hash: string;
  }[]).map((x) => [x.id, x]));
  const datasetVersions: Record<string, CanonicalDatasetDraft> = {};
  for (const [localId, ref] of Object.entries(body.datasetRefs)) {
    const row = rows.get(ref.versionId);
    if (!row?.input?.projection) throw new RepoError('bad_data_state', 'saved dataset projection is missing');
    const { projection, ...input } = row.input;
    datasetVersions[localId] = {
      table: row.payload, projection, input: input as CanonicalDatasetDraft['input'],
      contentHash: row.content_hash, semanticsHash: row.semantics_hash, originalTableHash: row.original_table_hash,
    };
  }
  return projectFromCanonical({ content: { schemaVersion: 1, slideLocale: body.slideLocale, slides: body.slides, ...(body.story ? { story: body.story } : {}) }, datasetVersions, editor: body.editor });
}

export async function loadDeckProject(sb: SupabaseClient, id: string): Promise<{ row: DeckRow; body: StoredDeck; project: ProjectState }> {
  const row = await rowOf(sb, id);
  const body = parseStoredDeck(row.working);
  if (!body) throw new RepoError('bad_ui_state', 'saved deck state is missing or from an unknown version');
  return { row, body, project: await projectOfEnvelope(sb, body) };
}

export function loadStoryFromDeck(body: StoredDeck, project: ProjectState): StoryState | null {
  return body.storyState ? storyWithProject(body.storyState, project) : null;
}

export async function softDeleteDeck(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('decks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new RepoError('delete_failed', error.message);
}

export async function checkpointPptExport(sb: SupabaseClient, id: string, project: ProjectState, story?: StoryState): Promise<{ version: number; versionId: string }> {
  const current = await rowOf(sb, id);
  const previous = parseStoredDeck(current.working);
  const { canonical, refs } = await saveDatasetsWithWorkspace(sb, project, previous, current.workspace_id);
  const body = envelope(canonical, refs, story);
  const { data, error } = await sb.rpc('append_deck_export', { p_deck_id: id, p_content: body });
  if (error) throw new RepoError('save_failed', error.message);
  const saved = (Array.isArray(data) ? data[0] : data) as { saved_version: number; saved_version_id: string } | undefined;
  if (!saved) throw new RepoError('save_failed', 'export version was not saved');
  return { version: saved.saved_version, versionId: saved.saved_version_id };
}

export const deckTitle = (body: StoredDeck): string => body.slides[0]?.texts.message?.text ?? '';
