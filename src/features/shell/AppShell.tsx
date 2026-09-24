'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { I18nProvider, translate } from '@/i18n/ui';
import { LOCALES, type Locale } from '@/registry';
import { useSession, type Auth } from '@/lib/supabase/useSession';
import { AccountMenu } from './AccountMenu';
import css from '../ui.module.css';

const UI_LOCALE_KEY = 'chart-advisor:ui-locale';

const AuthContext = createContext<Auth | null>(null);

/** ログイン状態（全画面で共有） */
export function useAuth(): Auth {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth must be used inside <AppShell>');
  return a;
}

/** 全画面共通の枠：ヘッダー（エディタ／マイページ、画面の言語、ログイン）と、言語・ログインの共有 */
export function AppShell({ children }: { children: ReactNode }) {
  const auth = useSession();
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>('ja');
  const headerRef = useRef<HTMLElement>(null);

  // ヘッダーの高さ（エディタを画面の高さに収めるのに使う）
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      const l = localStorage.getItem(UI_LOCALE_KEY);
      if (l && (LOCALES as readonly string[]).includes(l)) setLocale(l as Locale);
    } catch { /* 保存がなくても動く */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem(UI_LOCALE_KEY, locale); } catch { /* 何もしない */ }
  }, [locale]);

  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  const nav = [
    { href: '/start', label: t('nav.start') },
    { href: '/', label: t('nav.editor') },
    ...(auth.enabled ? [{ href: '/charts', label: t('nav.myPage') }] : []),
  ];

  return (
    <AuthContext.Provider value={auth}>
      <I18nProvider locale={locale}>
        <div className={css.page}>
          <header className={css.header} ref={headerRef}>
            <div className={css.brand}>
              <Link href="/" className={css.brandLink}><h1>{t('app.title')}</h1></Link>
              <nav className={css.nav} aria-label={t('nav.label')}>
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className={css.navLink} aria-current={pathname === n.href ? 'page' : undefined}>{n.label}</Link>
                ))}
              </nav>
            </div>
            <div className={css.headRight}>
              <div className={css.langSwitch}>
                <span>{t('app.uiLanguage')}</span>
                <div className={css.seg} role="group" aria-label={t('app.uiLanguage')}>
                  {LOCALES.map((l) => (
                    <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)}>{translate(locale, `locale.${l}`)}</button>
                  ))}
                </div>
              </div>
              <AccountMenu auth={auth} />
            </div>
          </header>
          {children}
        </div>
      </I18nProvider>
    </AuthContext.Provider>
  );
}
