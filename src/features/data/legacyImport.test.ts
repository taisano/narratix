import { describe, expect, it } from 'vitest';
import { initialProject } from '@/features/editor/project';
import { newStory } from '@/features/story/model';
import { prepareLegacyDecks } from './legacyImport';

const at = '2026-10-01T00:00:00.000Z';

describe('旧ユーザーデータの移行', () => {
  it('チャートとStoryを新しいdeck用の画面状態へ戻す', () => {
    const chart = initialProject('ja');
    chart.slides[0]!.title = '以前のチャート';
    const story = newStory('en', { title: 'Previous story' });
    const rows = prepareLegacyDecks(
      [{ id: 'chart-1', name: '保存名', ui: chart, version: 4, tags: ['市場'], created_at: at, updated_at: at }],
      [{ id: 'story-1', name: '', story, created_at: at, updated_at: '2026-10-02T00:00:00.000Z' }],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'chart-1', kind: 'chart', version: 4, name: '保存名', userTags: ['日本語', '市場'] });
    expect(rows[0]!.project.slides[0]!.title).toBe('以前のチャート');
    expect(rows[1]).toMatchObject({ id: 'story-1', kind: 'story', version: 1, name: 'Previous story', userTags: ['English'] });
    expect(rows[1]!.story?.title).toBe('Previous story');
  });

  it('読めない行や重複idがあれば全体を止める', () => {
    expect(() => prepareLegacyDecks([{ id: 'bad', ui: {}, created_at: at, updated_at: at }], [])).toThrow(/invalid legacy chart/);
    expect(() => prepareLegacyDecks(
      [{ id: 'same', ui: initialProject(), created_at: at, updated_at: at }],
      [{ id: 'same', story: newStory('ja'), created_at: at, updated_at: at }],
    )).toThrow(/duplicate legacy id/);
  });
});
