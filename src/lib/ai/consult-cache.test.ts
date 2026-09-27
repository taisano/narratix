import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyConsultation } from '@/lib/advisor/classify';
import { chosenRecipes, planFromChart, planFromPurposes, setEmphasis } from '@/features/start/plan';
import { readConsultCache, writeConsultCache, type ConsultOutcome } from './consult-client';

/** テストは node で動くので、localStorage の代わり */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
  };
}

const out = (text: string): ConsultOutcome => ({ source: 'ai', classification: classifyConsultation(text), reading: null, remaining: 7 });

describe('AI の結果を保存して使い回す（同じ人・同じ相談文・同じ言語・同じプロンプトの版）', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('空白や改行の違いは同じ相談とみなす。残り回数は使ったことにしない', () => {
    const text = '海外5地域の売上で、どこが成長を牽引しているかを伝えたい。';
    writeConsultCache('u1', text, 'ja', out(text));
    const hit = readConsultCache('u1', `  ${text.replace('、', '、\n')}　`, 'ja');
    expect(hit?.source).toBe('ai');
    expect(hit && hit.source === 'ai' ? hit.remaining : 0).toBeNull();
  });
  it('ほかの人・ほかの言語・ログインしていない時は使わない。規則の結果は保存しない', () => {
    const text = '売上の推移';
    writeConsultCache('u1', text, 'ja', out(text));
    expect(readConsultCache('u2', text, 'ja')).toBeNull();
    expect(readConsultCache('u1', text, 'en')).toBeNull();
    expect(readConsultCache(undefined, text, 'ja')).toBeNull();
    writeConsultCache('u1', 'x', 'ja', { source: 'rules', fallback: 'off' });
    expect(readConsultCache('u1', 'x', 'ja')).toBeNull();
  });
});

describe('目的・チャートから作る時は AI を呼ばない', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('重視点を選んでおすすめを出すまで、通信しない', () => {
    const fetch = vi.fn(() => { throw new Error('no network'); });
    vi.stubGlobal('fetch', fetch);
    let a = planFromPurposes(['trend']);
    a = setEmphasis(a, a.angles[0]!.id, 'growth_rate');
    let b = planFromChart('stacked_column');
    b = setEmphasis(b, b.angles[0]!.id, 'mix_change');
    expect(chosenRecipes(a)).toHaveLength(1);
    expect(chosenRecipes(b)).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
