'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { cardTags, isLangTag, MAX_TAG_LEN, MAX_USER_TAGS, normalizeTags, splitTagInput, tagLabel } from '@/lib/tags';
import css from './tags.module.css';

/**
 * タグの入力。Enter・カンマ・読点で1つ足す。× で外す。
 * autoTag：自動で付く言語のタグ（外せない。「自動」と添える）。suggestions：前に使ったタグ（候補に出す）
 */
export function TagInput({ value, onChange, autoTag, suggestions = [], label }: {
  value: string[]; onChange: (v: string[]) => void; autoTag?: string; suggestions?: string[]; label: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const listId = useId();
  const add = (s: string) => {
    const next = normalizeTags([...value, ...splitTagInput(s).filter((x) => !isLangTag(x))]);
    onChange(next);
    setDraft('');
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === '、') && !e.nativeEvent.isComposing) {
      if (draft.trim()) { e.preventDefault(); add(draft); } else if (e.key === 'Enter') e.preventDefault();
    } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  const options = suggestions.filter((s) => !isLangTag(s) && !value.includes(s));
  return (
    <div>
      <div className={css.box}>
        {autoTag && <span className={`${css.tag} ${css.auto}`} title={t('tags.autoTitle')}>{tagLabel(autoTag, locale)}（{t('tags.auto')}）</span>}
        {value.map((v) => (
          <span key={v} className={css.tag}>{v}<button type="button" className={css.x} aria-label={t('tags.remove', { tag: v })} onClick={() => onChange(value.filter((x) => x !== v))}>×</button></span>
        ))}
        {value.length < MAX_USER_TAGS && (
          <input className={css.entry} aria-label={label} list={options.length ? listId : undefined} value={draft} maxLength={MAX_TAG_LEN * 3}
            placeholder={value.length ? '' : t('tags.placeholder')}
            onChange={(e) => {
              const v = e.target.value;
              // 候補から選んだ時は、そのまま足す
              if (options.includes(v)) add(v); else setDraft(v);
            }}
            onKeyDown={key} onBlur={() => draft.trim() && add(draft)} />
        )}
      </div>
      {options.length > 0 && <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>}
      <p className={css.hint}>{t('tags.hint')}</p>
    </div>
  );
}

/** タグの表示（言語のタグは薄く。表示名は画面の言語に合わせる） */
export function TagList({ tags }: { tags: string[] }) {
  const locale = useLocale();
  if (!tags.length) return null;
  return <ul className={css.list}>{tags.map((x) => <li key={x} className={`${css.tag} ${isLangTag(x) ? css.auto : ''}`}>{tagLabel(x, locale)}</li>)}</ul>;
}

/** 一覧のカード用：言語のタグは出さず、人が付けた最初の3つまで（残りは「+2」） */
export function CardTags({ tags }: { tags: string[] }) {
  const t = useT();
  const { shown, more } = cardTags(tags);
  if (!shown.length) return null;
  return (
    <ul className={css.list} title={tags.filter((x) => !isLangTag(x)).join(', ')}>
      {shown.map((x) => <li key={x} className={css.tag}>{x}</li>)}
      {more > 0 && <li className={`${css.tag} ${css.auto}`} aria-label={t('tags.more', { n: more })}>+{more}</li>}
    </ul>
  );
}

/** タグで絞り込む（1つ選ぶ。もう一度押すと外れる） */
export function TagFilter({ tags, value, onChange }: { tags: string[]; value: string | null; onChange: (v: string | null) => void }) {
  const t = useT();
  const locale = useLocale();
  if (!tags.length) return null;
  return (
    <div className={css.filter} role="group" aria-label={t('tags.filter')}>
      <span className={css.filterLabel}>{t('tags.filter')}</span>
      <button type="button" className={css.chip} aria-pressed={value == null} onClick={() => onChange(null)}>{t('library.all')}</button>
      {tags.map((x) => <button key={x} type="button" className={css.chip} aria-pressed={value === x} onClick={() => onChange(value === x ? null : x)}>{tagLabel(x, locale)}</button>)}
    </div>
  );
}
