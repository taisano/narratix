import { describe, expect, it } from 'vitest';
import { EMPTY_DOC, hasUnsavedChanges } from './storage';
import { initialProject, viewOf, withView } from './project';

describe('未保存の変更の判定', () => {
  it('サンプルのままなら変更なし、触ったら変更あり', () => {
    expect(hasUnsavedChanges(initialProject(), EMPTY_DOC)).toBe(false);
    expect(hasUnsavedChanges(withView(initialProject(), 0, { ...viewOf(initialProject()), title: 'x' }), EMPTY_DOC)).toBe(true);
  });
  it('保存済みなら、最後の保存と比べる', () => {
    const s = withView(initialProject(), 0, { ...viewOf(initialProject()), title: '保存した' });
    const doc = { ...EMPTY_DOC, id: 'a', version: 1, snapshot: JSON.stringify(s) };
    expect(hasUnsavedChanges(s, doc)).toBe(false);
    expect(hasUnsavedChanges(withView(s, 0, { ...viewOf(s), title: '変えた' }), doc)).toBe(true);
  });
});
