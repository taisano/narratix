'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import type { Locale } from '@/registry';
import type { Auth } from '@/lib/supabase/useSession';
import { AccountMenu } from './AccountMenu';
import { SettingsItems } from './SettingsMenu';
import css from '../ui.module.css';

/**
 * スマホ（幅640px以下）の共通ヘッダー用メニュー：ロゴとこのボタンだけの1段にして、
 * ナビ・設定・アカウントはここ（右から出るパネル）へまとめる。
 * 閉じ方：閉じるボタン・外側を押す・Esc。開いている間は背景をスクロールさせない。
 */
export function MobileMenu({ nav, pathname, auth, locale, setLocale }: {
  nav: { href: string; label: string }[]; pathname: string; auth: Auth; locale: Locale; setLocale: (l: Locale) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const btn = btnRef.current;
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); btn?.focus(); };
  }, [open]);
  // 画面を移ったら閉じる
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <button ref={btnRef} type="button" className={css.menuBtn} aria-label={t('app.menu')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <div className={css.menuLayer}>
          <div className={css.menuBackdrop} onClick={close} aria-hidden="true" />
          <div ref={panelRef} className={css.menuPanel} role="dialog" aria-modal="true" aria-label={t('app.menu')}>
            <div className={css.menuHead}>
              <b>{t('app.menu')}</b>
              <button type="button" className={css.menuClose} aria-label={t('account.close')} onClick={close}>×</button>
            </div>
            <nav className={css.menuNav} aria-label={t('nav.label')}>
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className={css.menuLink} aria-current={pathname === n.href ? 'page' : undefined} onClick={close}>{n.label}</Link>
              ))}
            </nav>
            <div className={css.menuSub}>
              <AccountMenu auth={auth} />
              <SettingsItems auth={auth} locale={locale} setLocale={setLocale} onDone={close} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
