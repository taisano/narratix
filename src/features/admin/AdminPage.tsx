'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { localize, registry, type RecipeId } from '@/registry';
import { listBetaFeedback, listJourney, listRecFeedback, type BetaFeedbackRow, type JourneyRow, type RecFeedbackRow } from '@/lib/repo/admin';
import { JourneyPanel } from './JourneyPanel';
import { useAuth } from '../shell/AppShell';
import { useIsAdmin } from '../library/useIsAdmin';
import css from './admin.module.css';

/** 管理者の画面：提案へのフィードバック（相談文と提案）と、ベータのご意見。読むだけ */
export default function AdminPage() {
  const t = useT();
  const auth = useAuth();
  const admin = useIsAdmin();
  const [tab, setTab] = useState<'rec' | 'beta' | 'journey'>('rec');
  const [rec, setRec] = useState<RecFeedbackRow[] | null>(null);
  const [beta, setBeta] = useState<BetaFeedbackRow[] | null>(null);
  const [journey, setJourney] = useState<JourneyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!admin || !auth.client) return;
    listRecFeedback(auth.client).then(setRec).catch((e: Error) => setError(e.message));
    listBetaFeedback(auth.client).then(setBeta).catch((e: Error) => setError(e.message));
    listJourney(auth.client).then(setJourney).catch((e: Error) => setError(e.message));
  }, [admin, auth.client]);

  if (!admin) return <main className={css.wrap}><p>{t('admin.only')}</p></main>;
  return (
    <main className={css.wrap}>
      <h1 className={css.h1}>{t('admin.title')}</h1>
      <p className={css.lead}>{t('admin.lead')}</p>
      <div className={css.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'rec'} className={css.tab} onClick={() => setTab('rec')}>{t('admin.tabRec')}{rec ? `（${rec.length}）` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'beta'} className={css.tab} onClick={() => setTab('beta')}>{t('admin.tabBeta')}{beta ? `（${beta.length}）` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'journey'} className={css.tab} onClick={() => setTab('journey')}>{t('admin.tabJourney')}{journey ? `（${journey.length}）` : ''}</button>
      </div>
      {error && <p className={css.error} role="alert">{error}</p>}
      {tab === 'rec' ? <RecList rows={rec} /> : tab === 'beta' ? <BetaList rows={beta} /> : <JourneyPanel rows={journey} />}
    </main>
  );
}

const date = (iso: string) => new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

function RecList({ rows }: { rows: RecFeedbackRow[] | null }) {
  const t = useT();
  const locale = useLocale();
  const name = (id: string) => (registry.recipes[id as RecipeId] ? localize(registry.recipes[id as RecipeId].name, locale) : id);
  if (!rows) return <p>{t('my.loading')}</p>;
  if (!rows.length) return <p className={css.empty}>{t('admin.empty')}</p>;
  return (
    <ul className={css.list}>
      {rows.map((r) => (
        <li key={r.id} className={`${css.item} ${r.rating === 'down' ? css.down : ''}`}>
          <div className={css.meta}>
            <b>{r.rating === 'up' ? '👍' : '👎'}</b>
            <span>{date(r.created_at)}</span>
            <span>{t(`admin.entry.${r.entry_mode}` as MessageKey)}</span>
            <span>{r.classifier === 'ai' ? 'AI' : t('admin.rules')}</span>
            {r.classification?.primary_goal && <span>{r.classification.primary_goal}</span>}
          </div>
          {r.consultation_text && <blockquote className={css.quote}>{r.consultation_text}</blockquote>}
          <dl className={css.dl}>
            <div><dt>{t('admin.recommended')}</dt><dd>{r.recommended_recipe_ids.map(name).join(' ／ ') || '—'}</dd></div>
            <div><dt>{t('admin.chosen')}</dt><dd>{r.chosen_recipe_ids.map(name).join(' ／ ') || '—'}</dd></div>
            {r.reasons.length > 0 && <div><dt>{t('admin.reasons')}</dt><dd>{r.reasons.map((k) => t(`feedback.reason.${k}` as MessageKey)).join('、')}</dd></div>}
            {r.comment && <div><dt>{t('admin.comment')}</dt><dd>{r.comment}</dd></div>}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function BetaList({ rows }: { rows: BetaFeedbackRow[] | null }) {
  const t = useT();
  if (!rows) return <p>{t('my.loading')}</p>;
  if (!rows.length) return <p className={css.empty}>{t('admin.empty')}</p>;
  return (
    <ul className={css.list}>
      {rows.map((r) => (
        <li key={r.id} className={css.item}>
          <div className={css.meta}>
            <b>{t(`feedback.cat.${r.category}` as MessageKey)}</b>
            <span>{date(r.created_at)}</span>
            {r.page && <span>{r.page}</span>}
            {r.reply_email && <span>{t('admin.reply')}：<a href={`mailto:${r.reply_email}`}>{r.reply_email}</a></span>}
            <span>{r.notified ? t('admin.mailed') : t('admin.notMailed')}</span>
          </div>
          <p className={css.message}>{r.message}</p>
        </li>
      ))}
    </ul>
  );
}
