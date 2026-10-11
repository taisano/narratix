'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { PLAN_LIMITS, PLAN_NAMES } from '@/lib/ai/plans';
import { interestSourceOf, type PlanReason } from '@/lib/planEvents';
import { CURRENCIES, EUR_PROVISIONAL, FREE_TRIAL, PRICES, currencyOfLocale, formatPrice, termSavingPercent, type Billing, type Currency, type PaidPlan } from '@/lib/pricing';
import { recordPlanInterest, type PriceFeel } from '@/lib/repo/plans';
import { useAuth } from '../shell/AppShell';
import { useMakeUsage } from './useMakeUsage';
import css from './plans.module.css';

const FEELS: readonly PriceFeel[] = ['high', 'fair', 'low'];

/**
 * プランの比較（ダイアログと /pricing で共通）。決済はまだない。
 * 有料プランのボタンは「この料金なら使いたい」＝関心と価格感の記録だけ（docs/pricing-plan.md 4章）。
 */
export function PlanCards({ reason }: { reason: PlanReason | 'pricing' }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const usage = useMakeUsage();
  const [currency, setCurrency] = useState<Currency>(currencyOfLocale(locale));
  const [billing, setBilling] = useState<Billing>('term');
  const [asking, setAsking] = useState<PaidPlan | null>(null);
  const [sent, setSent] = useState<PaidPlan | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const loggedIn = !!auth.client && !!auth.session;
  const plan = usage?.plan ?? 'free';

  async function send(p: PaidPlan, feel: PriceFeel | null) {
    if (!auth.client) return;
    setBusy(true); setError(false);
    try {
      await recordPlanInterest(auth.client, { plan: p, billing, currency, feel, source: interestSourceOf(reason) });
      setSent(p); setAsking(null);
    } catch { setError(true); } finally { setBusy(false); }
  }

  const paid: PaidPlan[] = ['pro', 'team'];
  const price = (p: PaidPlan) => formatPrice(PRICES[currency][p][billing], currency, locale);
  const featureCount: Record<'free' | PaidPlan, number> = { free: 3, pro: 3, team: 4 };
  const consult = (id: 'free' | PaidPlan) => String(PLAN_LIMITS[id === 'free' ? 'free' : id].ai_consult ?? '');

  return (
    <div className={css.cards}>
      <div className={css.toggles}>
        <div className={css.seg} role="group" aria-label={t('plans.currency')}>
          {CURRENCIES.map((c) => <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>{c}</button>)}
        </div>
        <div className={css.seg} role="group" aria-label={t('plans.billing')}>
          {(['monthly', 'term'] as const).map((b) => <button key={b} type="button" aria-pressed={billing === b} onClick={() => setBilling(b)}>{t(`plans.billing.${b}`)}</button>)}
        </div>
      </div>
      <div className={css.grid}>
        {(['free', 'pro', 'team'] as const).map((id) => {
          const isPaid = id !== 'free';
          const current = plan === id && !!usage;
          return (
            <section key={id} className={css.card} data-plan={id} data-current={current || undefined} aria-labelledby={`pc-${id}`}>
              <h3 id={`pc-${id}`} className={css.name}>{PLAN_NAMES[id][locale === 'ja' ? 'ja' : 'en']}{current && <span className={css.badge}>{t('plans.current')}</span>}</h3>
              <p className={css.price}>
                {isPaid ? <><strong>{price(id)}</strong><span>{t('plans.perMonth')}</span></> : <strong>{t('plans.free.price')}</strong>}
              </p>
              {isPaid && billing === 'term' && <p className={css.save}>{t('plans.save', { n: termSavingPercent(id, currency) })}</p>}
              <ul className={css.features}>
                {Array.from({ length: featureCount[id] }, (_, i) => (
                  <li key={i}>{t(`plans.f.${id}.${i + 1}` as 'plans.f.free.1', { slide: FREE_TRIAL.slide, story: FREE_TRIAL.story, n: consult(id) })}</li>
                ))}
              </ul>
              {id === 'free' && usage && usage.plan === 'free' && usage.slide.limit != null && usage.story.limit != null && (
                <p className={css.mine}>{t('plans.mine', {
                  slide: Math.max(0, usage.slide.limit - usage.slide.used), slideLimit: usage.slide.limit,
                  story: Math.max(0, usage.story.limit - usage.story.used), storyLimit: usage.story.limit,
                })}</p>
              )}
              {isPaid && (
                sent === id ? <p className={css.thanks} role="status">{t('plans.thanks')}</p>
                : asking === id ? (
                  <div className={css.feel}>
                    <p>{t('plans.feel.q')}</p>
                    <div className={css.feelRow}>
                      {FEELS.map((f) => <button key={f} type="button" disabled={busy} onClick={() => void send(id, f)}>{t(`plans.feel.${f}`)}</button>)}
                    </div>
                    <button type="button" className={css.skip} disabled={busy} onClick={() => void send(id, null)}>{t('plans.feel.skip')}</button>
                  </div>
                ) : loggedIn ? (
                  <button type="button" className={css.cta} onClick={() => { setAsking(id); setError(false); }}>{t('plans.cta')}</button>
                ) : (
                  <Link href="/start" className={css.cta}>{t('plans.cta.join')}</Link>
                )
              )}
            </section>
          );
        })}
      </div>
      {error && <p className={css.error} role="alert">{t('plans.error')}</p>}
      <p className={css.small}>{t('plans.notCharged')}</p>
      {currency === 'EUR' && EUR_PROVISIONAL && <p className={css.small}>{t('plans.eur')}</p>}
      <p className={css.small}>{t('plans.tax')}</p>
    </div>
  );
}
