'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { REVIEW_COMMENT_MAX, REVIEW_NICK_MAX, deleteMyReview, getMyReview, submitReview, type MyReview } from '@/lib/repo/reviews';
import { useAuth } from '../shell/AppShell';
import fb from '../feedback/feedback.module.css';
import css from './reviews.module.css';

/** 星5つ（ラジオ）。選んだ値を返す */
export function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const t = useT();
  return (
    <div className={css.stars} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t('review.starN', { n })}
          className={`${css.star} ${n <= value ? css.on : ''}`} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

/** レビューの入力（星・コメント・ニックネーム・公開してよいか）。すでに書いた人は書き直せる */
export function ReviewDialog({ initialRating, onClose }: { initialRating?: number; onClose: () => void }) {
  const t = useT();
  const auth = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const uid = auth.session?.user.id ?? null;
  const [existing, setExisting] = useState<MyReview | null>(null);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [comment, setComment] = useState('');
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'done' | 'deleted' | 'error'; message?: string }>({ kind: 'idle' });
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (!auth.client || !uid) return;
    let alive = true;
    getMyReview(auth.client, uid).then((r) => {
      if (!alive || !r) return;
      setExisting(r); setRating(r.rating); setComment(r.comment); setNickname(r.nickname); setConsent(r.publishConsent);
    }).catch(() => { /* 読めなかった時は、新しく書く */ });
    return () => { alive = false; };
  }, [auth.client, uid]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!auth.client || rating < 1) return;
    setStatus({ kind: 'sending' });
    try {
      await submitReview(auth.client, { rating, comment: comment.trim(), nickname: nickname.trim(), publishConsent: consent });
      setStatus({ kind: 'done' });
    } catch (err) {
      setStatus({ kind: 'error', message: t('review.failed', { message: (err as Error).message }) });
    }
  }
  async function remove() {
    if (!auth.client) return;
    setStatus({ kind: 'sending' });
    try { await deleteMyReview(auth.client); setStatus({ kind: 'deleted' }); } catch (err) { setStatus({ kind: 'error', message: t('review.failed', { message: (err as Error).message }) }); }
  }

  return (
    <dialog ref={ref} className={fb.dialog} onClose={onClose} aria-labelledby="rv-title">
      {status.kind === 'done' || status.kind === 'deleted' ? (
        <div className={fb.done}>
          <h2 id="rv-title" className={fb.title}>{t(status.kind === 'done' ? 'review.thanksTitle' : 'review.deletedTitle')}</h2>
          {status.kind === 'done' && <p className={fb.note}>{t(consent ? 'review.thanksConsent' : 'review.thanks')}</p>}
          <div className={fb.buttons}><button type="button" className={fb.primary} onClick={() => ref.current?.close()}>{t('account.close')}</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className={fb.form}>
          <h2 id="rv-title" className={fb.title}>{t('review.title')}</h2>
          <p className={fb.note}>{t('review.lead')}</p>
          <div className={fb.field}>
            <span>{t('review.rating')}</span>
            <StarPicker value={rating} onChange={setRating} label={t('review.rating')} />
          </div>
          <label className={fb.field}>
            <span>{t('review.comment')}<small> {t('beta.optional')}</small></span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={REVIEW_COMMENT_MAX} rows={4} placeholder={t('review.commentPlaceholder')} />
            <small className={fb.count}>{comment.length} / {REVIEW_COMMENT_MAX}</small>
          </label>
          <label className={fb.field}>
            <span>{t('review.nickname')}<small> {t('beta.optional')}</small></span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={REVIEW_NICK_MAX} autoComplete="off" placeholder={t('review.nicknamePlaceholder')} />
            <small className={fb.hint}>{t('review.nicknameHint')}</small>
          </label>
          <label className={css.check}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t('review.consent')}<small className={fb.hint} style={{ display: 'block' }}>{t('review.consentNote')}</small></span>
          </label>
          {existing?.published && <p className={css.published}>{t('review.nowPublished')}</p>}
          {status.kind === 'error' && <p className={fb.error} role="alert">{status.message}</p>}
          <div className={fb.buttons}>
            {existing && <button type="button" className={css.danger} onClick={remove} disabled={status.kind === 'sending'}>{t('review.delete')}</button>}
            <button type="button" className={fb.secondary} onClick={() => ref.current?.close()}>{t('save.cancel')}</button>
            <button type="submit" className={fb.primary} disabled={rating < 1 || status.kind === 'sending'}>{status.kind === 'sending' ? t('feedback.sending') : t(existing ? 'review.update' : 'review.send')}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
