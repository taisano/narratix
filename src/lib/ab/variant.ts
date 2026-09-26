/**
 * 紹介トップの A/B（docs/landing-ab-guide.md 5章）。
 * - ?variant=a|b が最優先（確認用。割り当ては変えず、計測にも数えない）
 * - それ以外は、このブラウザに前に割り当てた案。無ければ半々で割り当てて覚える
 * - 覚えられない（ブラウザの保存が使えない）時は A
 * - 案は URL で引き回さない（ログインや /start の後にも付けない）
 */
export const VARIANTS = ['a', 'b'] as const;
export type Variant = (typeof VARIANTS)[number];
export const DEFAULT_VARIANT: Variant = 'a';
export const EXPERIMENT = 'landing_v1';
const VARIANT_KEY = `ssc:${EXPERIMENT}:variant`;
const VISITOR_KEY = 'ssc:visitor';

export const parseVariant = (v: unknown): Variant | null => (typeof v === 'string' && (VARIANTS as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as Variant) : null);

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export interface Assignment { variant: Variant; /** URL で指定した確認用（計測しない） */ forced: boolean }

export function resolveVariant(param: string | null | undefined, store: Store | null, random: () => number = Math.random): Assignment {
  const p = parseVariant(param);
  if (p) return { variant: p, forced: true };
  if (!store) return { variant: DEFAULT_VARIANT, forced: false };
  try {
    const saved = parseVariant(store.getItem(VARIANT_KEY));
    if (saved) return { variant: saved, forced: false };
    const v: Variant = random() < 0.5 ? 'a' : 'b';
    store.setItem(VARIANT_KEY, v);
    return { variant: v, forced: false };
  } catch {
    return { variant: DEFAULT_VARIANT, forced: false };
  }
}

/** このブラウザに割り当て済みの案（/start など、トップ以外の計測に付ける）。無ければ null */
export function storedVariant(store: Store | null): Variant | null {
  try { return store ? parseVariant(store.getItem(VARIANT_KEY)) : null; } catch { return null; }
}

/** ブラウザごとのランダムな番号（人を特定しない。重複を数えないため） */
export function visitorId(store: Store | null, make: () => string = () => crypto.randomUUID()): string {
  try {
    const v = store?.getItem(VISITOR_KEY);
    if (v && /^[0-9a-f-]{36}$/.test(v)) return v;
    const id = make();
    store?.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return make();
  }
}
