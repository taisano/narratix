'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { listDrafts, removeDraft, type Draft } from './drafts';
import { hasUnsavedChanges, readStored } from './storage';
import { viewOf } from './project';
import css from '../ui.module.css';

/** マイチャートの上：保存していない下書き（このブラウザだけ）。無ければ何も出さない */
export function DraftsList() {
  const t = useT();
  const locale = useLocale();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => { setDrafts(listDrafts()); }, []);
  if (!drafts.length) return null;
  const when = (ms: number) => new Date(ms).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <section className={css.drafts} aria-labelledby="drafts-head">
      <h2 id="drafts-head" className={css.draftsHead}>{t('draft.head', { n: drafts.length })}</h2>
      <p className={css.draftsNote}>{t('draft.note')}</p>
      <ul className={css.draftsList}>
        {drafts.map((d) => (
          <li key={d.id} className={css.draftItem}>
            <span className={css.draftName}>{d.title || t('draft.untitled')}</span>
            <span className={css.draftMeta}>{t('draft.meta', { when: when(d.savedAt), n: d.slides })}{d.doc.id ? ' · ' + t('draft.ofSaved') : ''}</span>
            <span className={css.draftBtns}>
              <Link href={`/editor?draft=${d.id}`} className={css.contextAddBtn}>{t('draft.open')}</Link>
              <button type="button" className={css.linkBtn} onClick={() => { removeDraft(d.id); setDrafts(listDrafts()); }}>{t('draft.remove')}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 入り口（新しく作る）：保存していない編集があれば、相談を始める前に知らせる */
export function ResumeBanner() {
  const t = useT();
  const [name, setName] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(0);
  useEffect(() => {
    const s = readStored();
    if (s.state && s.doc !== undefined && hasUnsavedChanges(s.state, s.doc ?? { id: null, version: null, name: null, snapshot: null })) {
      setName(s.doc?.name || viewOf(s.state, 0).title || t('draft.untitled'));
    }
    setDrafts(listDrafts().length);
  }, [t]);
  if (!name && !drafts) return null;
  return (
    <p className={css.resumeBanner} role="status">
      <b className={css.resumeBadge} aria-hidden="true">C</b>
      <span>{name ? t('draft.resume', { name }) : t('draft.resumeDrafts', { n: drafts })}</span>
      {name && <Link href="/editor" className={css.linkBtn}>{t('draft.resumeOpen')}</Link>}
      {drafts > 0 && <Link href="/charts" className={css.linkBtn}>{t('draft.resumeList', { n: drafts })}</Link>}
    </p>
  );
}
