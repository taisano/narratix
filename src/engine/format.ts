import type { Locale } from '@/registry';

const NUMBER_LOCALE: Record<Locale, string> = { ja: 'ja-JP', en: 'en-US' };

/** 実数を整数に丸めて桁区切りで表示（null は空文字） */
export function formatNumber(n: number | null | undefined, locale: Locale): string {
  return n == null ? '' : Math.round(n).toLocaleString(NUMBER_LOCALE[locale]);
}

/** 率を小数1桁の%で表示（null は —） */
export function formatPct1(v: number | null | undefined): string {
  return v == null ? '—' : (v * 100).toFixed(1) + '%';
}

/** 構成比の変化を符号付きの pt で表示（−はマイナス記号） */
export function formatPt(delta: number): string {
  const d = Math.round(delta * 100);
  return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + 'pt';
}
