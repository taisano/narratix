import { describe, expect, it } from 'vitest';
import { parseVariant, resolveVariant, storedVariant, visitorId } from './variant';
import { VARIANT_COPY } from '@/features/landing/copy';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('A/B の案', () => {
  it('?variant=a|b が最優先。確認用なので割り当ては変えない', () => {
    const s = mem();
    expect(resolveVariant('b', s)).toEqual({ variant: 'b', forced: true });
    expect(storedVariant(s)).toBeNull();
    expect(resolveVariant('B', s).variant).toBe('b');
  });
  it('不正な値・指定なしは、割り当て（無ければ半々）。一度決まったら変わらない', () => {
    const s = mem();
    expect(parseVariant('c')).toBeNull();
    expect(resolveVariant('c', s, () => 0.9)).toEqual({ variant: 'b', forced: false });
    expect(resolveVariant(null, s, () => 0.1)).toEqual({ variant: 'b', forced: false });
    expect(storedVariant(s)).toBe('b');
  });
  it('保存が使えない時は A', () => {
    expect(resolveVariant(null, null).variant).toBe('a');
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(resolveVariant(null, broken).variant).toBe('a');
  });
  it('訪問者の番号は同じブラウザで同じ', () => {
    const s = mem();
    const a = visitorId(s, () => '11111111-1111-1111-1111-111111111111');
    expect(visitorId(s, () => 'x')).toBe(a);
  });
  it('両案・両言語で、文言がそろっている（空が無い）', () => {
    for (const v of ['a', 'b'] as const) for (const l of ['ja', 'en'] as const) {
      const c = VARIANT_COPY[v][l];
      expect(Object.values(c).every((x) => x.trim().length > 0)).toBe(true);
      expect(Object.keys(c)).toEqual(Object.keys(VARIANT_COPY.a.ja));
    }
    expect(VARIANT_COPY.a.ja.primaryCta).not.toBe(VARIANT_COPY.b.ja.primaryCta);
  });
});
