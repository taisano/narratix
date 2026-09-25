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
  sendLink: (email: string, redirectPath?: string) => Promise<void>;
  /** メール＋パスワードで登録。Supabase で「メール確認」をオフにしていれば、そのままログインした状態になる（needsConfirm: false） */
  signUp: (email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  /** メール＋パスワードでログイン */
  signIn: (email: string, password: string) => Promise<void>;
  /** ログイン中の人のパスワードを設定・変更する（メールのリンクで登録した人・パスワードを忘れた人） */
  setPassword: (password: string) => Promise<void>;
  /** パスワードを設定し直すリンクをメールで送る（メールの送信数に上限があるので、忘れた時だけ） */
  sendReset: (email: string) => Promise<void>;
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
      if (s && window.location.search.includes('code=')) {
        const u = new URL(window.location.href);
        u.searchParams.delete('code');
        window.history.replaceState(null, '', u.pathname + (u.search ? u.search : ''));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [client]);

  return {
    enabled,
    session,
    client,
    async sendLink(email, redirectPath) {
      if (!client) return;
      // メールのリンクを開いた後に戻る場所（登録の画面・エディタなど）。無ければトップ
      const back = redirectPath && redirectPath.startsWith('/') ? redirectPath : '/';
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + back } });
      if (error) throw error;
    },
    async signUp(email, password) {
      if (!client) return { needsConfirm: false };
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return { needsConfirm: !data.session };
    },
    async signIn(email, password) {
      if (!client) return;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async setPassword(password) {
      if (!client) return;
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async sendReset(email) {
      if (!client) return;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/account/password' });
      if (error) throw error;
    },
    async signOut() {
      await client?.auth.signOut();
    },
  };
}
