'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { PLAN_NAMES } from '@/lib/ai/plans';
import { interestSourceOf, type PlanReason } from '@/lib/planEvents';
import { CURRENCIES, PLAN_MATRIX, PRICES, currencyOfLocale, formatPrice, termSavingPercent, type Billing, type Currency, type PaidPlan, type PlanSpec } from '@/lib/pricing';
import { recordPlanInterest, type PriceFeel } from '@/lib/repo/plans';
import { useAuth } from '../shell/AppShell';
import { InfoTip } from './InfoTip';
import { useMakeUsage } from './useMakeUsage';
import css from './plans.module.css';

const FEELS: readonly PriceFeel[] = ['high', 'fair', 'low'];
const IDS = ['free', 'pro', 'team'] as const;
type Id = (typeof IDS)[number];

type T = (k: MessageKey, p?: Record<string, string | number>) => string;
/** span＝縦に結合する行数（スライド作成の2行は、上限が合計なので1つのセルにする） */
type Row = { key: string; label: MessageKey; tip: MessageKey; cell: (s: PlanSpec, t: T) => ReactNode; span?: number; skip?: boolean };
const mark = (on: boolean, t: T) => on
  ? <span className={css.yes} role="img" aria-label={t('plans.v.included')}>✓</span>
  : <span className={css.no} role="img" aria-label={t('plans.v.notIncluded')}>—</span>;
const count = (n: number | null, key: MessageKey, t: T) => (n == null ? t('plans.v.unlimited') : t(key, { n }));
const combined = (s: PlanSpec, t: T) => <><span className={css.nowrap}>{count(s.slides, 'plans.v.sheets', t)}</span><small className={css.combined}>{t('plans.v.combined')}</small></>;

/** 比較表の行。AI がすすめる機能（AIコーチ）と、自分で選んで作る機能（スライド作成）を分ける。説明は表に出さず、ⓘ から開く */
const GROUPS: { title: MessageKey; rows: Row[] }[] = [
  { title: 'plans.g.ai', rows: [
    { key: 'consult', label: 'plans.r.consult', tip: 'plans.tip.consult', cell: (s, t) => t(s.consult.per === 'total' ? 'plans.v.total' : 'plans.v.times', { n: s.consult.n }) },
    { key: 'story', label: 'plans.r.story', tip: 'plans.tip.story', cell: (s, t) => mark(s.story, t) },
    { key: 'coach', label: 'plans.r.coach', tip: 'plans.tip.coach', cell: (s, t) => mark(s.coach, t) },
  ] },
  { title: 'plans.g.make', rows: [
    { key: 'purpose', label: 'plans.r.purpose', tip: 'plans.tip.purpose', cell: combined, span: 2 },
    { key: 'chart', label: 'plans.r.chart', tip: 'plans.tip.chart', cell: combined, skip: true },
  ] },
  { title: 'plans.g.out', rows: [
    { key: 'exports', label: 'plans.r.exports', tip: 'plans.tip.exports', cell: (s, t) => count(s.exports, 'plans.v.times', t) },
    { key: 'watermark', label: 'plans.r.watermark', tip: 'plans.tip.watermark', cell: (s, t) => t(s.watermark ? 'plans.v.on' : 'plans.v.off') },
  ] },
  { title: 'plans.g.more', rows: [
    { key: 'early', label: 'plans.r.early', tip: 'plans.tip.early', cell: (s, t) => mark(s.earlyAccess, t) },
  ] },
];

/**
 * プランの比較表（ダイアログと /pricing で共通）。決済はまだない。
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
  const plan: Id = usage?.plan ?? 'free';

  async function send(p: PaidPlan, feel: PriceFeel | null) {
    if (!auth.client) return;
    setBusy(true); setError(false);
    try {
      await recordPlanInterest(auth.client, { plan: p, billing, currency, feel, source: interestSourceOf(reason) });
      setSent(p); setAsking(null);
    } catch { setError(true); } finally { setBusy(false); }
  }
  const price = (p: PaidPlan) => formatPrice(PRICES[currency][p][billing], currency, locale);
  const tt = t as T;

  const head = (id: Id) => {
    const isPaid = id !== 'free';
    const current = !!usage && plan === id;
    return (
      <th key={id} scope="col" className={css.colHead} data-plan={id} data-current={current || undefined}>
        <span className={css.name}>{PLAN_NAMES[id][locale === 'ja' ? 'ja' : 'en']}{current && <span className={css.badge}>{t('plans.current')}</span>}</span>
        <span className={css.price}>
          {isPaid ? <><strong>{price(id)}</strong><span>{t('plans.perMonth')}</span></> : <strong>{t('plans.free.price')}</strong>}
        </span>
        {isPaid && billing === 'term' && <span className={css.save}>{t('plans.save', { n: termSavingPercent(id, currency) })}</span>}
        {id === 'free' && !loggedIn && <Link href="/start" className={css.cta}>{t('plans.cta.register')}</Link>}
        {isPaid && (
          sent === id ? <span className={css.thanks} role="status">{t('plans.thanks')}</span>
          : asking === id ? (
            <span className={css.feel}>
              <span className={css.feelQ}>{t('plans.feel.q')}</span>
              <span className={css.feelRow}>
                {FEELS.map((f) => <button key={f} type="button" disabled={busy} onClick={() => void send(id, f)}>{t(`plans.feel.${f}`)}</button>)}
              </span>
              <button type="button" className={css.skip} disabled={busy} onClick={() => void send(id, null)}>{t('plans.feel.skip')}</button>
            </span>
          ) : loggedIn ? (
            <button type="button" className={css.cta} onClick={() => { setAsking(id); setError(false); }}>{t('plans.cta')}</button>
          ) : (
            <Link href="/start" className={css.cta}>{t('plans.cta.join')}</Link>
          )
        )}
      </th>
    );
  };

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
      <div className={css.tableWrap}>
        <table className={css.matrix}>
          <caption className={css.srOnly}>{t('plans.caption')}</caption>
          <thead><tr><td className={css.corner} />{IDS.map(head)}</tr></thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr className={css.group}><th scope="colgroup" colSpan={4}>{t(g.title)}</th></tr>
              {g.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className={css.rowHead}>
                    <span className={css.nowrap}>{t(r.label)}</span>
                    <InfoTip label={t(r.label)} text={t(r.tip)} />
                  </th>
                  {!r.skip && IDS.map((id) => <td key={id} rowSpan={r.span} data-current={usage && plan === id ? true : undefined}>{r.cell(PLAN_MATRIX[id], tt)}</td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {usage && usage.slide.limit != null && usage.export.limit != null && (
        <p className={css.mine}>{t('plans.mine', {
          slide: Math.max(0, usage.slide.limit - usage.slide.used), slideLimit: usage.slide.limit,
          export: Math.max(0, usage.export.limit - usage.export.used), exportLimit: usage.export.limit,
        })}</p>
      )}
      {error && <p className={css.error} role="alert">{t('plans.error')}</p>}
      <p className={css.small}>{t('plans.notCharged')}</p>
      <p className={css.small}>{t('plans.note.reset')}</p>
      <p className={css.small}>{t('plans.fair')}</p>
    </div>
  );
}
