'use client';

import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient, isSupabaseConfigured } from './client';

export interface Auth {
  /** Supabase が設定されているか（未設定ならログイン・保存を出さない） */
  enabled: boolean;
  /** 読み込み中は undefined、未ログインは null */
  session: Session | null | undefined;
  client: SupabaseClient | null;
  /** メールにログイン用のリンクを送る。リンクを開くとこの画面に戻り、ログインした状態になる */
  sendLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useSession(): Auth {
  const enabled = isSupabaseConfigured();
  const [client] = useState(() => (enabled ? createClient() : null));
  const [session, setSession] = useState<Session | null | undefined>(enabled ? undefined : null);

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // メールのリンクから戻った時の ?code=… をアドレス欄から消す
      if (s && window.location.search.includes('code=')) window.history.replaceState(null, '', window.location.pathname);
    });
    return () => sub.subscription.unsubscribe();
  }, [client]);

  return {
    enabled,
    session,
    client,
    async sendLink(email) {
      if (!client) return;
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/' } });
      if (error) throw error;
    },
    async signOut() {
      await client?.auth.signOut();
    },
  };
}
