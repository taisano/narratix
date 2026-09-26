import { describe, expect, it } from 'vitest';
import { parseCellNumber } from './parse';

describe('かんたん修正の数字', () => {
  it('カンマ・全角・マイナスを読み、途中の入力は反映しない', () => {
    expect(parseCellNumber('1,234')).toBe(1234);
    expect(parseCellNumber('１２．５')).toBe(12.5);
    expect(parseCellNumber('−3')).toBe(-3);
    expect(parseCellNumber('')).toBeNull();
    expect(parseCellNumber('-')).toBeUndefined();
    expect(parseCellNumber('1.')).toBeUndefined();
    expect(parseCellNumber('abc')).toBeUndefined();
  });
});
