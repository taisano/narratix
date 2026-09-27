import type { GrowthSpan } from '../../transform/cagr';
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

/** 区間の見出し：年なら CAGR／前年比、四半期・月などなら「伸び率（2025 Q4→2026 Q3）」 */
export function spanLabel(locale: Locale, span: GrowthSpan) {
  if (span.years != null) return growthLabel(locale, Number(span.fromLabel), Number(span.toLabel));
  return {
    yoy: false,
    name: slideText(locale, 'periodGrowth'),
    range: slideText(locale, 'periodGrowthRange', { from: span.fromLabel, to: span.toLabel }),
    short: (value: string) => slideText(locale, 'periodGrowthShort', { value }),
  };
}
