import { describe, expect, it } from 'vitest';
import ja from './messages/ja.json';
import en from './messages/en.json';

describe('翻訳ファイル', () => {
  it('日本語と英語でキーが揃っている', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });
  it('差し込み（{name}）が揃っている', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(ja) as (keyof typeof ja)[]) expect(vars(en[k]), k).toEqual(vars(ja[k]));
  });
});
