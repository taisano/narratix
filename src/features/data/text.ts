export type TextAuthor = 'user' | 'ai' | 'ai_edited' | 'template' | 'sample' | 'rule';

/** 編集中に持つ文の来歴。DB の dataset version id は保存時に補う。 */
export interface TextMeta {
  author: TextAuthor;
  basis?: { dataHash: string; semanticsHash: string };
  updatedAt?: string;
}

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`;
  return JSON.stringify(v);
};

export function stableHash(v: unknown): string {
  const text = stable(v);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export const userTextMeta = (basis: NonNullable<TextMeta['basis']>, previous?: TextMeta): TextMeta => ({
  author: previous?.author === 'ai' || previous?.author === 'ai_edited' ? 'ai_edited' : 'user',
  basis,
});

export const sameTextBasis = (a: TextMeta['basis'] | undefined, b: NonNullable<TextMeta['basis']>): boolean =>
  !!a && a.dataHash === b.dataHash && a.semanticsHash === b.semanticsHash;

const AUTHORS: readonly TextAuthor[] = ['user', 'ai', 'ai_edited', 'template', 'sample', 'rule'];

export function normalizeTextMeta(value: unknown): TextMeta | undefined {
  const x = value as Partial<TextMeta> | null;
  if (!x || typeof x !== 'object' || !AUTHORS.includes(x.author as TextAuthor)) return undefined;
  const b = x.basis;
  const basis = b && typeof b.dataHash === 'string' && typeof b.semanticsHash === 'string'
    ? { dataHash: b.dataHash, semanticsHash: b.semanticsHash } : undefined;
  return {
    author: x.author as TextAuthor,
    ...(basis ? { basis } : {}),
    ...(typeof x.updatedAt === 'string' ? { updatedAt: x.updatedAt } : {}),
  };
}
