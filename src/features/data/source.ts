import type { Locale } from '@/registry';

export type SourceKind = 'external_web' | 'external_document' | 'internal' | 'survey' | 'user_estimate' | 'sample';

export interface SourceMeta {
  kind: SourceKind;
  title: string;
  publisher?: string;
  url?: string;
  publishedAt?: string;
  retrievedAt?: string;
  locator?: string;
  citationText: string;
}

export const sourceTitle = (citation: string): string =>
  citation.trim().replace(/^(出典|出所|資料|source)\s*[:：]\s*/i, '').trim();

export const sourceCitation = (title: string, locale: Locale): string => {
  const text = title.trim();
  return text ? locale === 'en' ? `Source: ${text}` : `出典：${text}` : '';
};

export function sourceMetaOf(citation: string, meta: SourceMeta | undefined, locale: Locale, sample: boolean): SourceMeta | undefined {
  const text = citation.trim();
  if (!text) return undefined;
  const same = meta?.citationText.trim() === text;
  const title = same && meta.title.trim() ? meta.title.trim() : sourceTitle(text);
  return {
    kind: sample ? 'sample' : meta?.url ? 'external_web' : same ? meta.kind : 'internal',
    title: title || text,
    ...(same && meta.publisher ? { publisher: meta.publisher } : {}),
    ...(same && meta.url ? { url: meta.url } : {}),
    ...(same && meta.publishedAt ? { publishedAt: meta.publishedAt } : {}),
    ...(same && meta.retrievedAt ? { retrievedAt: meta.retrievedAt } : {}),
    ...(same && meta.locator ? { locator: meta.locator } : {}),
    citationText: text,
  };
}

export function sourcePatch(meta: SourceMeta | undefined, patch: Partial<SourceMeta>, locale: Locale): { source: string; sourceMeta?: SourceMeta } {
  const title = patch.title ?? meta?.title ?? '';
  const citationText = patch.citationText ?? sourceCitation(title, locale);
  if (!title.trim() && !citationText.trim()) return { source: '' };
  const next: SourceMeta = {
    kind: patch.kind ?? meta?.kind ?? (patch.url || meta?.url ? 'external_web' : 'internal'),
    title: title.trim() || sourceTitle(citationText), citationText,
    ...(patch.publisher ?? meta?.publisher ? { publisher: patch.publisher ?? meta!.publisher } : {}),
    ...(patch.url ?? meta?.url ? { url: patch.url ?? meta!.url } : {}),
    ...(patch.publishedAt ?? meta?.publishedAt ? { publishedAt: patch.publishedAt ?? meta!.publishedAt } : {}),
    ...(patch.retrievedAt ?? meta?.retrievedAt ? { retrievedAt: patch.retrievedAt ?? meta!.retrievedAt } : {}),
    ...(patch.locator ?? meta?.locator ? { locator: patch.locator ?? meta!.locator } : {}),
  };
  if (!next.url) delete next.url;
  if (!next.publishedAt) delete next.publishedAt;
  return { source: citationText, sourceMeta: next };
}
