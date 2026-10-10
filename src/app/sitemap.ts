import type { MetadataRoute } from 'next';
import { PUBLIC_PATHS, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((p) => ({ url: p === '/' ? `${SITE_URL}/` : `${SITE_URL}${p}`, changeFrequency: p === '/' ? 'weekly' : 'monthly', priority: p === '/' ? 1 : 0.6 }));
}
