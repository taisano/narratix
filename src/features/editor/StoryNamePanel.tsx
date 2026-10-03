'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { renameStory } from '@/lib/repo/stories';
import { useAuth } from '../shell/AppShell';
import { Fold } from './Fold';
import css from '../ui.module.css';

/**
 * ストーリーを編集している時の右の欄：名前と ✎（チャートの「保存」の欄の名前と同じ形）。
 * ストーリーの中身は自動で保存するので、ここは名前だけ。変えたらすぐ保存する
 */
export function StoryNamePanel({ id, name, fallback, onRenamed }: { id: string; name: string; fallback: string; onRenamed: (name: string) => void }) {
  const t = useT();
  const auth = useAuth();
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = value?.trim();
    if (!v || !auth.client) return;
    setBusy(true); setError(null);
    try { await renameStory(auth.client, id, v); onRenamed(v); setValue(null); }
    catch (err) { setError(t('my.actionError', { message: (err as Error).message ?? String(err) })); }
    finally { setBusy(false); }
  }
  return (
    <Fold id="story-name" title={t('story.nameHead')}>
      {value == null ? (
        <div className={css.docName}>
          <span className={css.docTitle} title={name || fallback}>{name || fallback}</span>
          <button type="button" className={css.iconBtn} aria-label={t('story.renameLabel')} title={t('story.renameLabel')} onClick={() => setValue(name || fallback)}>✎</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className={css.field}>
            <span>{t('save.nameLabel')}</span>
            <input className={css.input} autoFocus required maxLength={300} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <div className={css.buttons}>
            <button type="submit" className={css.primary} disabled={busy || !value.trim()}>{busy ? t('save.saving') : t('save.renameConfirm')}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setValue(null)}>{t('save.cancel')}</button>
          </div>
        </form>
      )}
      {error && <p className={css.error} role="alert">{error}</p>}
    </Fold>
  );
}
