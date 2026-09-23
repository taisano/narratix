import { describe, expect, it } from 'vitest';
import { addCol, deleteCol, isTabular, parseNumber, pasteTsv, renameCol } from './edit';
import { initialState, type BuilderState } from './state';

const names = { row: (n: number) => `項目${n}`, col: (n: number) => `系列${n}` };

describe('データ編集', () => {
  it('数値の読み取り', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber(' 1 234 ')).toBe(1234);
    expect(parseNumber('１２，３４５')).toBe(12345);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('Excel からの貼り付けで行・列を増やす', () => {
    const s = initialState();
    const out = pasteTsv(s, 'current', 4, 3, '1\t2\n3\t4\n', names);
    expect(out.dataset.rows).toHaveLength(6);
    expect(out.dataset.cols).toHaveLength(5);
    expect(out.dataset.periods.current.values[4]!.slice(3)).toEqual([1, 2]);
    expect(out.dataset.periods.current.values[5]!.slice(3)).toEqual([3, 4]);
    expect(out.dataset.periods.base.values[5]).toEqual([null, null, null, null, null]);
    expect(s.dataset.rows).toHaveLength(5); // 元の状態は変えない
  });

  it('行名の列から貼ると、名前も入る', () => {
    const out = pasteTsv(initialState(), 'base', 0, -1, 'US\t1,000\t2,000', names);
    expect(out.dataset.rows[0]).toBe('US');
    expect(out.dataset.periods.base.values[0]!.slice(0, 2)).toEqual([1000, 2000]);
  });

  it('列名の変更・削除に成長率の行と強調が追従する', () => {
    let s: BuilderState = { ...initialState(), highlight: 'デュアル' };
    s = renameCol(s, 1, 'Dual');
    expect(s.growthRows).toContain('series:Dual');
    expect(s.highlight).toBe('Dual');
    s = deleteCol(s, 1);
    expect(s.growthRows).toEqual(['market']);
    expect(s.highlight).toBeNull();
    expect(addCol(s, 'X').dataset.periods.current.values[0]).toHaveLength(4);
  });

  it('1セルだけの貼り付けは通常の入力として扱う', () => {
    expect(isTabular('123')).toBe(false);
    expect(isTabular('123\n')).toBe(false);
    expect(isTabular('1\t2')).toBe(true);
  });
});
