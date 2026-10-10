'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LOCALES, type Locale } from '@/registry';
import { translate, useT } from '@/i18n/ui';
import type { Auth } from '@/lib/supabase/useSession';
import { deleteMyResearchData, readResearchOptIn, setEmailOptIn, setResearchOptIn } from '@/lib/repo/beta';
import { setJourneyContext } from '@/lib/journey/journey';
import { openReview, openShare } from '@/lib/reviewEvents';
import { useBetaAccess } from './AppShell';
import { useConfirm } from '../shared/Confirm';
import { FeedbackButton } from '../feedback/Feedback';
import css from '../ui.module.css';

/**
 * ヘッダー右の「設定／アカウント」：歯車1つにまとめる（言語・フィードバック・メールアドレス・パスワード・ログアウトを横に並べない）。
 * メニュー：メールアドレス（小さく）・画面の言語・パスワードを変更・フィードバックを送る・ログアウト
 */
export function SettingsMenu({ auth, locale, setLocale }: { auth: Auth; locale: Locale; setLocale: (l: Locale) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className={css.settings} ref={ref}>
      <button type="button" className={css.settingsBtn} aria-label={t('settings.open')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {open && (
        <div className={css.settingsMenu} role="menu">
          <SettingsItems auth={auth} locale={locale} setLocale={setLocale} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** 設定とアカウントの中身（歯車のメニューと、スマホのメニューの両方で使う） */
export function SettingsItems({ auth, locale, setLocale, onDone }: { auth: Auth; locale: Locale; setLocale: (l: Locale) => void; onDone: () => void }) {
  const t = useT();
  const session = auth.enabled ? auth.session : null;
  const beta = useBetaAccess();
  const confirm = useConfirm();
  const [research, setResearch] = useState<boolean | null>(null);
  const uid = session?.user.id ?? null;
  const optState = beta.state.kind === 'active' || beta.state.kind === 'waitlist' ? beta.state : null;
  const isMember = beta.state.kind === 'active' || beta.state.kind === 'waitlist';
  useEffect(() => {
    if (!auth.client || !uid || !isMember) { setResearch(null); return; }
    let cancelled = false;
    readResearchOptIn(auth.client, uid).then((v) => { if (!cancelled) setResearch(v); }).catch(() => { if (!cancelled) setResearch(null); });
    return () => { cancelled = true; };
  }, [auth.client, uid, isMember]);
  return (
    <>
          {session && <p className={css.settingsEmail}>{session.user.email}</p>}
          <div className={css.settingsGroup}>
            <span className={css.settingsLabel}>{t('app.uiLanguage')}</span>
            <div className={css.seg} role="group" aria-label={t('app.uiLanguage')}>
              {LOCALES.map((l) => (
                <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)}>{translate(locale, `locale.${l}`)}</button>
              ))}
            </div>
          </div>
          {optState && <button type="button" className={css.settingsItem} role="menuitem" onClick={() => { onDone(); openReview(); }}>{t('review.open')}</button>}
          <button type="button" className={css.settingsItem} role="menuitem" onClick={() => { onDone(); openShare(); }}>{t('share.service.open')}</button>
          <FeedbackButton className={css.settingsItem} source="header" label={t('settings.feedback')} />
          {session && (
            <details className={css.settingsMore}>
              <summary className={css.settingsItem}>{t('settings.account')}</summary>
              <div className={css.settingsMoreBody}>
                <Link href="/account/password" className={css.settingsItem} role="menuitem" onClick={() => onDone()}>{t('auth.setPassword')}</Link>
                {optState && auth.client && (
                  <label className={css.settingsCheck}>
                    <input type="checkbox" checked={optState.emailOptIn} onChange={async (e) => { try { await setEmailOptIn(auth.client!, e.target.checked); await beta.refresh(); } catch { /* 変えられなかった時は今のまま */ } }} />
                    <span>{t('settings.emailOptIn')}</span>
                  </label>
                )}
                {research !== null && auth.client && (
                  <label className={css.settingsCheck}>
                    <input type="checkbox" checked={research} onChange={async (e) => { const v = e.target.checked; try { await setResearchOptIn(auth.client!, v); setResearch(v); setJourneyContext(auth.client, v); } catch { /* 変えられなかった時は今のまま */ } }} />
                    <span>{t('settings.research')}</span>
                  </label>
                )}
                {research !== null && auth.client && (
                  <button type="button" className={css.settingsItem} role="menuitem" onClick={async () => {
                    const ok = await confirm({ title: t('settings.researchDelete.title'), body: t('settings.researchDelete.body'), ok: t('settings.researchDelete.ok'), danger: true });
                    if (!ok) return;
                    try { await deleteMyResearchData(auth.client!); setResearch(false); setJourneyContext(auth.client, false); } catch { /* 消せなかった時は今のまま */ }
                  }}>{t('settings.researchDelete')}</button>
                )}
              </div>
            </details>
          )}
          {session && <button type="button" className={css.settingsItem} role="menuitem" onClick={() => { onDone(); void auth.signOut(); }}>{t('account.signOut')}</button>}
    </>
  );
}
