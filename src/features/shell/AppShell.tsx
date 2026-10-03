'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { I18nProvider, translate } from '@/i18n/ui';
import { LOCALES, type Locale } from '@/registry';
import { useSession, type Auth } from '@/lib/supabase/useSession';
import { AccountMenu } from './AccountMenu';
import { SettingsMenu } from './SettingsMenu';
import { isAdmin } from '@/lib/repo/library';
import { useBeta, type Beta } from '../beta/useBeta';
import { ConfirmProvider } from '../shared/Confirm';
import { UpdateNotice } from './UpdateNotice';
import css from '../ui.module.css';

const UI_LOCALE_KEY = 'chart-advisor:ui-locale';

const AuthContext = createContext<Auth | null>(null);
const BetaContext = createContext<Beta | null>(null);
const UiLocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void } | null>(null);

/** 画面の言語を切り替える（紹介トップの専用ヘッダーから使う） */
export function useUiLocale() {
  const v = useContext(UiLocaleContext);
  if (!v) throw new Error('useUiLocale must be used inside <AppShell>');
  return v;
}

/** 専用のヘッダーを持つ画面（紹介トップ） */
const OWN_HEADER = new Set(['/']);

/** ベータ版の登録状態（全画面で共有） */
export function useBetaAccess(): Beta {
  const b = useContext(BetaContext);
  if (!b) throw new Error('useBetaAccess must be used inside <AppShell>');
  return b;
}

/** ログイン状態（全画面で共有） */
export function useAuth(): Auth {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth must be used inside <AppShell>');
  return a;
}

/** 全画面共通の枠：ヘッダー（エディタ／マイページ、画面の言語、ログイン）と、言語・ログインの共有 */
export function AppShell({ children }: { children: ReactNode }) {
  const auth = useSession();
  const beta = useBeta(auth);
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>('ja');
  const headerRef = useRef<HTMLElement>(null);
  // 管理者には「管理」を出す（フィードバックを読む画面）
  const [admin, setAdmin] = useState(false);
  const uid = auth.session?.user.id;
  useEffect(() => {
    let alive = true;
    if (!auth.client || !uid) { setAdmin(false); return; }
    void isAdmin(auth.client).then((a) => { if (alive) setAdmin(a); });
    return () => { alive = false; };
  }, [auth.client, uid]);
  const ownHeader = OWN_HEADER.has(pathname);

  // ヘッダーの高さ（エディタを画面の高さに収めるのに使う）
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
    // 紹介トップ（ヘッダーなし）から移った時にも測り直す
  }, [ownHeader]);

  // 保存した画面の言語を読み終えるまでは書き込まない（読む前の既定値 ja で上書きしないように）
  const [localeLoaded, setLocaleLoaded] = useState(false);
  useEffect(() => {
    try {
      const l = localStorage.getItem(UI_LOCALE_KEY);
      if (l && (LOCALES as readonly string[]).includes(l)) setLocale(l as Locale);
    } catch { /* 保存がなくても動く */ }
    setLocaleLoaded(true);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    if (!localeLoaded) return;
    try { localStorage.setItem(UI_LOCALE_KEY, locale); } catch { /* 何もしない */ }
  }, [locale, localeLoaded]);

  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  // ページのタイトル（ブラウザのタブ）も画面の言語に合わせる。サーバーで付けるタイトルは日本語のため
  useEffect(() => {
    const keys: Record<string, Parameters<typeof translate>[1]> = {
      '/editor': 'nav.editor', '/start': 'nav.start', '/library': 'nav.library', '/charts': 'nav.myPage',
      '/quick': 'quick.link', '/admin': 'nav.admin', '/privacy': 'privacy.title', '/account/password': 'auth.setPasswordTitle',
    };
    const k = keys[pathname];
    if (!k) return;
    const title = `${translate(locale, k)} | Biz Slide Coach`;
    const apply = () => { if (document.title !== title) document.title = title; };
    apply();
    // 読み込み直後やページを移った後に、Next.js がサーバーのタイトル（日本語）を付け直すことがある。付け直されたら戻す
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [pathname, locale]);
  const nav = [
    { href: '/start', label: t('nav.start') },
    { href: '/editor', label: t('nav.editor') },
    ...(auth.enabled ? [{ href: '/charts', label: t('nav.myPage') }] : []),
    ...(auth.enabled ? [{ href: '/library', label: t('nav.library') }] : []),
    ...(admin ? [{ href: '/admin', label: t('nav.admin') }] : []),
  ];

  return (
    <AuthContext.Provider value={auth}>
      <BetaContext.Provider value={beta}>
      <I18nProvider locale={locale}>
        <ConfirmProvider>
        <UiLocaleContext.Provider value={{ locale, setLocale }}>
        {ownHeader ? children : (
        <div className={css.page}>
          <header className={css.header} ref={headerRef}>
            <div className={css.brand}>
              <Link href="/" className={`${css.brandLink} ${css.brandName}`}>{t('app.title')}</Link>
              <nav className={css.nav} aria-label={t('nav.label')}>
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className={css.navLink} aria-current={pathname === n.href ? 'page' : undefined}>{n.label}</Link>
                ))}
              </nav>
            </div>
            <div className={css.headRight}>
              {/* ログインしていない時はログインのボタン。言語・フィードバック・アカウントは歯車のメニューにまとめる */}
              <AccountMenu auth={auth} />
              <SettingsMenu auth={auth} locale={locale} setLocale={setLocale} />
            </div>
          </header>
          {children}
        </div>
        )}
        </UiLocaleContext.Provider>
          <UpdateNotice />
        </ConfirmProvider>
      </I18nProvider>
      </BetaContext.Provider>
    </AuthContext.Provider>
  );
}
