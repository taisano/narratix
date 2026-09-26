'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { listLibrary, publishToLibrary, updateLibraryItem } from '@/lib/repo/library';
import type { DocRef } from '../editor/storage';
import { LANG_TAGS, tagCounts, userTags } from '@/lib/tags';
import { TagInput } from '../shared/Tags';
import { viewOf, type ProjectState } from '../editor/project';
import { useAuth } from '../shell/AppShell';
import css from '../ui.module.css';

/** 管理者だけ：今のプロジェクトを Library の見本として公開する（データごと。見た人が複製して使う） */
export function PublishToLibrary({ project, doc, onUpdated }: { project: ProjectState; doc?: DocRef; onUpdated?: (snapshot: string) => void }) {
  const t = useT();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!auth.client || !title.trim()) return;
    setStatus({ kind: 'busy' });
    try { await publishToLibrary(auth.client, { title, description, tags, project }); setStatus({ kind: 'done' }); setOpen(false); }
    catch (err) { setStatus({ kind: 'error', message: (err as Error).message ?? String(err) }); }
  }

  // 見本そのものを直している時：上書きで更新（名前・説明・タグは Library の「編集」で）
  const lib = doc?.library;
  async function update() {
    if (!auth.client || !lib) return;
    setStatus({ kind: 'busy' });
    try {
      await updateLibraryItem(auth.client, lib.id, { project, tags: userTags(lib.tags) });
      onUpdated?.(JSON.stringify(project));
      setStatus({ kind: 'done' });
    } catch (err) { setStatus({ kind: 'error', message: (err as Error).message ?? String(err) }); }
  }

  if (lib && !open) {
    return (
      <div className={css.libEdit}>
        <p className={css.note}>{t('library.editingNote', { title: lib.title })}</p>
        <div className={css.buttons}>
          <button type="button" className={css.primary} disabled={status.kind === 'busy'} onClick={update}>{t('library.update')}</button>
          <Link href="/library" className={css.linkBtn}>{t('library.open')}</Link>
        </div>
        {status.kind === 'done' && <p className={css.note}>{t('library.updated')}</p>}
        {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className={css.buttons}>
        <button type="button" className="btn" onClick={() => {
          setTitle(viewOf(project, 0).title); setTags([]); setOpen(true); setStatus({ kind: 'idle' });
          // 前に使ったタグを候補に
          if (auth.client) void listLibrary(auth.client).then((l) => setKnown(tagCounts(l.map((x) => x.tags)))).catch(() => {});
        }}>{t('library.publish')}</button>
        {status.kind === 'done' && <span className={css.note}>{t('library.published')} <Link href="/library" className={css.linkBtn}>{t('library.open')}</Link></span>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className={css.nameForm}>
      <p className={css.note}>{t('library.publishNote')}</p>
      <label className={css.field}><span>{t('library.fieldTitle')}</span><input className={css.input} required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
      <label className={css.field}><span>{t('library.fieldDesc')}</span><textarea className={css.input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></label>
      <div className={css.field}><span>{t('tags.label')}</span><TagInput label={t('tags.label')} value={tags} onChange={setTags} autoTag={LANG_TAGS[project.slideLocale]} suggestions={known} /></div>
      <div className={css.buttons}>
        <button type="submit" className={css.primary} disabled={status.kind === 'busy' || !title.trim()}>{t('library.publishConfirm')}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>{t('save.cancel')}</button>
      </div>
      {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
    </form>
  );
}
