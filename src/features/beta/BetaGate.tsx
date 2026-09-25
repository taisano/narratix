'use client';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useT } from '@/i18n/ui';
import { CONSENT_KEY, FREE_CONSULT_PER_MONTH, FREE_PPT_PER_MONTH } from '@/lib/repo/beta';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import css from '../ui.module.css';
import g from './beta.module.css';

/**
 * ベータ版の入口：登録（メールのリンク＋同意）した人だけ中身を出す。
 * Supabase が未設定の手元の開発では、そのまま中身を出す。
 */
export function BetaGate({ children, reason }: { children: ReactNode; reason: 'editor' | 'consult' | 'myPage' | 'join' }) {
  const t = useT();
  const beta = useBetaAccess();
  const s = beta.state;
  if (s.kind === 'off' || s.kind === 'active') return <>{children}</>;
  return (
    <div className={g.wrap}>
      <section className={g.card} aria-labelledby="beta-title">
        <span className={g.pill}>{t('beta.badge')}</span>
        <h2 id="beta-title" className={g.title}>{s.kind === 'waitlist' ? t('beta.waitlistTitle') : t(`beta.title.${reason}`)}</h2>
        {s.kind === 'loading' && <p className={css.note}>{t('my.loading')}</p>}
        {s.kind === 'error' && <p className={css.error} role="alert">{t('beta.error', { message: s.message })}</p>}
        {s.kind === 'waitlist' && <p className={g.lead}>{t('beta.waitlist')}</p>}
        {(s.kind === 'anon' || s.kind === 'none') && (
          <>
            <p className={g.lead}>{t('beta.lead')}</p>
            <ul className={g.list}>
              <li>{t('beta.free.consult', { n: FREE_CONSULT_PER_MONTH })}</li>
              <li>{t('beta.free.ppt', { n: FREE_PPT_PER_MONTH })}</li>
              <li>{t('beta.free.save')}</li>
            </ul>
            <SignUp signedIn={s.kind === 'none'} />
          </>
        )}
        <p className={g.back}><Link href="/start" className={css.linkBtn}>{t('beta.backToStart')}</Link></p>
      </section>
    </div>
  );
}

/** Supabase のエラーを、画面の言葉に */
export function authErrorKey(message: string): 'auth.err.invalid' | 'auth.err.exists' | 'auth.err.weak' | 'auth.err.rate' | null {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'auth.err.invalid';
  if (m.includes('already registered') || m.includes('already exists')) return 'auth.err.exists';
  if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return 'auth.err.weak';
  if (m.includes('rate limit') || m.includes('too many')) return 'auth.err.rate';
  return null;
}

export const MIN_PASSWORD = 8;

/**
 * 登録（未ログイン）：メールアドレス（2回）・パスワード・同意 → そのままログインして登録。
 * ログイン済みで未登録なら同意だけ。すでに登録した人は「ログイン」に切り替える。
 */
function SignUp({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const auth = useAuth();
  const beta = useBetaAccess();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [email2, setEmail2] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [optIn, setOptIn] = useState(true);
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'confirm' | 'error'; message?: string }>({ kind: 'idle' });
  const mismatch = mode === 'signup' && !signedIn && email2.trim() !== '' && email.trim().toLowerCase() !== email2.trim().toLowerCase();
  const short = password !== '' && password.length < MIN_PASSWORD;

  const fail = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    const key = authErrorKey(msg);
    setStatus({ kind: 'error', message: key ? t(key, { n: MIN_PASSWORD }) : t('account.error', { message: msg }) });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    try {
      if (signedIn) { await beta.join(optIn); setStatus({ kind: 'idle' }); return; }
      if (mode === 'signin') { await auth.signIn(email.trim(), password); setStatus({ kind: 'idle' }); return; }
      if (!agree || mismatch || password.length < MIN_PASSWORD) { setStatus({ kind: 'idle' }); return; }
      // ログインした後に登録できるよう、同意を覚えておく（メール確認がオンのままの時にも使う）
      try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ agree: true, optIn })); } catch { /* 戻った時にもう一度聞く */ }
      const r = await auth.signUp(email.trim(), password);
      setStatus(r.needsConfirm ? { kind: 'confirm' } : { kind: 'idle' });
    } catch (err) { fail(err); }
  }

  if (status.kind === 'confirm') return <p className={g.sent} role="status">{t('beta.linkSent', { email })}</p>;
  const busy = status.kind === 'sending';
  return (
    <form className={g.form} onSubmit={submit}>
      {!signedIn && (
        <div className={g.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={g.tab} onClick={() => { setMode('signup'); setStatus({ kind: 'idle' }); }}>{t('beta.tabSignup')}</button>
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={g.tab} onClick={() => { setMode('signin'); setStatus({ kind: 'idle' }); }}>{t('beta.tabSignin')}</button>
        </div>
      )}
      {!signedIn && (
        <>
          <label className={css.field}>
            <span>{t('account.email')}</span>
            <input className={css.input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode === 'signup' && (
            <label className={css.field}>
              <span>{t('beta.email2')}</span>
              <input className={css.input} type="email" required autoComplete="off" value={email2} onChange={(e) => setEmail2(e.target.value)} onPaste={(e) => e.preventDefault()} />
              {mismatch && <span className={g.warn}>{t('beta.emailMismatch')}</span>}
            </label>
          )}
          <label className={css.field}>
            <span>{t('account.password')}</span>
            <input className={css.input} type="password" required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <span className={g.small}>{short ? <span className={g.warn}>{t('auth.err.weak', { n: MIN_PASSWORD })}</span> : t('beta.passwordNote', { n: MIN_PASSWORD })}</span>}
          </label>
        </>
      )}
      {(signedIn || mode === 'signup') && (
        <>
          <label className={g.check}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <span>{t('beta.agree')}<span className={g.req}>{t('beta.required')}</span></span>
          </label>
          <details className={g.terms}>
            <summary>{t('beta.termsSummary')}</summary>
            <ul>
              {(['t1', 't2', 't3', 't4', 't5'] as const).map((k) => <li key={k}>{t(`beta.terms.${k}`)}</li>)}
            </ul>
          </details>
          <label className={g.check}>
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>{t('beta.optIn')}<span className={g.opt}>{t('beta.optional')}</span></span>
          </label>
        </>
      )}
      <button type="submit" className={css.primary} disabled={busy || (!signedIn && (!email.trim() || !password)) || ((signedIn || mode === 'signup') && !agree) || mismatch || (mode === 'signup' && !signedIn && short)}>
        {busy ? t('account.sending') : signedIn ? t('beta.join') : mode === 'signup' ? t('beta.signup') : t('beta.signin')}
      </button>
      {!signedIn && mode === 'signin' && <ForgotPassword email={email} />}
      {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
    </form>
  );
}

/** パスワードを忘れた時：設定し直すリンクをメールで送る */
export function ForgotPassword({ email }: { email: string }) {
  const t = useT();
  const auth = useAuth();
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  if (state === 'sent') return <p className={g.small} role="status">{t('auth.resetSent', { email })}</p>;
  return (
    <p className={g.small}>
      <button type="button" className={css.linkBtn} disabled={!email.trim()} onClick={async () => {
        try { await auth.sendReset(email.trim()); setState('sent'); }
        catch (e) { const m = (e as Error).message ?? ''; const k = authErrorKey(m); setMsg(k ? t(k, { n: MIN_PASSWORD }) : m); setState('error'); }
      }}>{t('auth.forgot')}</button>
      {!email.trim() && <span> {t('auth.forgotNeedEmail')}</span>}
      {state === 'error' && <span className={g.warn}> {msg}</span>}
    </p>
  );
}
