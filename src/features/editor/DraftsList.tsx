'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { useConfirm } from '../shared/Confirm';
import { listDrafts, removeDraft, type Draft } from './drafts';
import { EMPTY_DOC, hasUnsavedChanges, readStored, writeStored } from './storage';
import { initialProject, viewOf } from './project';
import css from '../ui.module.css';

/** 編集中で保存していない作業（編集画面に残っているもの）。無ければ null */
function currentWork(): { title: string; slides: number; ofSaved: boolean } | null {
  const s = readStored();
  if (!s.state) return null;
  const doc = s.doc ?? EMPTY_DOC;
  if (!hasUnsavedChanges(s.state, doc)) return null;
  return { title: doc.name || viewOf(s.state, 0).title || '', slides: s.state.slides.length, ofSaved: !!doc.id };
}

/** 下書きの件数（編集中の保存していない作業も1件と数える）。マイチャートのタブに出す */
export function countDrafts(): number {
  return listDrafts().length + (currentWork() ? 1 : 0);
}

/**
 * マイチャートの「下書き」タブ：保存していない作業（このブラウザだけ）。
 * ・編集中の作業（まだ編集画面にあるもの）：［開いて続ける］［捨てる］
 * ・新しく始めた時に残した下書き：［開いて続ける］［削除］
 */
export function DraftsList({ onChange }: { onChange?: () => void } = {}) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [current, setCurrent] = useState<ReturnType<typeof currentWork>>(null);
  const refresh = () => { setDrafts(listDrafts()); setCurrent(currentWork()); onChange?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDrafts(listDrafts()); setCurrent(currentWork()); }, []);
  const when = (ms: number) => new Date(ms).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (!drafts.length && !current) return <p className={css.draftsEmpty}>{t('draft.empty')}</p>;
  return (
    <section className={css.drafts} aria-label={t('draft.headPlain')}>
      <p className={css.draftsNote}>{t('draft.note')}</p>
      <ul className={css.draftsList}>
        {current && (
          <li className={css.draftItem}>
            <span className={css.draftName}>{current.title || t('draft.untitled')}</span>
            <span className={css.draftMeta}>{t('draft.current', { n: current.slides })}{current.ofSaved ? ' · ' + t('draft.ofSaved') : ''}</span>
            <span className={css.draftBtns}>
              <Link href="/editor" className={css.contextAddBtn}>{t('draft.open')}</Link>
              <button type="button" className={css.linkBtn} onClick={async () => {
                if (!(await confirm({ title: t('discard.title'), body: t('discard.body'), ok: t('discard.ok'), danger: true }))) return;
                writeStored(initialProject(locale), EMPTY_DOC);
                refresh();
              }}>{t('discard.short')}</button>
            </span>
          </li>
        )}
        {drafts.map((d) => (
          <li key={d.id} className={css.draftItem}>
            <span className={css.draftName}>{d.title || t('draft.untitled')}</span>
            <span className={css.draftMeta}>{t('draft.meta', { when: when(d.savedAt), n: d.slides })}{d.doc.id ? ' · ' + t('draft.ofSaved') : ''}</span>
            <span className={css.draftBtns}>
              <Link href={`/editor?draft=${d.id}`} className={css.contextAddBtn}>{t('draft.open')}</Link>
              <button type="button" className={css.linkBtn} onClick={() => { removeDraft(d.id); refresh(); }}>{t('draft.remove')}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
