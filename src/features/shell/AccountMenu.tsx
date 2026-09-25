'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import type { Auth } from '@/lib/supabase/useSession';
import { ForgotPassword, MIN_PASSWORD, authErrorKey } from '../beta/BetaGate';
import css from '../ui.module.css';

/** ヘッダー右のログイン表示。メール＋パスワードでログインする。はじめての人は無料登録へ */
export function AccountMenu({ auth }: { auth: Auth }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'error'; message?: string }>({ kind: 'idle' });

  if (!auth.enabled || auth.session === undefined) return null;

  if (auth.session) {
    return (
      <div className={css.account}>
        <span className={css.accountEmail}>{auth.session.user.email}</span>
        <Link href="/account/password" className={css.linkBtn}>{t('auth.setPassword')}</Link>
        <button type="button" className="btn" onClick={() => auth.signOut()}>{t('account.signOut')}</button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    try {
      await auth.signIn(email.trim(), password);
      setStatus({ kind: 'idle' });
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const key = authErrorKey(msg);
      setStatus({ kind: 'error', message: key ? t(key, { n: MIN_PASSWORD }) : t('account.error', { message: msg }) });
    }
  }
  const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';

  return (
    <div className={css.account}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('account.signIn')}</button>
      {open && (
        <div className={css.popover} role="dialog" aria-label={t('account.signIn')}>
          <form onSubmit={submit}>
            <label className={css.field}>
              <span>{t('account.email')}</span>
              <input className={css.input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className={css.field}>
              <span>{t('account.password')}</span>
              <input className={css.input} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className={css.primary} disabled={status.kind === 'sending'}>
              {status.kind === 'sending' ? t('account.sending') : t('beta.signin')}
            </button>
            {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
          </form>
          <ForgotPassword email={email} />
          <p className={css.note}>{t('auth.newHere')} <Link href={`/join?next=${encodeURIComponent(here)}`} className={css.linkBtn} onClick={() => setOpen(false)}>{t('auth.toJoin')}</Link></p>
          <button type="button" className={css.linkBtn} onClick={() => setOpen(false)}>{t('account.close')}</button>
        </div>
      )}
    </div>
  );
}
