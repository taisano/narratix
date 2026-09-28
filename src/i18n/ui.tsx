'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import type { Locale } from '@/registry';
import ja from './messages/ja.json';
import en from './messages/en.json';

/** 画面の文言。コンポーネントに直書きせず、ここ（messages/*.json）から読む */
export const MESSAGES = { ja, en } satisfies Record<Locale, Record<keyof typeof ja, string>>;
export type MessageKey = keyof typeof ja;

const LocaleContext = createContext<Locale>('ja');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function translate(locale: Locale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  // 文言が無い時も画面を止めない（英語 → キーそのものの順に代わりを使う）
  const text: string | undefined = MESSAGES[locale][key] ?? MESSAGES.en[key];
  return (text ?? String(key)).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function useT() {
  const locale = useLocale();
  return useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
}
