'use client';

import { useEffect, useState } from 'react';
import { PLAN_EVENTS } from '@/lib/planEvents';
import { getMakeUsage, type MakeUsage } from '@/lib/repo/plans';
import { useAuth } from '../shell/AppShell';

/** 無料枠の残り（ログインしていない・読めない時は null）。保存・書き出しの後（usageChanged）に読み直す */
export function useMakeUsage(): MakeUsage | null {
  const auth = useAuth();
  const uid = auth.session?.user.id;
  const [usage, setUsage] = useState<MakeUsage | null>(null);
  useEffect(() => {
    let alive = true;
    if (!auth.client || !uid) { setUsage(null); return; }
    const load = () => { void getMakeUsage(auth.client!).then((v) => { if (alive) setUsage(v); }); };
    load();
    window.addEventListener(PLAN_EVENTS.USAGE, load);
    return () => { alive = false; window.removeEventListener(PLAN_EVENTS.USAGE, load); };
  }, [auth.client, uid]);
  return usage;
}
