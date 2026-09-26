import { describe, expect, it } from 'vitest';
import { normalizeTags, splitTagInput, tagCounts, userTags, withLangTag } from './tags';
import { copyOfLibrary, libraryProject, type LibraryItem } from './repo/library';
import { initialProject } from '@/features/editor/project';

describe('タグ', () => {
  it('区切り・空白・重複・長さ・数をそろえる', () => {
    expect(splitTagInput('市場, 四半期、 グローバル')).toEqual(['市場', '四半期', 'グローバル']);
    expect(normalizeTags([' 市場 ', 'Market', 'market', '', 'x'.repeat(40)])).toEqual(['市場', 'Market', 'x'.repeat(30)]);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => 't' + i))).toHaveLength(10);
  });
  it('言語のタグは先頭に自動で付き、付け直すと入れ替わる', () => {
    expect(withLangTag(['市場'], 'ja')).toEqual(['日本語', '市場']);
    expect(withLangTag(['日本語', '市場'], 'en')).toEqual(['English', '市場']);
    expect(userTags(['English', '市場'])).toEqual(['市場']);
  });
  it('絞り込みの並び：言語のタグが先、あとは多い順', () => {
    expect(tagCounts([['日本語', 'b'], ['English', 'a', 'b'], ['日本語']])).toEqual(['日本語', 'English', 'b', 'a']);
  });
});

describe('Library の見本と複製', () => {
  const base = initialProject();
  const withConsult = { ...base, recommendation: { ...(base.recommendation ?? {}), consultation_text: '作った人の相談', consultation_history_id: 'h1' } } as typeof base;
  it('公開する時に、相談文・履歴・前の元を外す', () => {
    const p = libraryProject({ ...withConsult, origin: { kind: 'library', id: 'x', title: '前の見本' } });
    expect(p.recommendation?.consultation_text).toBeUndefined();
    expect(p.recommendation?.consultation_history_id).toBeUndefined();
    expect(p.origin).toBeUndefined();
  });
  it('複製すると、相談文の代わりに「Library から」の元が付く（古い見本に相談文が残っていても出さない）', () => {
    const item: LibraryItem = { id: 'L1', title: '推移の見本', description: '', tags: ['日本語'], project: withConsult, published: true, sort: 0, updatedAt: '' };
    const p = copyOfLibrary(item);
    expect(p.origin).toEqual({ kind: 'library', id: 'L1', title: '推移の見本' });
    expect(p.recommendation?.consultation_text).toBeUndefined();
  });
});

describe('タグの表示', async () => {
  const { cardTags, filterTags, tagLabel, tagSearchText } = await import('./tags');
  it('言語のタグは画面の言語で出す', () => {
    expect(tagLabel('日本語', 'en')).toBe('Japanese');
    expect(tagLabel('English', 'ja')).toBe('英語');
    expect(tagLabel('市場', 'en')).toBe('市場');
    expect(tagSearchText(['日本語'])).toContain('Japanese');
  });
  it('カードは言語を除いて最初の3つと残りの数', () => {
    expect(cardTags(['日本語', 'a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['a', 'b', 'c'], more: 2 });
    expect(cardTags(['English'])).toEqual({ shown: [], more: 0 });
  });
  it('絞り込みは言語と、よく使われる上位10個', () => {
    const lists = Array.from({ length: 12 }, (_, i) => ['日本語', 't' + i, ...(i < 3 ? ['popular'] : [])]);
    const f = filterTags(lists);
    expect(f[0]).toBe('日本語');
    expect(f[1]).toBe('popular');
    expect(f).toHaveLength(11);
  });
});
