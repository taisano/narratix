'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { publishToLibrary } from '@/lib/repo/library';
import { viewOf, type ProjectState } from '../editor/project';
import { useAuth } from '../shell/AppShell';
import css from '../ui.module.css';

/** 管理者だけ：今のプロジェクトを Library の見本として公開する（データごと。見た人が複製して使う） */
export function PublishToLibrary({ project }: { project: ProjectState }) {
  const t = useT();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!auth.client || !title.trim()) return;
    setStatus({ kind: 'busy' });
    try { await publishToLibrary(auth.client, { title, description, category, project }); setStatus({ kind: 'done' }); setOpen(false); }
    catch (err) { setStatus({ kind: 'error', message: (err as Error).message ?? String(err) }); }
  }

  if (!open) {
    return (
      <div className={css.buttons}>
        <button type="button" className="btn" onClick={() => { setTitle(viewOf(project, 0).title); setOpen(true); setStatus({ kind: 'idle' }); }}>{t('library.publish')}</button>
        {status.kind === 'done' && <span className={css.note}>{t('library.published')} <Link href="/library" className={css.linkBtn}>{t('library.open')}</Link></span>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className={css.nameForm}>
      <p className={css.note}>{t('library.publishNote')}</p>
      <label className={css.field}><span>{t('library.fieldTitle')}</span><input className={css.input} required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
      <label className={css.field}><span>{t('library.fieldDesc')}</span><textarea className={css.input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></label>
      <label className={css.field}><span>{t('library.fieldCategory')}</span><input className={css.input} value={category} placeholder={t('library.categoryPlaceholder')} onChange={(e) => setCategory(e.target.value)} maxLength={40} /></label>
      <div className={css.buttons}>
        <button type="submit" className={css.primary} disabled={status.kind === 'busy' || !title.trim()}>{t('library.publishConfirm')}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>{t('save.cancel')}</button>
      </div>
      {status.kind === 'error' && <p className={css.error} role="alert">{status.message}</p>}
    </form>
  );
}
