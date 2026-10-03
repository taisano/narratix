import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialState } from '@/features/editor/state';
import { fromBuilder, initialProject, withView, viewOf, duplicateSlide } from '@/features/editor/project';

const deck = vi.hoisted(() => ({ saveDeckProject: vi.fn() }));
vi.mock('./decks', () => ({
  ...deck,
  deckTitle: vi.fn(), deckVersionNumbers: vi.fn(), listDeckRows: vi.fn(), loadDeckProject: vi.fn(), parseStoredDeck: vi.fn(), softDeleteDeck: vi.fn(),
}));

import { saveChart } from './charts';

describe('saveChart（新しいdecks）', () => {
  beforeEach(() => { deck.saveDeckProject.mockReset().mockResolvedValue({ id: 'abc', version: 3, versionId: 'v3' }); });

  it('検証を通ったプロジェクトをchartの版として保存する', async () => {
    const sb = {} as SupabaseClient;
    const state = initialProject();
    await expect(saveChart(sb, 'abc', state, '地域別')).resolves.toEqual({ id: 'abc', version: 3 });
    expect(deck.saveDeckProject).toHaveBeenCalledWith(sb, expect.objectContaining({
      id: 'abc', kind: 'chart', name: '地域別', project: state, createVersion: true, reason: 'save',
    }));
  });

  it('スライドが複数でも全部を検証し、プロジェクト全体を1回で渡す', async () => {
    let project = duplicateSlide(initialProject());
    project = withView(project, 1, { ...viewOf(project, 1), title: '2枚目' });
    await saveChart({} as SupabaseClient, null, project);
    expect(deck.saveDeckProject).toHaveBeenCalledTimes(1);
    expect(deck.saveDeckProject.mock.calls[0]![1].project.slides).toHaveLength(2);
    const bad = withView(project, 1, { ...viewOf(project, 1), title: 5 as never });
    await expect(saveChart({} as SupabaseClient, null, bad)).rejects.toThrow(/#2/);
    expect(deck.saveDeckProject).toHaveBeenCalledTimes(1);
  });

  it('検証に通らない状態は保存処理へ渡さない', async () => {
    const state = fromBuilder({ ...initialState(), title: 123 as never });
    await expect(saveChart({} as SupabaseClient, null, state)).rejects.toThrow();
    expect(deck.saveDeckProject).not.toHaveBeenCalled();
  });
});
