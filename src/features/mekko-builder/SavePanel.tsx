'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import type { Auth } from '@/lib/supabase/useSession';
import { deleteChart, listCharts, loadChart, saveChart, type ChartSummary } from '@/lib/repo/charts';
import type { BuilderState } from './state';
import css from './builder.module.css';

/** 今開いている保存済みチャート（未保存なら id は null） */
export interface DocRef {
  id: string | null;
  version: number | null;
  /** 最後に保存・読み込みした時の状態（未保存の変更の判定に使う） */
  snapshot: string | null;
}

export const EMPTY_DOC: DocRef = { id: null, version: null, snapshot: null };

type Props = {
  auth: Auth;
  state: BuilderState;
  doc: DocRef;
  onLoaded: (state: BuilderState, doc: DocRef) => void;
  onSaved: (doc: DocRef) => void;
  onNew: () => void;
};

export function SavePanel({ auth, state, doc, onLoaded, onSaved, onNew }: Props) {
  const t = useT();
  const locale = useLocale();
  const [list, setList] = useState<ChartSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const sb = auth.client;
  const signedIn = !!auth.session;

  const refresh = useCallback(async () => {
    if (!sb || !signedIn) { setList(null); return; }
    try { setList(await listCharts(sb)); } catch (e) { setError(String((e as Error).message ?? e)); }
  }, [sb, signedIn]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!auth.enabled) return null;

  const dirty = doc.snapshot !== JSON.stringify(state);
  const status = !doc.id ? t('save.status.new') : dirty ? t('save.status.dirty', { version: doc.version ?? 0 }) : t('save.status.saved', { version: doc.version ?? 0 });

  async function run(fn: () => Promise<void>, errKey: 'save.error' | 'save.loadError') {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(t(errKey, { message: (e as Error).message ?? String(e) })); } finally { setBusy(false); }
  }
  const save = (asNew: boolean) => run(async () => {
    const r = await saveChart(sb!, asNew ? null : doc.id, state);
    onSaved({ id: r.id, version: r.version, snapshot: JSON.stringify(state) });
    await refresh();
  }, 'save.error');
  const open = (id: string) => run(async () => {
    const r = await loadChart(sb!, id);
    onLoaded(r.state, { id, version: r.version, snapshot: JSON.stringify(r.state) });
  }, 'save.loadError');
  const remove = (id: string) => run(async () => {
    await deleteChart(sb!, id);
    if (id === doc.id) onSaved(EMPTY_DOC);
    setConfirming(null);
    await refresh();
  }, 'save.error');

  return (
    <section className={css.card}>
      <h2>{t('save.section')}</h2>
      {auth.session === undefined ? null : !signedIn ? (
        <p className={css.note}>{t('save.loginToSave')}</p>
      ) : (
        <>
          <p className={`${css.note} ${dirty && doc.id ? css.dirty : ''}`} aria-live="polite">{status}</p>
          <div className={css.buttons}>
            <button type="button" className={css.primary} disabled={busy || (!!doc.id && !dirty)} onClick={() => save(false)}>
              {busy ? t('save.saving') : t('save.save')}
            </button>
            {doc.id && <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>{t('save.saveAsNew')}</button>}
            <button type="button" className="btn" disabled={busy} onClick={onNew}>{t('save.new')}</button>
          </div>
          {error && <p className={css.error} role="alert">{error}</p>}
          <h3 className={css.subhead}>{t('save.list')}</h3>
          {list && list.length === 0 && <p className={css.note}>{t('save.empty')}</p>}
          <ul className={css.docList}>
            {list?.map((c) => (
              <li key={c.id} className={c.id === doc.id ? css.docCurrent : undefined}>
                <div className={css.docMeta}>
                  <span className={css.docTitle}>{c.title || t('save.untitled')}</span>
                  <span className={css.docDate}>
                    {c.id === doc.id ? t('save.current') + ' · ' : ''}
                    {t('save.updated', { date: new Date(c.updatedAt).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), version: c.version })}
                  </span>
                </div>
                <div className={css.docActions}>
                  {c.id !== doc.id && <button type="button" className={css.linkBtn} disabled={busy} onClick={() => open(c.id)}>{t('save.open')}</button>}
                  <button
                    type="button"
                    className={`${css.linkBtn} ${confirming === c.id ? css.danger : ''}`}
                    disabled={busy}
                    onClick={() => (confirming === c.id ? remove(c.id) : setConfirming(c.id))}
                    onBlur={() => setConfirming((x) => (x === c.id ? null : x))}
                  >
                    {confirming === c.id ? t('save.confirmDelete') : t('save.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
