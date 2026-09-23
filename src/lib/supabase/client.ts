import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** .env.local に Supabase の値が入っているか（未設定ならログイン・保存を出さない） */
export const isSupabaseConfigured = () => !!SB_URL && !!KEY;

let browserClient: SupabaseClient | null = null;

/** ブラウザ用の Supabase クライアント（1つを使い回す）。公開キーのみを使う。 */
export function createClient(): SupabaseClient {
  if (!SB_URL || !KEY) throw new Error('Supabase の環境変数が未設定です（.env.local を確認）');
  browserClient ??= createBrowserClient(SB_URL, KEY);
  return browserClient;
}
