import { describe, expect, it } from 'vitest';
import { localize } from './locale';

describe('localize', () => {
  it('指定言語の値を返す', () => {
    expect(localize({ ja: '揃えた表', en: 'Aligned table' }, 'ja')).toBe('揃えた表');
  });
  it('未翻訳なら英語にフォールバックする', () => {
    expect(localize({ en: 'Mekko' }, 'ja')).toBe('Mekko');
  });
});
