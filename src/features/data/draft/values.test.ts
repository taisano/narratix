import { describe, expect, it } from 'vitest';
import { derivedValue, formatValue, readPastedValue, usable } from './values';

describe('値の持ち方：元の文字列・正規化した数値と単位・表示を分ける', () => {
  it('21.20% は、元の文字列を保ち、数値 21.2・単位 %・桁 2 を持つ。表示は桁を変えても数値は変わらない', () => {
    const v = readPastedValue('21.20%');
    expect(v).toMatchObject({ origin: 'pasted', raw: '21.20%', value: 21.2, percent: true, decimals: 2 });
    expect(formatValue(v)).toBe('21.20%');
    expect(formatValue(v, 1)).toBe('21.2%');
    expect(v.value).toBe(21.2);
  });
  it('全角の数字・％・マイナスは、元の文字列を保ったまま正規化する', () => {
    const v = readPastedValue('－３．５％');
    expect(v).toMatchObject({ raw: '－３．５％', value: -3.5, percent: true, decimals: 1 });
    expect(readPastedValue('−2.0').value).toBe(-2);
    expect(readPastedValue('▲120').value).toBe(-120);
  });
  it('桁区切りは小数の桁にしない。単位は掛けない', () => {
    expect(readPastedValue('1,200')).toMatchObject({ value: 1200, decimals: 0 });
    expect(readPastedValue('1,200千円')).toMatchObject({ value: 1200, unit: '千円' });
    expect(readPastedValue('€89').raw).toBe('€89');
  });
  it('数値でないセルは、数値にせず元の文字列を保つ', () => {
    const v = readPastedValue('Price-led');
    expect(v).toMatchObject({ kind: 'text', value: null, raw: 'Price-led' });
    expect(formatValue(v)).toBe('Price-led');
  });
  it('算出値は貼り付けた値と区別する。未確認の算出値は候補に使わない', () => {
    const d = derivedValue(14.3, { percent: true, formula: 'CY − 前年差' });
    expect(d).toMatchObject({ origin: 'derived', confirmed: false, formula: 'CY − 前年差' });
    expect(usable(d)).toBe(false);
    expect(usable({ ...d, confirmed: true })).toBe(true);
    expect(usable(readPastedValue('1'))).toBe(true);
  });
  it('浮動小数点の完全一致に頼らず、数値は許容差内、元の文字列は完全一致で確認する', () => {
    const v = readPastedValue('0.1');
    expect(Math.abs((v.value as number) + 0.2 - 0.3)).toBeLessThan(1e-9);
    expect(v.raw).toBe('0.1');
  });
});
