import type { Locale } from '@/registry/locale';

/**
 * タグ（保存したチャート・Library の見本）。
 * スライドの言語のタグ（日本語 / English）は保存のたびに自動で付け直す。人が付けるタグは任意。
 */
export const LANG_TAGS: Record<Locale, string> = { ja: '日本語', en: 'English' };
export const MAX_TAG_LEN = 30;
export const MAX_USER_TAGS = 10;

export const isLangTag = (t: string): boolean => (Object.values(LANG_TAGS) as string[]).includes(t);

/** 前後の空白を取り、空・重複（大文字小文字は同じと見る）を外し、長さと数をそろえる */
export function normalizeTags(list: readonly string[], max = MAX_USER_TAGS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LEN);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** 入力欄の文字をタグに分ける（カンマ・読点・改行で区切る） */
export const splitTagInput = (s: string): string[] => s.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean);

/** 人が付けたタグだけ（言語のタグを除く） */
export const userTags = (tags: readonly string[] | null | undefined): string[] => normalizeTags((tags ?? []).filter((t) => !isLangTag(t)));

/** 保存するタグ：先頭に言語のタグ、続けて人が付けたタグ */
export const withLangTag = (tags: readonly string[] | null | undefined, locale: Locale): string[] => [LANG_TAGS[locale], ...userTags(tags)];

/** 一覧の絞り込み用：全部のタグを、言語のタグを先に、あとは多い順で */
export function tagCounts(lists: readonly (readonly string[])[]): string[] {
  const n = new Map<string, number>();
  for (const l of lists) for (const t of new Set(l)) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.keys()].sort((a, b) => Number(isLangTag(b)) - Number(isLangTag(a)) || n.get(b)! - n.get(a)! || a.localeCompare(b, 'ja'));
}
