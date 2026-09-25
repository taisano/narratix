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
export function BetaGate({ children, reason }: { children: ReactNode; reason: 'editor' | 'consult' | 'myPage' }) {
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

/** 登録：メールアドレス（未ログインの時）と同意。ログイン済みなら同意だけで登録する */
function SignUp({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const auth = useAuth();
  const beta = useBetaAccess();
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [optIn, setOptIn] = useState(true);
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agree) return;
    setStatus({ kind: 'sending' });
    try {
      if (signedIn) {
        await beta.join(optIn);
        setStatus({ kind: 'idle' });
        return;
      }
      // メールのリンクで戻ってきた時に登録できるよう、同意を覚えておく
      try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ agree: true, optIn })); } catch { /* 戻った時にもう一度聞く */ }
      await auth.sendLink(email.trim(), window.location.pathname + window.location.search);
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (status.kind === 'sent') return <p className={g.sent} role="status">{t('beta.linkSent', { email })}</p>;
  return (
    <form className={g.form} onSubmit={submit}>
      {!signedIn && (
        <label className={css.field}>
          <span>{t('account.email')}</span>
          <input className={css.input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}
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
      <button type="submit" className={css.primary} disabled={!agree || status.kind === 'sending' || (!signedIn && !email.trim())}>
        {status.kind === 'sending' ? t('account.sending') : signedIn ? t('beta.join') : t('beta.sendLink')}
      </button>
      {!signedIn && <p className={g.small}>{t('beta.howLink')}</p>}
      {status.kind === 'error' && <p className={css.error} role="alert">{t('account.error', { message: status.message ?? '' })}</p>}
    </form>
  );
}
