import { describe, expect, it } from 'vitest';
import { EMPTY_DOC, hasUnsavedChanges } from './storage';
import { initialState } from './state';

describe('未保存の変更の判定', () => {
  it('サンプルのままなら変更なし、触ったら変更あり', () => {
    expect(hasUnsavedChanges(initialState(), EMPTY_DOC)).toBe(false);
    expect(hasUnsavedChanges({ ...initialState(), title: 'x' }, EMPTY_DOC)).toBe(true);
  });
  it('保存済みなら、最後の保存と比べる', () => {
    const s = { ...initialState(), title: '保存した' };
    const doc = { ...EMPTY_DOC, id: 'a', version: 1, snapshot: JSON.stringify(s) };
    expect(hasUnsavedChanges(s, doc)).toBe(false);
    expect(hasUnsavedChanges({ ...s, title: '変えた' }, doc)).toBe(true);
  });
});
