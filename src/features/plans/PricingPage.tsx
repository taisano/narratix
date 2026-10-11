'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { track } from '@/lib/ab/track';
import { useT } from '@/i18n/ui';
import { FREE_TRIAL } from '@/lib/pricing';
import { FeedbackButton } from '../feedback/Feedback';
import { PlanCards } from './PlanCards';
import priv from '../privacy/privacy.module.css';
import css from './plans.module.css';

/** 料金のページ（ログイン不要）。ベータの後の予定の料金と、いまの無料枠。決済はまだない */
export default function PricingPage() {
  const t = useT();
  useEffect(() => { track('pricing_view', { oncePerPage: true }); }, []);
  return (
    <main className={`${priv.wrap} ${css.page}`}>
      <p className={priv.kicker}>PRICING</p>
      <h1 className={priv.h1}>{t('pricing.title')}</h1>
      <p className={priv.lead}>{t('pricing.lead')}</p>
      <PlanCards reason="pricing" />
      <section className={priv.section} aria-labelledby="pr-notes">
        <h2 id="pr-notes" className={priv.h2}>{t('pricing.notes.title')}</h2>
        <ul className={priv.list}>
          {([1, 2, 3, 4] as const).map((n) => <li key={n}>{t(`pricing.notes.${n}`, { slide: FREE_TRIAL.slide, story: FREE_TRIAL.story })}</li>)}
        </ul>
      </section>
      <p className={priv.note}>{t('privacy.contact')} <FeedbackButton className={priv.linkBtn} source="pricing" /></p>
      <p className={priv.note}><Link href="/start" className={priv.linkBtn}>{t('privacy.back')}</Link></p>
    </main>
  );
}
