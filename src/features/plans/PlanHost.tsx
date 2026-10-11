'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import { PLAN_EVENTS, type PlanReason } from '@/lib/planEvents';
import { FREE_TRIAL } from '@/lib/pricing';
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
  useEffect(() => { ref.current?.showModal(); }, []);
  const why = reason === 'menu' ? null : t(`plans.reason.${reason}`, { slide: FREE_TRIAL.slide, story: FREE_TRIAL.story });
  return (
    <dialog ref={ref} className={`${fb.dialog} ${css.dialog}`} onClose={onClose} aria-labelledby="pl-title">
      <div className={fb.form}>
        <h2 id="pl-title" className={fb.title}>{t('plans.title')}</h2>
        {why && <p className={css.reason} role="status">{why}</p>}
        <p className={fb.note}>{t('plans.lead')}</p>
        <PlanCards reason={reason} />
        <div className={fb.buttons}><button type="button" className={fb.secondary} onClick={() => ref.current?.close()}>{t('account.close')}</button></div>
      </div>
    </dialog>
  );
}
