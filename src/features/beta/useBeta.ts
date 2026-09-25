'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Auth } from '@/lib/supabase/useSession';
import { CONSENT_KEY, joinBeta, readBeta, type BetaStatus } from '@/lib/repo/beta';

/**
 * ベータ版の登録状態。
 * off：Supabase が未設定（手元の開発）＝制限なし、loading、anon：未ログイン、none：ログイン済みで未登録、active / waitlist、error
 */
export type BetaState =
  | { kind: 'off' | 'loading' | 'anon' | 'none' }
  | { kind: BetaStatus; emailOptIn: boolean }
  | { kind: 'error'; message: string };

export interface Beta {
  state: BetaState;
  join: (emailOptIn: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBeta(auth: Auth): Beta {
  const [state, setState] = useState<BetaState>({ kind: auth.enabled ? 'loading' : 'off' });
  const uid = auth.session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!auth.enabled) return setState({ kind: 'off' });
    if (auth.session === undefined) return setState({ kind: 'loading' });
    if (!auth.client || !uid) return setState({ kind: 'anon' });
    try {
      const r = await readBeta(auth.client, uid);
      if (r) return setState({ kind: r.status, emailOptIn: r.emailOptIn });
      // 登録の画面で同意してからメールのリンクで戻ってきた時は、そのまま登録する
      let pending: { optIn?: boolean } | null = null;
      try { pending = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null'); } catch { /* 無ければ同意の画面を出す */ }
      if (pending) {
        const status = await joinBeta(auth.client, !!pending.optIn);
        try { localStorage.removeItem(CONSENT_KEY); } catch { /* 何もしない */ }
        return setState({ kind: status, emailOptIn: !!pending.optIn });
      }
      setState({ kind: 'none' });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message ?? String(e) });
    }
  }, [auth.enabled, auth.session, auth.client, uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const join = useCallback(async (emailOptIn: boolean) => {
    if (!auth.client) return;
    const status = await joinBeta(auth.client, emailOptIn);
    setState({ kind: status, emailOptIn });
  }, [auth.client]);

  return { state, join, refresh };
}
