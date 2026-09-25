'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { useAuth } from '../shell/AppShell';
import { MIN_PASSWORD, authErrorKey } from './BetaGate';
import css from '../ui.module.css';
import g from './beta.module.css';

/** パスワードの設定・変更（メールのリンクで登録した人、パスワードを忘れてリンクから来た人） */
export function SetPassword() {
  const t = useT();
  const auth = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'done' | 'error'; message?: string }>({ kind: 'idle' });
  const mismatch = pw2 !== '' && pw !== pw2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD || mismatch) return;
    setStatus({ kind: 'sending' });
    try { await auth.setPassword(pw); setStatus({ kind: 'done' }); }
    catch (err) { const m = err instanceof Error ? err.message : String(err); const k = authErrorKey(m); setStatus({ kind: 'error', message: k ? t(k, { n: MIN_PASSWORD }) : t('account.error', { message: m }) }); }
  }

  return (
    <div className={g.wrap}>
      <section className={g.card}>
        <h2 className={g.title}>{t('auth.setPasswordTitle')}</h2>
        {auth.session === undefined ? <p className={css.note}>{t('my.loading')}</p>
          : !auth.session ? <p className={g.lead}>{t('auth.setPasswordSignedOut')}</p>
          : status.kind === 'done' ? (
            <p className={g.sent} role="status">{t('auth.passwordSaved')} <Link href="/" className={css.linkBtn}>{t('auth.toEditor')}</Link></p>
          ) : (
            <form className={g.form} onSubmit={submit}>
              <p className={g.lead}>{t('auth.setPasswordLead', { email: auth.session.user.email ?? '' })}</p>
              <label className={css.field}>
                <span>{t('auth.newPassword')}</span>
                <input className={css.input} type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
                <span className={g.small}>{pw && pw.length < MIN_PASSWORD ? <span className={g.warn}>{t('auth.err.weak', { n: MIN_PASSWORD })}</span> : t('beta.passwordNote', { n: MIN_PASSWORD })}</span>
              </label>
              <label className={css.field}>
                <span>{t('auth.newPassword2')}</span>
                <input className={css.input} type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                {mismatch && <span className={g.warn}>{t('auth.passwordMismatch')}</span>}
              </label>
              <button type="submit" className={css.primary} disabled={status.kind === 'sending' || pw.length < MIN_PASSWORD || mismatch || !pw2}>{t('auth.savePassword')}</button>
              {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
            </form>
          )}
      </section>
    </div>
  );
}
