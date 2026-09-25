import type { Locale } from '@/registry';
import { slideText } from '@/i18n/slide';

/**
 * 成長率の呼び方：1年の比較は「前年比」、2年以上は「CAGR」（値は同じ計算。1年なら CAGR＝単純な伸び率）
 */
export function growthLabel(locale: Locale, from: number, to: number) {
  const yoy = to - from === 1;
  return {
    yoy,
    name: slideText(locale, yoy ? 'yoy' : 'cagr'),
    range: slideText(locale, yoy ? 'yoyRange' : 'cagrRange', { from, to }),
    short: (value: string) => slideText(locale, yoy ? 'yoyShort' : 'cagrShort', { value }),
  };
}
