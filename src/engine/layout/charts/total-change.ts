import { slideText } from '@/i18n/slide';
import { formatMetric, nonAdditiveUnit } from '../../format';
import type { SceneItem } from '../../scene';
import { INK } from '../../theme';
import { cagr } from '../../transform/cagr';
import type { ChartCtx } from './context';

/** チャートの上に置く「合計の増減」1行の高さ */
export const TOTAL_CHANGE_H = 0.32;

const yearOf = (s: string) => (/^\d{4}$/.test(s.trim()) ? Number(s) : null);
const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±');
const rate = (v: number) => sign(v) + Math.abs(v * 100).toFixed(1) + '%';

/**
 * 合計の増減（補完パーツ total_change）：表示している項目の合計を、基準→比較先で1行に。
 * 例：「合計：120 → 111（−9、前年比 −7.5%）」「合計：86 → 111（+25、+29.1%、CAGR +6.6%）」
 * オフ・足せない単位・項目が1つだけ・基準の合計が0以下の時は出さない（null）。
 */
export function totalChangeText(ctx: ChartCtx, pairs: { base: number; compare: number }[], baseLabel: string, compareLabel: string): string | null {
  if (!ctx.complement('total_change') || nonAdditiveUnit(ctx.unit) || pairs.length < 2) return null;
  const b = pairs.reduce((s, p) => s + p.base, 0), c = pairs.reduce((s, p) => s + p.compare, 0);
  if (!(b > 0)) return null;
  const nf = ctx.control<'raw'>('number_format') ?? 'raw';
  const diff = c - b;
  const y0 = yearOf(baseLabel), y1 = yearOf(compareLabel);
  const years = y0 != null && y1 != null ? y1 - y0 : null;
  const parts = [sign(diff) + formatMetric(Math.abs(diff), nf)];
  if (years === 1) parts.push(slideText(ctx.locale, 'yoyShort', { value: rate(c / b - 1) }));
  else {
    parts.push(rate(c / b - 1));
    const g = years != null && years > 1 ? cagr(b, c, years) : null;
    if (g != null) parts.push(slideText(ctx.locale, 'cagrShort', { value: rate(g) }));
  }
  return slideText(ctx.locale, 'totalChange', { from: formatMetric(b, nf), to: formatMetric(c, nf), detail: parts.join(ctx.locale === 'ja' ? '、' : ', ') });
}

export function totalChangeItem(ctx: ChartCtx, text: string, y: number): SceneItem {
  return { kind: 'text', x: ctx.rect.x, y, w: ctx.rect.w, h: TOTAL_CHANGE_H - 0.06, lines: [{ t: text, size: 11, bold: true, color: INK }], align: 'left', valign: 'middle' };
}
