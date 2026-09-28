import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDraft, DRAFT_LIMIT, getDraft, listDrafts, removeDraft } from './drafts';
import { initialProject, viewOf, withView } from './project';
import { EMPTY_DOC } from './storage';

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
});
