'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { useConfirm } from '../shared/Confirm';
import { useAuth } from '../shell/AppShell';
import { draftStore, moveLocalDraftsToAccount, type Draft } from './drafts';
import { EMPTY_DOC, hasUnsavedChanges, readStored, writeStored } from './storage';
import { initialProject, viewOf } from './project';
import css from '../ui.module.css';

/** このブラウザで編集中で、まだどこにも残していない作業（編集画面に残っているもの）。無ければ null */
function currentWork(): { title: string; slides: number; ofSaved: boolean } | null {
  const s = readStored();
  if (!s.state) return null;
  const doc = s.doc ?? EMPTY_DOC;
  if (!hasUnsavedChanges(s.state, doc)) return null;
  return { title: doc.name || viewOf(s.state, 0).title || '', slides: s.state.slides.length, ofSaved: !!doc.id };
}

/**
 * マイチャートの「下書き」タブ：チャートとしてまだ保存していない作業。
 * ・ログイン中はアカウントの下書き（どの PC からでも）。このブラウザに残っていた下書きは、開いた時にアカウントへ移す
 * ・ログインしていない時は、このブラウザの下書き
 * ・このブラウザで編集中の作業（まだ残していないもの）：［開いて続ける］［捨てる］
 * 件数は onCount で知らせる（タブの「下書き（n）」）
 */
export function DraftsList({ onCount, hidden = false }: { onCount?: (n: number) => void; hidden?: boolean } = {}) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const auth = useAuth();
  const remote = !!(auth.session && auth.client);
  const store = useMemo(() => draftStore(remote ? auth.client : null), [remote, auth.client]);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [current, setCurrent] = useState<ReturnType<typeof currentWork>>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const list = await store.list();
      const cur = currentWork();
      setDrafts(list); setCurrent(cur); onCount?.(list.length + (cur ? 1 : 0));
    } catch (e) { setError(t('draft.loadError', { message: (e as Error).message ?? String(e) })); setDrafts([]); }
  };
  useEffect(() => {
    if (auth.session === undefined) return;
    void (async () => {
      if (remote) { const n = await moveLocalDraftsToAccount(auth.client!).catch(() => 0); if (n) setNote(t('draft.moved', { n })); }
      await refresh();
    })();
    // ログイン状態が決まった時・変わった時に読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, auth.session === undefined]);

  const when = (ms: number) => new Date(ms).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  // 件数だけ知りたい時（ほかのタブを開いている時）は、何も出さない
  if (hidden || !drafts) return null;
  if (!drafts.length && !current) return <>{error && <p className={css.error} role="alert">{error}</p>}<p className={css.draftsEmpty}>{t('draft.empty')}</p></>;
  return (
    <section className={css.drafts} aria-label={t('draft.headPlain')}>
      <p className={css.draftsNote}>{t(remote ? 'draft.noteRemote' : 'draft.note')}</p>
      {note && <p className={css.note} role="status">{note}</p>}
      {error && <p className={css.error} role="alert">{error}</p>}
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
                void refresh();
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
              <button type="button" className={css.linkBtn} onClick={async () => {
                if (!(await confirm({ title: t('draft.removeTitle', { name: d.title || t('draft.untitled') }), body: t('draft.removeBody'), ok: t('draft.remove'), danger: true }))) return;
                try { await store.remove(d.id); } catch (e) { setError(t('draft.loadError', { message: (e as Error).message ?? String(e) })); }
                void refresh();
              }}>{t('draft.remove')}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
