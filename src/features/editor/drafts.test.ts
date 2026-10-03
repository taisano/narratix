import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDraft, DRAFT_LIMIT, draftStore, getDraft, isLocalDraftId, listDrafts, moveLocalDraftsToAccount, removeDraft } from './drafts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialProject, viewOf, withView } from './project';
import { EMPTY_DOC, hasUnsavedChanges } from './storage';

const remote = vi.hoisted(() => ({
  listRemoteDrafts: vi.fn(), getRemoteDraft: vi.fn(), putRemoteDraft: vi.fn(), deleteRemoteDraft: vi.fn(),
}));
vi.mock('@/lib/repo/drafts', () => remote);

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
  };
}
const edited = (title: string) => { const p = initialProject(); return withView(p, 0, { ...viewOf(p, 0), title }); };

describe('下書き（保存していない編集を消さずに残す）', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('window', { localStorage }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('残した下書きは新しい順に並び、開くと中身がそのまま戻る', () => {
    const now = Date.now();
    const a = addDraft(edited('A の見出し'), EMPTY_DOC, now - 2000);
    addDraft(edited('B の見出し'), EMPTY_DOC, now - 1000);
    const list = listDrafts(now);
    expect(list.map((d) => d.title)).toEqual(['B の見出し', 'A の見出し']);
    expect(viewOf(getDraft(a.id)!.project, 0).title).toBe('A の見出し');
  });
  it('最新 5 件まで。30 日を過ぎたものは出さない。削除できる', () => {
    for (let i = 0; i < DRAFT_LIMIT + 2; i++) addDraft(edited(`t${i}`), EMPTY_DOC, 1000 + i);
    expect(listDrafts(2000)).toHaveLength(DRAFT_LIMIT);
    expect(listDrafts(1000 + 31 * 24 * 3600 * 1000)).toHaveLength(0);
    const first = listDrafts(2000)[0]!;
    removeDraft(first.id);
    expect(listDrafts(2000).map((d) => d.id)).not.toContain(first.id);
  });
  it('保存済みチャートの続きは、同じチャートの下書きを置き換える（名前はチャートの名前）', () => {
    const doc = { ...EMPTY_DOC, id: 'c1', name: '地域別売上', version: 3 };
    addDraft(edited('1回目'), doc, 1000);
    addDraft(edited('2回目'), doc, 2000);
    const list = listDrafts(3000);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('地域別売上');
    expect(list[0]!.doc.id).toBe('c1');
  });
  it('開いた下書きをもう一度残すと、同じ下書きを置き換える（下書き自身の印は中に持たない）', () => {
    const a = addDraft(edited('1回目'), EMPTY_DOC, Date.now() - 1000);
    addDraft(edited('2回目'), { ...EMPTY_DOC, draftId: a.id, draftSnapshot: 'x' }, Date.now());
    const list = listDrafts();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('2回目');
    expect(list[0]!.doc.draftId).toBeUndefined();
    expect(list[0]!.doc.draftSnapshot).toBeUndefined();
  });
  it('下書きに残した状態から変えていなければ、失って困る変更は無い（新しく始める時に聞かない）', () => {
    const p = edited('残した見出し');
    const doc = { ...EMPTY_DOC, draftId: 'd1', draftSnapshot: JSON.stringify(p) };
    expect(hasUnsavedChanges(p, doc)).toBe(false);
    expect(hasUnsavedChanges(edited('その後に変えた'), doc)).toBe(true);
  });
  it('このブラウザの下書きの id と、アカウントの下書きの id（uuid）を見分ける', () => {
    expect(isLocalDraftId(addDraft(edited('a'), EMPTY_DOC).id)).toBe(true);
    expect(isLocalDraftId('3f2a9c1e-1b2c-4d5e-8f90-0a1b2c3d4e5f')).toBe(false);
  });
});

/** chart_drafts だけを真似た、最小の Supabase（アカウントの下書き） */
function fakeSupabase() {
  const rows: Record<string, unknown>[] = [];
  let seq = 0;
  const q = (filter?: (r: Record<string, unknown>) => boolean) => {
    const pick = () => rows.filter(filter ?? (() => true));
    const api = {
      select: () => api, order: () => api, limit: () => Promise.resolve({ data: [...pick()].reverse(), error: null }),
      eq: (k: string, v: unknown) => q((r) => (filter ? filter(r) : true) && r[k] === v),
      maybeSingle: () => Promise.resolve({ data: pick()[0] ?? null, error: null }),
      then: (f: (x: unknown) => unknown) => f({ data: pick(), error: null }),
    };
    return api;
  };
  return {
    rows,
    from: () => ({
      select: () => q(),
      insert: (row: Record<string, unknown>) => {
        const r = { ...row, id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, updated_at: new Date(Date.now() + seq).toISOString() };
        rows.push(r);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: r.id }, error: null }) }) };
      },
      update: (row: Record<string, unknown>) => ({
        eq: (_k: string, id: unknown) => ({ select: () => {
          const r = rows.find((x) => x.id === id);
          if (r) Object.assign(r, row);
          return Promise.resolve({ data: r ? [{ id }] : [], error: null });
        } }),
      }),
      delete: () => ({ eq: (_k: string, id: unknown) => { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); return Promise.resolve({ error: null }); } }),
    }),
  };
}

describe('下書きをアカウントに残す（ログイン中）', () => {
  let rows: { id: string; savedAt: number; title: string; slides: number; project: ReturnType<typeof initialProject>; doc: typeof EMPTY_DOC }[];
  let seq: number;
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('window', { localStorage });
    rows = []; seq = 0; vi.clearAllMocks();
    remote.listRemoteDrafts.mockImplementation(async () => [...rows].sort((a, b) => b.savedAt - a.savedAt));
    remote.getRemoteDraft.mockImplementation(async (_sb, id: string) => rows.find((x) => x.id === id) ?? null);
    remote.putRemoteDraft.mockImplementation(async (_sb, d) => {
      const id = d.id ?? `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const next = { id, savedAt: Date.now() + seq, title: d.title, slides: d.slides, project: d.project, doc: d.doc };
      const at = rows.findIndex((x) => x.id === id);
      if (at >= 0) rows[at] = next; else rows.push(next);
      return id;
    });
    remote.deleteRemoteDraft.mockImplementation(async (_sb, id: string) => { rows = rows.filter((x) => x.id !== id); });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('残す・開く・置き換える・消す。ブラウザには残さない', async () => {
    const sb = {};
    const store = draftStore(sb as unknown as SupabaseClient);
    expect(store.remote).toBe(true);
    const id = await store.put(edited('アカウントの下書き'), EMPTY_DOC);
    expect(isLocalDraftId(id)).toBe(false);
    expect(listDrafts()).toHaveLength(0);
    const d = await store.get(id);
    expect(viewOf(d!.project, 0).title).toBe('アカウントの下書き');
    // 開いた下書き（draftId）をもう一度残すと、同じ下書きを置き換える
    const again = await store.put(edited('直した見出し'), { ...EMPTY_DOC, draftId: id });
    expect(again).toBe(id);
    expect(await store.list()).toHaveLength(1);
    expect((await store.list())[0]!.title).toBe('直した見出し');
    await store.remove(id);
    expect(await store.list()).toHaveLength(0);
  });
  it('保存済みチャートの続きは、そのチャートの下書きを置き換える', async () => {
    const store = draftStore({} as SupabaseClient);
    const doc = { ...EMPTY_DOC, id: 'c1', name: '地域別売上', version: 2 };
    await store.put(edited('1回目'), doc);
    await store.put(edited('2回目'), doc);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(viewOf(list[0]!.project, 0).title).toBe('2回目');
  });
  it('ログインした時、このブラウザの下書きをアカウントへ移す（移したものはブラウザから消える）', async () => {
    addDraft(edited('古い'), EMPTY_DOC, Date.now() - 2000);
    addDraft(edited('新しい'), EMPTY_DOC, Date.now() - 1000);
    const sb = {};
    expect(await moveLocalDraftsToAccount(sb as unknown as SupabaseClient)).toBe(2);
    expect(listDrafts()).toHaveLength(0);
    const list = await draftStore(sb as unknown as SupabaseClient).list();
    expect(list.map((d) => d.title)).toEqual(['新しい', '古い']);
  });
});
