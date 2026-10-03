import { describe, expect, it } from 'vitest';
import { initialState } from '@/features/editor/state';
import { textBasisForDataset } from './canonical';
import { sameTextBasis, userTextMeta } from './text';

describe('文の書き手と根拠', () => {
  it('値と意味の変更をどちらも古さとして検出する', () => {
    const original = initialState().dataset;
    const basis = textBasisForDataset(original);
    const value = structuredClone(original);
    value.periods.current.values[0]![0] = 999;
    const meaning = { ...structuredClone(original), unit: '百万円' };

    expect(sameTextBasis(basis, textBasisForDataset(structuredClone(original)))).toBe(true);
    expect(sameTextBasis(basis, textBasisForDataset(value))).toBe(false);
    expect(sameTextBasis(basis, textBasisForDataset(meaning))).toBe(false);
  });

  it('AI案を直した文だけai_editedとして残す', () => {
    const basis = textBasisForDataset(initialState().dataset);
    expect(userTextMeta(basis).author).toBe('user');
    expect(userTextMeta(basis, { author: 'ai' }).author).toBe('ai_edited');
    expect(userTextMeta(basis, { author: 'rule' }).author).toBe('user');
  });
});
