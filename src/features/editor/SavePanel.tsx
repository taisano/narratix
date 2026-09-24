'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { renameChart, saveChart } from '@/lib/repo/charts';
import { useAuth } from '../shell/AppShell';
import type { BuilderState } from './state';
import { hasUnsavedChanges, type DocRef } from './storage';
import css from '../ui.module.css';
import { Fold } from './Fold';

type Props = {
  state: BuilderState;
  doc: DocRef;
  onSaved: (doc: DocRef) => void;
  onNew: () => void;
};

/** 名前の入力欄を出している理由 */
type NameMode = { kind: 'save' | 'saveAs' | 'rename'; value: string } | null;

/** 左上の保存パネル。一覧の管理はマイページで行う */
export function SavePanel({ state, doc, onSaved, onNew }: Props) {
  const t = useT();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameMode, setNameMode] = useState<NameMode>(null);
  const sb = auth.client;

  if (!auth.enabled) return null;
  if (auth.session === undefined) return <Fold id="save" title={t('save.section')}>{null}</Fold>;
  if (!auth.session) {
    return (
      <Fold id="save" title={t('save.section')}>
        <p className={css.note}>{t('save.loginToSave')}</p>
      </Fold>
    );
  }

  const dirty = doc.id ? hasUnsavedChanges(state, doc) : true;
  const status = !doc.id ? t('save.status.new') : dirty ? t('save.status.dirty', { version: doc.version ?? 0 }) : t('save.status.saved', { version: doc.version ?? 0 });

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); setNameMode(null); } catch (e) { setError(t('save.error', { message: (e as Error).message ?? String(e) })); } finally { setBusy(false); }
  }
  const save = (id: string | null, name: string | null) => act(async () => {
    const r = await saveChart(sb!, id, state, name);
    onSaved({ id: r.id, version: r.version, name: name ?? doc.name ?? state.title, snapshot: JSON.stringify(state) });
  });

  function submitName(e: FormEvent) {
    e.preventDefault();
    if (!nameMode) return;
    const name = nameMode.value.trim();
    if (!name) return;
    if (nameMode.kind === 'rename') void act(async () => { await renameChart(sb!, doc.id!, name); onSaved({ ...doc, name }); });
    else void save(nameMode.kind === 'save' ? doc.id : null, name);
  }

  return (
    <Fold id="save" title={t('save.section')}>
      {doc.id && nameMode?.kind !== 'rename' && (
        <div className={css.docName}>
          <span className={css.docTitle}>{doc.name || t('save.untitled')}</span>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => setNameMode({ kind: 'rename', value: doc.name ?? '' })}>{t('save.rename')}</button>
        </div>
      )}
      <p className={`${css.note} ${dirty && doc.id ? css.dirty : ''}`} aria-live="polite">{status}</p>

      {nameMode ? (
        <form onSubmit={submitName} className={css.nameForm}>
          <label className={css.field}>
            <span>{t('save.nameLabel')}</span>
            <input className={css.input} autoFocus required value={nameMode.value} placeholder={t('save.namePlaceholder')}
              onChange={(e) => setNameMode({ ...nameMode, value: e.target.value })} />
          </label>
          <div className={css.buttons}>
            <button type="submit" className={css.primary} disabled={busy || !nameMode.value.trim()}>
              {busy ? t('save.saving') : nameMode.kind === 'rename' ? t('save.renameConfirm') : t('save.confirm')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setNameMode(null)}>{t('save.cancel')}</button>
          </div>
        </form>
      ) : (
        <div className={css.buttons}>
          <button
            type="button" className={css.primary} disabled={busy || (!!doc.id && !dirty)}
            onClick={() => (doc.id ? save(doc.id, null) : setNameMode({ kind: 'save', value: state.title }))}
          >
            {busy ? t('save.saving') : t('save.save')}
          </button>
          {doc.id && (
            <button type="button" className="btn" disabled={busy} onClick={() => setNameMode({ kind: 'saveAs', value: t('my.copySuffix', { name: doc.name ?? state.title }) })}>
              {t('save.saveAsNew')}
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={onNew}>{t('save.new')}</button>
        </div>
      )}
      {error && <p className={css.error} role="alert">{error}</p>}
      <p className={css.toMyPage}><Link href="/charts">{t('save.toMyPage')} →</Link></p>
    </Fold>
  );
}
