import { createBrowserClient } from '@supabase/ssr';

/** ブラウザ用の Supabase クライアント。公開キーのみを使う。 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase の環境変数が未設定です（.env.local を確認）');
  return createBrowserClient(url, key);
}
