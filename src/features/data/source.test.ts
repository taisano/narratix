import { describe, expect, it } from 'vitest';
import { sourceCitation, sourceMetaOf, sourcePatch, sourceTitle } from './source';

describe('構造化した出典', () => {
  it('今までの表示文から資料名を取り出し、見本を区別する', () => {
    expect(sourceTitle('出典：日本政府観光局「訪日外客統計」')).toBe('日本政府観光局「訪日外客統計」');
    expect(sourceMetaOf('Source: Sample data', undefined, 'en', true)).toMatchObject({ kind: 'sample', title: 'Sample data', citationText: 'Source: Sample data' });
  });

  it('資料名を表示用の出典へ直し、URLと公開日を任意で持つ', () => {
    const first = sourcePatch(undefined, { title: '訪日外客統計' }, 'ja');
    expect(first).toEqual({ source: '出典：訪日外客統計', sourceMeta: { kind: 'internal', title: '訪日外客統計', citationText: '出典：訪日外客統計' } });
    const linked = sourcePatch(first.sourceMeta, { url: 'https://example.com/report', kind: 'external_web', publishedAt: '2026-09-01' }, 'ja');
    expect(linked.sourceMeta).toMatchObject({ kind: 'external_web', url: 'https://example.com/report', publishedAt: '2026-09-01' });
    expect(sourceCitation('Internal sales', 'en')).toBe('Source: Internal sales');
  });
});
