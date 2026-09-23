'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import type { Auth } from '@/lib/supabase/useSession';
import css from './builder.module.css';

/** ヘッダー右のログイン表示。メールのリンクでログインする（パスワードなし） */
export function AccountMenu({ auth }: { auth: Auth }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' });

  if (!auth.enabled || auth.session === undefined) return null;

  if (auth.session) {
    return (
      <div className={css.account}>
        <span className={css.accountEmail}>{auth.session.user.email}</span>
        <button type="button" className="btn" onClick={() => auth.signOut()}>{t('account.signOut')}</button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    try {
      await auth.sendLink(email.trim());
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className={css.account}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('account.signIn')}</button>
      {open && (
        <div className={css.popover} role="dialog" aria-label={t('account.signIn')}>
          {status.kind === 'sent' ? (
            <p className={css.note}>{t('account.linkSent', { email })}</p>
          ) : (
            <form onSubmit={submit}>
              <label className={css.field}>
                <span>{t('account.email')}</span>
                <input className={css.input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button type="submit" className={css.primary} disabled={status.kind === 'sending'}>
                {status.kind === 'sending' ? t('account.sending') : t('account.sendLink')}
              </button>
              {status.kind === 'error' && <p className={css.error} role="alert">{t('account.error', { message: status.message ?? '' })}</p>}
            </form>
          )}
          <button type="button" className={css.linkBtn} onClick={() => setOpen(false)}>{t('account.close')}</button>
        </div>
      )}
    </div>
  );
}
