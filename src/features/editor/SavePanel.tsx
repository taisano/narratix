'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { listCharts, renameChart, saveChart, setChartTags } from '@/lib/repo/charts';
import { LANG_TAGS, tagCounts, userTags, withLangTag } from '@/lib/tags';
import { TagInput, TagList } from '../shared/Tags';
import { linkChart } from '@/lib/repo/history';
import { useAuth } from '../shell/AppShell';
import { viewOf, type ProjectState } from './project';
import { hasUnsavedChanges, type DocRef } from './storage';
import css from '../ui.module.css';
import { Fold } from './Fold';
import { PublishToLibrary } from '../library/PublishToLibrary';
import { useIsAdmin } from '../library/useIsAdmin';

type Props = {
  state: ProjectState;
  doc: DocRef;
  onSaved: (doc: DocRef) => void;
  onNew: () => void;
};

/** 名前の入力欄を出している理由 */
type NameMode = { kind: 'save' | 'saveAs' | 'rename'; value: string; tags: string[] } | null;

/** 左上の保存パネル。一覧の管理はマイページで行う */
export function SavePanel({ state, doc, onSaved, onNew }: Props) {
  const t = useT();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameMode, setNameMode0] = useState<NameMode>(null);
  const [known, setKnown] = useState<string[]>([]);
  /** 名前・タグの欄を開く。前に使ったタグを候補にする */
  const setNameMode = (m: NameMode) => {
    setNameMode0(m);
    if (m && !nameMode && auth.client) void listCharts(auth.client).then((l) => setKnown(tagCounts(l.map((c) => c.tags)))).catch(() => {});
  };
  const sb = auth.client;
  const admin = useIsAdmin();

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
  const save = (id: string | null, name: string | null, tags: string[] | null = null) => act(async () => {
    const r = await saveChart(sb!, id, state, name);
    // タグ：言語のタグは保存のたびに付け直す（スライドの言語を変えても合うように）。タグだけ失敗しても保存はできている
    const want = tags ?? userTags(doc.tags);
    const saved = await setChartTags(sb!, r.id, want, state).catch(() => withLangTag(want, state.slideLocale));
    // 相談から作ったチャートなら、相談の履歴とつなぐ
    const hid = state.recommendation?.consultation_history_id;
    if (hid) await linkChart(sb!, hid, r.id).catch(() => {});
    onSaved({ id: r.id, version: r.version, name: name ?? doc.name ?? viewOf(state, 0).title, snapshot: JSON.stringify(state), tags: saved });
  });

  function submitName(e: FormEvent) {
    e.preventDefault();
    if (!nameMode) return;
    const name = nameMode.value.trim();
    if (!name) return;
    if (nameMode.kind === 'rename') void act(async () => {
      await renameChart(sb!, doc.id!, name);
      const tags = await setChartTags(sb!, doc.id!, nameMode.tags, state);
      onSaved({ ...doc, name, tags });
    });
    else void save(nameMode.kind === 'save' ? doc.id : null, name, nameMode.tags);
  }

  return (
    <Fold id="save" title={t('save.section')}>
      {doc.id && nameMode?.kind !== 'rename' && (
        <div className={css.docName}>
          <span className={css.docTitle}>{doc.name || t('save.untitled')}</span>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => setNameMode({ kind: 'rename', value: doc.name ?? '', tags: userTags(doc.tags) })}>{t('save.renameTags')}</button>
        </div>
      )}
      {doc.id && nameMode?.kind !== 'rename' && <TagList tags={doc.tags?.length ? doc.tags : withLangTag([], state.slideLocale)} />}
      <p className={`${css.note} ${dirty && doc.id ? css.dirty : ''}`} aria-live="polite">{status}</p>

      {nameMode ? (
        <form onSubmit={submitName} className={css.nameForm}>
          <label className={css.field}>
            <span>{t('save.nameLabel')}</span>
            <input className={css.input} autoFocus required value={nameMode.value} placeholder={t('save.namePlaceholder')}
              onChange={(e) => setNameMode({ ...nameMode, value: e.target.value })} />
          </label>
          <div className={css.field}>
            <span>{t('tags.labelOptional')}</span>
            <TagInput label={t('tags.label')} value={nameMode.tags} onChange={(tags) => setNameMode({ ...nameMode, tags })} autoTag={LANG_TAGS[state.slideLocale]} suggestions={known} />
          </div>
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
            onClick={() => (doc.id ? save(doc.id, null) : setNameMode({ kind: 'save', value: doc.name ?? viewOf(state, 0).title, tags: userTags(doc.tags) }))}
          >
            {busy ? t('save.saving') : t('save.save')}
          </button>
          {doc.id && (
            <button type="button" className="btn" disabled={busy} onClick={() => setNameMode({ kind: 'saveAs', value: t('my.copySuffix', { name: doc.name ?? viewOf(state, 0).title }), tags: userTags(doc.tags) })}>
              {t('save.saveAsNew')}
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={onNew}>{t('save.new')}</button>
        </div>
      )}
      {error && <p className={css.error} role="alert">{error}</p>}
      <p className={css.toMyPage}><Link href="/charts">{t('save.toMyPage')} →</Link></p>
      {admin && <PublishToLibrary project={state} />}
    </Fold>
  );
}
