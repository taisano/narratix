'use client';

import { useEffect, useState } from 'react';
import { isAdmin } from '@/lib/repo/library';
import { useAuth } from '../shell/AppShell';

/** ログイン中の人が管理者か（Library に公開・非公開・削除できる） */
export function useIsAdmin(): boolean {
  const auth = useAuth();
  const [admin, setAdmin] = useState(false);
  const uid = auth.session?.user.id;
  useEffect(() => {
    let alive = true;
    if (!auth.client || !uid) { setAdmin(false); return; }
    void isAdmin(auth.client).then((a) => { if (alive) setAdmin(a); });
    return () => { alive = false; };
  }, [auth.client, uid]);
  return admin;
}
