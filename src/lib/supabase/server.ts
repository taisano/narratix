import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Server Component / Route Handler 用の Supabase クライアント。 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase の環境変数が未設定です（.env.local を確認）');
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component からの呼び出しでは set できない（middleware 側で更新する）
        }
      },
    },
  });
}
