export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** レジストリの表示名。英語を必須の予備とする（registry-spec.md「多言語対応」）。 */
export type LocalizedText = Partial<Record<Locale, string>> & { en: string };

export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}
