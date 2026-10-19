'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import { BILLING_LIVE } from '@/lib/billing/flag';
import { PLAN_EVENTS, type PlanReason } from '@/lib/planEvents';
import { PLAN_MATRIX } from '@/lib/pricing';
import { useMakeUsage } from './useMakeUsage';
import { track } from '@/lib/ab/track';
import fb from '../feedback/feedback.module.css';
import { PlanCards } from './PlanCards';
import css from './plans.module.css';

/** プラン比較のダイアログの受け皿（AppShell に1つ）。上限に当たった時・設定メニューから openPlans で開く */
export function PlanHost() {
  const [reason, setReason] = useState<PlanReason | null>(null);
  useEffect(() => {
    const open = (e: Event) => { const r = (e as CustomEvent<{ reason: PlanReason }>).detail?.reason ?? 'menu'; setReason(r); track('plans_open', { detail: r }); };
    window.addEventListener(PLAN_EVENTS.OPEN, open);
    return () => window.removeEventListener(PLAN_EVENTS.OPEN, open);
  }, []);
  return reason ? <PlanDialog reason={reason} onClose={() => setReason(null)} /> : null;
}

function PlanDialog({ reason, onClose }: { reason: PlanReason; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const usage = useMakeUsage();
  useEffect(() => { ref.current?.showModal(); }, []);
  // 使い切った回数（Plus なら Plus の上限）。読めない時は基本プランの数字
  const n = reason === 'export' ? (usage?.export.limit ?? PLAN_MATRIX.free.exports) : (usage?.slide.limit ?? PLAN_MATRIX.free.slides);
  const why = reason === 'menu' ? null : t(`plans.reason.${reason}`, { n: n ?? 0 });
  return (
    <dialog ref={ref} className={`${fb.dialog} ${css.dialog}`} onClose={onClose} aria-labelledby="pl-title">
      <div className={fb.form}>
        <h2 id="pl-title" className={fb.title}>{t('plans.title')}</h2>
        {why && <p className={css.reason} role="status">{why}</p>}
        <p className={fb.note}>{t(BILLING_LIVE ? 'billing.lead' : 'plans.lead')}</p>
        <PlanCards reason={reason} />
        <div className={fb.buttons}><button type="button" className={fb.secondary} onClick={() => ref.current?.close()}>{t('account.close')}</button></div>
      </div>
    </dialog>
  );
}
