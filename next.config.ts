import type { NextConfig } from 'next';

/** 以前はエディターが「/」だった。?chart= などが付いた古いリンク・ブックマークは /editor へ（クエリはそのまま渡る） */
const EDITOR_QUERY_KEYS = ['chart', 'library', 'libraryEdit', 'new', 'plan'];

/** この版の ID（Vercel ではコミット）。開いたままの古いタブに「新しい版があります」を出すのに使う */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
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
