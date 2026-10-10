'use client';

import { useEffect, useState } from 'react';
import { useT, type MessageKey } from '@/i18n/ui';
import { averageRating, listAllReviews, setReviewPublished, type AdminReview } from '@/lib/repo/reviews';
import { useAuth } from '../shell/AppShell';
import css from './admin.module.css';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const date = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { dateStyle: 'medium' });

/** レビュー：全件を読み、公開／非公開と表示順を選ぶ。公開できるのは本人が公開に同意したものだけ */
export function ReviewsPanel() {
  const t = useT();
  const auth = useAuth();
  const [rows, setRows] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!auth.client) return;
    listAllReviews(auth.client).then(setRows).catch((e: Error) => setError(e.message));
  }, [auth.client]);

  async function change(r: AdminReview, published: boolean, sort: number) {
    if (!auth.client) return;
    setError(null);
    try {
      await setReviewPublished(auth.client, r.id, published, sort);
      setRows((cur) => (cur ?? []).map((x) => (x.id === r.id ? { ...x, published, sort } : x)));
    } catch (e) { setError((e as Error).message); }
  }

  if (!rows) return error ? <p className={css.error} role="alert">{error}</p> : <p>{t('my.loading')}</p>;
  if (!rows.length) return <p className={css.empty}>{t('admin.rv.empty')}</p>;
  const avg = averageRating(rows);
  const published = rows.filter((r) => r.published).length;
  return (
    <div>
      <p className={css.lead}>{t('admin.rv.lead', { n: rows.length, avg: avg.toFixed(1), published })}</p>
      <p className={css.note}>{t('admin.rv.rule')}</p>
      {error && <p className={css.error} role="alert">{error}</p>}
      <ul className={css.list}>
        {rows.map((r) => (
          <li key={r.id} className={css.item}>
            <div className={css.meta}>
              <b style={{ color: '#c98a00', letterSpacing: 1 }}>{stars(r.rating)}</b>
              <span>{r.nickname || (r.occupation ? t(`beta.survey.occupation.${r.occupation}` as MessageKey) : t('admin.j.unknown'))}</span>
              <span>{date(r.updated_at)}</span>
              <span>{r.publish_consent ? t('admin.rv.consentYes') : t('admin.rv.consentNo')}</span>
            </div>
            {r.comment ? <p className={css.message}>{r.comment}</p> : <p className={css.empty}>{t('admin.rv.noComment')}</p>}
            <div className={css.rvRow}>
              <label>
                <input type="checkbox" checked={r.published} disabled={!r.publish_consent} onChange={(e) => change(r, e.target.checked, r.sort)} /> {t('admin.rv.publish')}
              </label>
              <label>{t('admin.rv.sort')}
                <input type="number" className={css.sortInput} defaultValue={r.sort} min={-999} max={999}
                  onBlur={(e) => { const n = Math.max(-999, Math.min(999, Math.round(Number(e.target.value) || 0))); if (n !== r.sort) void change(r, r.published, n); }} />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
