import type { NextConfig } from 'next';

/** 以前はエディターが「/」だった。?chart= などが付いた古いリンク・ブックマークは /editor へ（クエリはそのまま渡る） */
const EDITOR_QUERY_KEYS = ['chart', 'library', 'libraryEdit', 'new', 'plan'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return EDITOR_QUERY_KEYS.map((key) => ({
      source: '/',
      has: [{ type: 'query' as const, key }],
      destination: '/editor',
      permanent: false,
    }));
  },
};

export default nextConfig;
