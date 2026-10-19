'use client';

import { useEffect, useState } from 'react';
import { PLAN_EVENTS } from '@/lib/planEvents';
import { getMySubscription, type MySubscription } from '@/lib/repo/billing';
import { useAuth } from '../shell/AppShell';

/** 自分の購読（課金が有効な時だけ読む）。決済の後（usageChanged）に読み直す */
export function useSubscription(enabled: boolean): MySubscription | null {
  const auth = useAuth();
  const uid = auth.session?.user.id;
  const [sub, setSub] = useState<MySubscription | null>(null);
  useEffect(() => {
    let alive = true;
    if (!enabled || !auth.client || !uid) { setSub(null); return; }
    const load = () => { void getMySubscription(auth.client!).then((v) => { if (alive) setSub(v); }); };
    load();
    window.addEventListener(PLAN_EVENTS.USAGE, load);
    return () => { alive = false; window.removeEventListener(PLAN_EVENTS.USAGE, load); };
  }, [enabled, auth.client, uid]);
  return sub;
}
