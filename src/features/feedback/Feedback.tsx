'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX, type FeedbackCategory } from '@/lib/feedback/server';
import { useAuth } from '../shell/AppShell';
import css from './feedback.module.css';

/**
 * 「フィードバックを送る」ボタンとフォーム（どの画面からでも）。
 * 送るのは：種類・内容・返信先（任意）・今の画面のパス・画面の言語。データや相談文は自動では付けない。
 */
export function FeedbackButton({ className, source, label }: { className?: string; source?: string; label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} data-source={source} onClick={() => setOpen(true)}>{label ?? t('feedback.open')}</button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState(auth.session?.user.email ?? '');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'done' | 'error'; message?: string }>({ kind: 'idle' });
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!category || !message.trim()) return;
    setStatus({ kind: 'sending' });
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth.session?.access_token ? { Authorization: `Bearer ${auth.session.access_token}` } : {}) },
        body: JSON.stringify({ category, message: message.trim(), replyEmail: reply.trim(), page: window.location.pathname.slice(0, 300), locale, website }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (j?.ok) setStatus({ kind: 'done' });
      else setStatus({ kind: 'error', message: t(j?.reason === 'too_many' ? 'feedback.tooMany' : j?.reason === 'bad_input' ? 'feedback.badInput' : 'feedback.failed') });
    } catch {
      setStatus({ kind: 'error', message: t('feedback.failed') });
    }
  }

  return (
    <dialog ref={ref} className={css.dialog} onClose={onClose} aria-labelledby="fb-title">
      {status.kind === 'done' ? (
        <div className={css.done}>
          <h2 id="fb-title" className={css.title}>{t('feedback.thanksTitle')}</h2>
          <p className={css.note}>{t('feedback.thanks')}</p>
          <div className={css.buttons}><button type="button" className={css.primary} onClick={() => ref.current?.close()}>{t('account.close')}</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className={css.form}>
          <h2 id="fb-title" className={css.title}>{t('feedback.title')}</h2>
          <p className={css.note}>{t('feedback.lead')}</p>
          <fieldset className={css.cats}>
            <legend>{t('feedback.category')}</legend>
            {FEEDBACK_CATEGORIES.map((c) => (
              <label key={c} className={css.cat}>
                <input type="radio" name="fb-cat" value={c} checked={category === c} onChange={() => setCategory(c)} required />
                <span>{t(`feedback.cat.${c}`)}</span>
              </label>
            ))}
          </fieldset>
          <label className={css.field}>
            <span>{t('feedback.message')}</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={FEEDBACK_MAX} rows={6} required placeholder={t('feedback.placeholder')} />
            <small className={css.count}>{message.length} / {FEEDBACK_MAX}</small>
          </label>
          <label className={css.field}>
            <span>{t('feedback.reply')}</span>
            <input type="email" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={254} autoComplete="email" placeholder="you@example.com" />
            <small className={css.hint}>{t('feedback.replyHint')}</small>
          </label>
          {/* ロボット除け（人には見えない） */}
          <label className={css.hp} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          <p className={css.hint}>{t('feedback.privacy')}</p>
          {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
          <div className={css.buttons}>
            <button type="button" className={css.secondary} onClick={() => ref.current?.close()}>{t('save.cancel')}</button>
            <button type="submit" className={css.primary} disabled={!category || !message.trim() || status.kind === 'sending'}>{status.kind === 'sending' ? t('feedback.sending') : t('feedback.send')}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
