'use client';

import { STORY_COACH_ENABLED } from '@/lib/ai/plans';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '@/lib/ab/track';
import { BILLING_LIVE } from '@/lib/billing/flag';
import { usageChanged } from '@/lib/planEvents';
import { useT } from '@/i18n/ui';
import { FeedbackButton } from '../feedback/Feedback';
import { PlanCards } from './PlanCards';
import priv from '../privacy/privacy.module.css';
import css from './plans.module.css';

/** 料金のページ（ログイン不要）。ベータの後の予定の料金と、いまの無料枠。決済はまだない */
export default function PricingPage() {
  const t = useT();
  useEffect(() => { track('pricing_view', { oncePerPage: true }); }, []);
  // Stripe の画面から戻ってきた時（?checkout=success|cancel）。プランの反映は Webhook 経由で少し遅れることがあるので、数回読み直す
  const [back, setBack] = useState<'success' | 'cancel' | null>(null);
  useEffect(() => {
    if (!BILLING_LIVE) return;
    const v = new URLSearchParams(window.location.search).get('checkout');
    if (v !== 'success' && v !== 'cancel') return;
    setBack(v);
    if (v !== 'success') return;
    const timers = [1500, 4000, 9000, 20000].map((ms) => window.setTimeout(usageChanged, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);
  return (
    <main className={`${priv.wrap} ${css.page}`}>
      <p className={priv.kicker}>PRICING</p>
      <h1 className={priv.h1}>{t('pricing.title')}</h1>
      <p className={priv.lead}>{t(BILLING_LIVE ? 'billing.lead' : 'pricing.lead')}</p>
      {back && <p className={priv.note} role="status">{t(back === 'success' ? 'billing.success' : 'billing.cancel')}</p>}
      <PlanCards reason="pricing" />
      <details className={css.guide}>
        <summary>{t('pricing.notes.title')}</summary>
        <ul className={priv.list}>
          {(STORY_COACH_ENABLED ? [1, 2, 3, 4] as const : [1, 2, 4] as const).map((n) => <li key={n}>{t(n === 4 && BILLING_LIVE ? 'billing.notes4' : `pricing.notes.${n}`)}</li>)}
          <li>{t('plans.tax')}</li>
          <li>{t('pricing.notes.data')} <Link href="/privacy" className={priv.linkBtn}>{t('privacy.link')}</Link></li>
        </ul>
      </details>
      <p className={priv.note}>{t('privacy.contact')} <FeedbackButton className={priv.linkBtn} source="pricing" /></p>
      <p className={priv.note}><Link href="/start" className={priv.linkBtn}>{t('privacy.back')}</Link></p>
    </main>
  );
}
