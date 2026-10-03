import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialProject, viewOf, withView } from '@/features/editor/project';
import { buildProjectPptx } from '@/features/editor/pptExport';
import { deleteChart, duplicateChart, listCharts, loadChart, saveChart, setChartTags } from './charts';
import { checkpointPptExport } from './decks';

type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: ((row: Row) => boolean)[] = [];
  private mode: 'select' | 'update' = 'select';
  private patch: Row = {};
  private max: number | null = null;
  constructor(private rows: Row[]) {}
  select() { this.mode = 'select' as const; return this; }
  update(patch: Row) { this.mode = 'update' as const; this.patch = patch; return this; }
  eq(key: string, value: unknown) { this.filters.push((r) => r[key] === value); return this; }
  is(key: string, value: unknown) { this.filters.push((r) => r[key] === value); return this; }
  not(key: string, _op: string, value: unknown) { this.filters.push((r) => r[key] !== value); return this; }
  in(key: string, values: unknown[]) { this.filters.push((r) => values.includes(r[key])); return this; }
  order(key: string, { ascending = true }: { ascending?: boolean } = {}) { this.rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)); return this; }
  limit(n: number) { this.max = n; return this; }
  private result() {
    let found = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'update') found.forEach((r) => Object.assign(r, this.patch));
    if (this.max != null) found = found.slice(0, this.max);
    return { data: found.map((r) => ({ ...r })), error: null as null };
  }
  async maybeSingle() { const r = this.result(); return { data: (r.data as Row[])[0] ?? null, error: null }; }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

function memorySupabase() {
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;
  const tables: { workspaces: Row[]; decks: Row[]; dataset_versions: Row[]; deck_versions: Row[]; deck_exports: Row[] } = {
    workspaces: [{ id: 'workspace-1', kind: 'personal', created_at: '2026-10-03T00:00:00Z' }],
    decks: [], dataset_versions: [], deck_versions: [], deck_exports: [],
  };
  const assets = new Map<string, { current: string | null }>();
  const rpc = async (name: string, p: Record<string, unknown>) => {
    if (name === 'save_dataset_asset_version') {
      const assetId = (p.p_asset_id as string | null) ?? id('asset');
      const old = tables.dataset_versions.find((x) => x.dataset_asset_id === assetId && x.content_hash === p.p_content_hash && x.semantics_hash === p.p_semantics_hash);
      if (old) { assets.set(assetId, { current: old.id as string }); return { data: [{ asset_id: assetId, version_id: old.id, saved_version: old.version }], error: null }; }
      const version = tables.dataset_versions.filter((x) => x.dataset_asset_id === assetId).length + 1;
      const versionId = id('data-version');
      tables.dataset_versions.push({
        id: versionId, dataset_asset_id: assetId, version, payload: p.p_payload, input: p.p_input,
        content_hash: p.p_content_hash, semantics_hash: p.p_semantics_hash, original_table_hash: p.p_original_table_hash,
      });
      assets.set(assetId, { current: versionId });
      return { data: [{ asset_id: assetId, version_id: versionId, saved_version: version }], error: null };
    }
    if (name === 'save_deck_state') {
      const deckId = (p.p_deck_id as string | null) ?? id('deck');
      let deck = tables.decks.find((x) => x.id === deckId);
      if (!deck) {
        deck = { id: deckId, workspace_id: 'workspace-1', kind: p.p_kind, name: p.p_name ?? '', lang: p.p_lang, user_tags: p.p_user_tags,
          working: p.p_working, current_version_id: null, copied_from_deck_id: p.p_copied_from_deck_id, copied_from_version_id: p.p_copied_from_version_id,
          deleted_at: null, created_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:00:00Z' };
        tables.decks.push(deck);
      } else {
        deck.working = p.p_working; deck.lang = p.p_lang; deck.user_tags = p.p_user_tags;
        if (p.p_name != null) deck.name = p.p_name;
      }
      let versionId = deck.current_version_id as string | null;
      let version = versionId ? (tables.deck_versions.find((x) => x.id === versionId)?.version as number) : 0;
      if (p.p_create_version || (p.p_kind === 'story' && !versionId)) {
        version += 1; versionId = id('deck-version');
        tables.deck_versions.push({ id: versionId, deck_id: deckId, version, reason: p.p_reason, content: p.p_content });
        deck.current_version_id = versionId;
      }
      return { data: [{ saved_id: deckId, saved_version: version, saved_version_id: versionId }], error: null };
    }
    if (name === 'append_deck_export') {
      const deck = tables.decks.find((x) => x.id === p.p_deck_id)!;
      const version = tables.deck_versions.filter((x) => x.deck_id === deck.id).length + 1;
      const versionId = id('deck-version');
      tables.deck_versions.push({ id: versionId, deck_id: deck.id, version, reason: 'ppt_export', content: p.p_content });
      tables.deck_exports.push({ deck_id: deck.id, deck_version_id: versionId });
      deck.current_version_id = versionId;
      return { data: [{ saved_version: version, saved_version_id: versionId }], error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  };
  const sb = { from: (table: string) => new Query(tables[table as keyof typeof tables]), rpc } as unknown as SupabaseClient;
  return { sb, tables };
}

describe('新しいdeck repoの一連の流れ', () => {
  it('作る→保存→開く→同じ状態からPPTを作り、出力版を固定する', async () => {
    const memory = memorySupabase();
    const original = withView(initialProject(), 0, { ...viewOf(initialProject(), 0), title: '保存からPPTまで' });
    const saved = await saveChart(memory.sb, null, original, '回帰テスト');
    expect(saved.version).toBe(1);

    const opened = await loadChart(memory.sb, saved.id);
    // 読み戻すと文の basis が補われるため、元の編集状態をすべて保った上で来歴が増えることを確かめる。
    expect(opened.state).toMatchObject(JSON.parse(JSON.stringify(original)) as typeof original);
    expect(opened.name).toBe('回帰テスト');

    const ppt = await buildProjectPptx({ project: opened.state, name: opened.name, dataSlide: false, client: null, count: false, admin: false, t: ((key: string) => key) as never });
    expect(ppt.ok).toBe(true);
    if (ppt.ok) expect(ppt.file.name).toBe('回帰テスト.pptx');

    const checkpoint = await checkpointPptExport(memory.sb, saved.id, opened.state);
    expect(checkpoint.version).toBe(2);
    expect(memory.tables.deck_exports).toHaveLength(1);
    expect(memory.tables.deck_versions.map((x) => x.reason)).toEqual(['save', 'ppt_export']);

    await setChartTags(memory.sb, saved.id, ['市場'], opened.state);
    const copied = await duplicateChart(memory.sb, saved.id, '回帰テストのコピー');
    expect(copied.version).toBe(1);
    expect(memory.tables.decks.find((x) => x.id === copied.id)).toMatchObject({
      copied_from_deck_id: saved.id,
      copied_from_version_id: checkpoint.versionId,
    });
    expect((await listCharts(memory.sb)).map((x) => x.name)).toEqual(['回帰テスト', '回帰テストのコピー']);

    await deleteChart(memory.sb, saved.id);
    expect((await listCharts(memory.sb)).map((x) => x.name)).toEqual(['回帰テストのコピー']);
  });
});
