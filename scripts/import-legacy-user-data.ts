/**
 * 旧view_specs／storiesを新しいdeckへ移す。旧表は変更しない。
 * 必須環境変数：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、LEGACY_OWNER_ID、LEGACY_WORKSPACE_ID
 * 実行前確認：npm run import:legacy-user-data -- --dry-run
 * Codexは本番実行しない。秘密情報をログへ出さない。
 */
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { projectToCanonical, storyTextsToCanonical, type CanonicalProjectDraft } from '../src/features/data/canonical';
import { prepareLegacyDecks, type LegacyChartRow, type LegacyDeckDraft, type LegacyStoryRow } from '../src/features/data/legacyImport';
import { sourceMetaOf } from '../src/features/data/source';
import { isSampleSource } from '../src/features/editor/leftovers';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

function stableUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ((parseInt(chars[16]!, 16) & 3) | 8).toString(16);
  const h = chars.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type DatasetRef = { assetId: string; versionId: string; sourceIds?: string[] };
type Story = NonNullable<LegacyDeckDraft['story']>;
type StoredStory = Omit<Story, 'datasets'> & { datasets: Omit<Story['datasets'][number], 'data'>[] };

function storyWithoutData(story: Story): StoredStory {
  return { ...structuredClone(story), datasets: story.datasets.map(({ data: _data, ...meta }) => meta) };
}

function importPayload(row: LegacyDeckDraft) {
  let canonical: CanonicalProjectDraft = projectToCanonical(row.project, row.updatedAt);
  if (row.story) canonical = storyTextsToCanonical(canonical, row.story, row.updatedAt);
  const datasetRefs: Record<string, DatasetRef> = {};
  const datasets = Object.entries(canonical.datasetVersions).map(([localId, draft]) => {
    const slot = canonical.editor.slots[localId]!;
    const assetId = stableUuid(`legacy:${row.id}:asset:${localId}`);
    const versionId = stableUuid(`legacy:${row.id}:dataset-version:${localId}`);
    const sample = slot.sourceMeta?.kind === 'sample' || isSampleSource(slot.source);
    const meta = sourceMetaOf(slot.source, slot.sourceMeta, row.project.slideLocale, sample);
    const sourceId = meta ? stableUuid(`legacy:${row.id}:source:${localId}`) : null;
    datasetRefs[localId] = { assetId, versionId, ...(sourceId ? { sourceIds: [sourceId] } : {}) };
    return {
      assetId, versionId, name: slot.label, payload: draft.table, input: { ...draft.input, projection: draft.projection },
      contentHash: draft.contentHash, semanticsHash: draft.semanticsHash, originalTableHash: draft.originalTableHash,
      ...(meta && sourceId ? { source: { id: sourceId, ...meta } } : {}),
    };
  });
  const working = {
    ...canonical.content, editor: canonical.editor, datasetRefs,
    ...(row.story ? { storyState: storyWithoutData(row.story) } : {}),
    legacyImport: { sourceTable: row.sourceTable, sourceId: row.id, sourceVersion: row.version },
  };
  return { working, datasets, deckVersionId: stableUuid(`legacy:${row.id}:deck-version:${row.version}`) };
}

export async function importLegacyUserData(dryRun: boolean): Promise<{ charts: number; stories: number; imported: number; skipped: number }> {
  const url = required('SUPABASE_URL');
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const ownerId = required('LEGACY_OWNER_ID');
  const workspaceId = required('LEGACY_WORKSPACE_ID');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [workspace, chartsResult, storiesResult] = await Promise.all([
    client.from('workspaces').select('id').eq('id', workspaceId).eq('created_by', ownerId).eq('kind', 'personal').maybeSingle(),
    client.from('view_specs').select('id, name, title, ui, version, tags, created_at, updated_at').eq('owner_id', ownerId),
    client.from('stories').select('id, name, story, created_at, updated_at').eq('owner_id', ownerId),
  ]);
  if (workspace.error || !workspace.data) throw new Error(workspace.error?.message ?? 'legacy owner workspace not found');
  if (chartsResult.error) throw new Error(chartsResult.error.message);
  if (storiesResult.error) throw new Error(storiesResult.error.message);
  const charts = (chartsResult.data ?? []) as unknown as LegacyChartRow[];
  const stories = (storiesResult.data ?? []) as unknown as LegacyStoryRow[];
  const rows = prepareLegacyDecks(charts, stories);
  for (const row of rows) importPayload(row);
  if (dryRun) return { charts: charts.length, stories: stories.length, imported: 0, skipped: 0 };

  let imported = 0, skipped = 0;
  for (const row of rows) {
    const payload = importPayload(row);
    const { data, error } = await client.rpc('import_legacy_user_deck', {
      p_owner_id: ownerId, p_workspace_id: workspaceId, p_deck_id: row.id, p_deck_version_id: payload.deckVersionId,
      p_kind: row.kind, p_name: row.name, p_lang: row.project.slideLocale, p_user_tags: row.userTags,
      p_working: payload.working, p_version: row.version, p_created_at: row.createdAt, p_updated_at: row.updatedAt,
      p_datasets: payload.datasets,
    });
    if (error) throw new Error(`${row.kind} ${row.name || row.id}: ${error.message}`);
    if (data === 'imported') imported++; else if (data === 'skipped') skipped++; else throw new Error(`unexpected import result: ${String(data)}`);
  }
  const ids = rows.map((x) => x.id);
  const { count, error } = await client.from('decks').select('id', { count: 'exact', head: true }).in('id', ids).eq('created_by', ownerId);
  if (error) throw new Error(error.message);
  if (count !== rows.length) throw new Error(`verification failed: expected ${rows.length} decks, found ${count ?? 0}`);
  return { charts: charts.length, stories: stories.length, imported, skipped };
}

if (import.meta.url === new URL(process.argv[1]!, 'file:').href) {
  const dryRun = process.argv.includes('--dry-run');
  importLegacyUserData(dryRun).then((r) => {
    if (dryRun) console.log(`Validated ${r.charts} charts and ${r.stories} stories.`);
    else console.log(`Imported ${r.imported} legacy decks; skipped ${r.skipped} already imported (${r.charts} charts, ${r.stories} stories).`);
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Legacy user data import failed.');
    process.exitCode = 1;
  });
}
