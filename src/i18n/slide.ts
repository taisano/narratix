import type { Locale } from '@/registry';

/**
 * スライドに自動で入る文言（slideLocale に従う）。画面の文言（messages/*.json）とは分ける。
 * {name} は差し込み。
 */
const SLIDE_TEXT = {
  ja: {
    periodYear: '{year}年',
    mekkoNote: '幅：{period}の市場規模（{unit}）　高さ：{cols}の構成比',
    mixAxis: '{cols}構成比',
    paren: '（{text}）',
    valueShare: '{value}（{pct}）',
    cagr: 'CAGR',
    periodGrowth: '伸び率',
    market: '市場全体',
    total: '全体',
    colsFallback: 'セグメント',
  },
  en: {
    periodYear: '{year}',
    mekkoNote: 'Width: {period} market size ({unit})   Height: {cols} mix',
    mixAxis: '{cols} mix',
    paren: '({text})',
    valueShare: '{value} ({pct})',
    cagr: 'CAGR',
    periodGrowth: 'growth',
    market: 'Market',
    total: 'Total',
    colsFallback: 'segment',
  },
} satisfies Record<Locale, Record<string, string>>;

export type SlideTextKey = keyof (typeof SLIDE_TEXT)['ja'];

export function slideText(locale: Locale, key: SlideTextKey, vars: Record<string, string | number> = {}): string {
  const tpl = SLIDE_TEXT[locale][key];
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** 期間ラベルの表示。4桁の年なら「2025年」、それ以外はそのまま */
export function periodText(locale: Locale, label: string): string {
  return /^\d{4}$/.test(label) ? slideText(locale, 'periodYear', { year: label }) : label;
}
