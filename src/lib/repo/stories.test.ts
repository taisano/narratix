import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptySlide, newStory } from '@/features/story/model';

const deck = vi.hoisted(() => ({
  listDeckRows: vi.fn(), loadDeckProject: vi.fn(), loadStoryFromDeck: vi.fn(), saveDeckProject: vi.fn(), softDeleteDeck: vi.fn(),
}));
vi.mock('./decks', () => deck);

import { deleteStory, listStories, loadStory, renameStory, saveStory } from './stories';

const story = newStory('ja', { decisionQuestion: 'どの市場を優先するか', slides: [emptySlide({ status: 'DONE' }), emptySlide(), emptySlide({ section: 'APPENDIX' })] });
const row = { id: 'a', workspace_id: 'w', kind: 'story', name: '', lang: 'ja', user_tags: [], working: {}, current_version_id: 'v1', copied_from_deck_id: null, copied_from_version_id: null, updated_at: '2026-09-30T10:00:00Z', created_at: '2026-09-30T09:00:00Z' };

describe('Story の保存（新しいdecks）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deck.saveDeckProject.mockResolvedValue({ id: 'new', version: 1, versionId: 'v1' });
    deck.listDeckRows.mockResolvedValue([row]);
    deck.loadDeckProject.mockResolvedValue({ row, body: {}, project: {} });
    deck.loadStoryFromDeck.mockReturnValue(story);
  });

  it('新規はStoryの名前と中身をdeckのworking・最初の版へ渡す', async () => {
    await expect(saveStory({} as SupabaseClient, null, story)).resolves.toBe('new');
    expect(deck.saveDeckProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: null, kind: 'story', name: 'どの市場を優先するか', story, createVersion: false,
    }));
  });

  it('既存Storyの自動保存は同じdeckを更新する', async () => {
    await saveStory({} as SupabaseClient, 'a', story, '名前');
    expect(deck.saveDeckProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'a', name: '名前', createVersion: false }));
  });

  it('一覧はStoryの中身から枚数・進み具合を出す', async () => {
    const list = await listStories({} as SupabaseClient);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', name: 'どの市場を優先するか', slides: 2, progress: { done: 1, total: 3 } });
  });

  it('読み込み・名前変更時の版・論理削除', async () => {
    await expect(loadStory({} as SupabaseClient, 'a')).resolves.toMatchObject({ id: 'a', story });
    await expect(renameStory({} as SupabaseClient, 'a', '  ')).rejects.toMatchObject({ code: 'empty_name' });
    await renameStory({} as SupabaseClient, 'a', ' 新しい名前 ');
    expect(deck.saveDeckProject).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ id: 'a', name: '新しい名前', createVersion: true, reason: 'rename' }));
    await deleteStory({} as SupabaseClient, 'a');
    expect(deck.softDeleteDeck).toHaveBeenCalledWith(expect.anything(), 'a');
  });
});
