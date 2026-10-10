'use client';

import { useEffect, useState } from 'react';
import { useT, type MessageKey } from '@/i18n/ui';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { listPublicReviews, reviewerName, type PublicReview } from '@/lib/repo/reviews';
import { openShare } from '@/lib/reviewEvents';
import css from './landing.module.css';

/** 使ってくださった方の声。本人が公開に同意し、運営が選んだものだけ。1件も無ければ何も出さない */
export function PublicReviews() {
  const t = useT();
  const [rows, setRows] = useState<PublicReview[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let alive = true;
    void listPublicReviews(createClient(), 9).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, []);
  if (!rows.length) return null;
  return (
    <section className={css.section} id="voices" aria-labelledby="voices-title">
      <div className={css.inner}>
        <p className={css.index}>VOICES</p>
        <h2 id="voices-title" className={css.h2}>{t('landing.voices.title')}</h2>
        <ul className={css.voices}>
          {rows.map((r) => (
            <li key={r.id} className={css.voice}>
              <span className={css.voiceStars} role="img" aria-label={t('review.starN', { n: r.rating })}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              {r.comment && <p className={css.voiceText}>{r.comment}</p>}
              <p className={css.voiceName}>
                {reviewerName(r.name) ?? (r.occupation ? t('review.byOccupation', { occupation: t(`beta.survey.occupation.${r.occupation}` as MessageKey) }) : t('review.byUser'))}
              </p>
            </li>
          ))}
        </ul>
        <p className={css.voiceNote}>{t('landing.voices.note')}</p>
        <button type="button" className={css.textLink} onClick={() => openShare()}>{t('share.service.open')}</button>
      </div>
    </section>
  );
}
