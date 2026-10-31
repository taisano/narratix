import { describe, expect, it } from 'vitest';
import type { Matrix } from '../transform/matrix';
import { resolveNoteTokens } from './notes-tokens';

const m: Matrix = { rows: ['2022', '2023', '2024', '2025'], cols: ['売上高', '利益'], current: { label: 'x', values: [[100, 8], [120, 11], [145, 16], [170, 22]] } };
const c = { matrix: m, numberFormat: 'raw' as const, locale: 'ja' as const };
const r = (t: string, extra: Partial<typeof c & { defaultSeries: string }> = {}) => resolveNoteTokens(t, { ...c, ...extra });

describe('補足の本文に入れる数字', () => {
  it('最初・最後・増減・増減率・前の行からの増減', () => {
    expect(r('{first}→{last}')).toBe('100→170');
    expect(r('{delta}')).toBe('+70');
    expect(r('{pct}')).toBe('+70.0%');
    expect(r('{yoy} {yoyDelta}')).toBe('+17.2% +25');
    expect(r('{firstLabel}–{lastLabel}')).toBe('2022–2025');
  });
  it('系列の指定・既定の系列', () => {
    expect(r('{last:利益}')).toBe('22');
    expect(r('{last}', { defaultSeries: '利益' })).toBe('22');
    expect(r('{last:ない系列}')).toBe('—');
  });
  it('CAGR・最大・合計・構成比', () => {
    expect(r('{cagr}')).toBe('+19.3%');
    expect(r('{max}は{maxName}')).toBe('170は2025');
    expect(r('{min}は{minName}')).toBe('100は2022');
    expect(r('{total} {share}')).toBe('192 88.5%');
  });
  it('知らない名前は、そのまま残す', () => {
    expect(r('{abc} {x:y}')).toBe('{abc} {x:y}');
  });
  it('行が1つだけの表は、系列どうしで最大・最小', () => {
    const one: Matrix = { rows: ['2025'], cols: ['A', 'B'], current: { label: 'x', values: [[3, 9]] } };
    expect(resolveNoteTokens('{maxName}', { matrix: one, numberFormat: 'raw', locale: 'ja' })).toBe('B');
    expect(resolveNoteTokens('{pct}', { matrix: one, numberFormat: 'raw', locale: 'ja' })).toBe('—');
  });
});
