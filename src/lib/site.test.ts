import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { PRIVATE_PATHS, PUBLIC_PATHS, SITE_URL } from './site';

describe('サイトマップと robots', () => {
  it('サイトマップは公開ページだけを、完全なアドレスで並べる', () => {
    const urls = sitemap().map((x) => x.url);
    expect(urls).toContain(`${SITE_URL}/`);
    expect(urls.every((u) => u.startsWith('https://'))).toBe(true);
    expect(urls).toHaveLength(PUBLIC_PATHS.length);
    for (const p of PRIVATE_PATHS) expect(urls.some((u) => u.includes(p.replace(/\/$/, '')))).toBe(false);
  });
  it('robots は非公開のページを除外し、サイトマップの場所を示す', () => {
    const r = robots();
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(['/admin', '/api/', '/editor']));
  });
});
