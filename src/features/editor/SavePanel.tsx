'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { listCharts, renameChart, saveChart, setChartTags } from '@/lib/repo/charts';
import { LANG_TAGS, tagCounts, userTags, withLangTag } from '@/lib/tags';
import { TagInput, TagList } from '../shared/Tags';
import { linkChart } from '@/lib/repo/history';
import { useAuth } from '../shell/AppShell';
import { viewOf, type ProjectState } from './project';
import { hasUnsavedChanges, type DocRef } from './storage';
import { sampleLeftovers } from './leftovers';
import { useConfirm } from '../shared/Confirm';
import css from '../ui.module.css';
import { Fold } from './Fold';
import { PublishToLibrary } from '../library/PublishToLibrary';
import { useIsAdmin } from '../library/useIsAdmin';

type Props = {
  state: ProjectState;
  doc: DocRef;
  /** how='saved'：チャートとして保存した（下書きは消す）。それ以外は名前・タグ・見本の更新 */
  onSaved: (doc: DocRef, how?: 'saved') => void;
  /** 今の編集を下書きに残す（ログイン中はアカウント、そうでなければこのブラウザ） */
  onKeepDraft?: () => Promise<unknown>;
  onNew: () => void;
  /** 数字の意味が合わないスライドがある（重大）。保存・公開を止め、理由を出す */
  blocked?: boolean;
  /** 今の編集をやめる（保存済みなら最後に保存した状態へ戻す。まだ保存していなければ捨てる） */
  onDiscard?: () => void;
  /** 見本の「伝えたいこと」（料理 ID）を付ける時に、プロジェクトを直す（管理者だけ） */
  setProject?: (p: ProjectState) => void;
};

/** 名前の入力欄を出している理由 */
type NameMode = { kind: 'save' | 'saveAs' | 'rename'; value: string; tags: string[] } | null;

/** 左上の保存パネル。一覧の管理はマイページで行う */
export function SavePanel({ state, doc, onSaved, onNew, blocked = false, onDiscard, onKeepDraft, setProject }: Props) {
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
  const confirm = useConfirm();
  /** 「このまま保存する」を選んだ時の残り（同じ残りのままなら、次からは聞かない） */
  const acceptedLeft = useRef<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  /** 下書きに残す。残せたら「残しました」を少しだけ出す */
  const keepDraft = async () => {
    if (!onKeepDraft) return;
    setBusy(true); setError(null); setDraftNote(null);
    try { await onKeepDraft(); setDraftNote(t('draft.saved')); setTimeout(() => setDraftNote(null), 4000); }
    catch (e) { setError(t('draft.saveError', { message: (e as Error).message ?? String(e) })); }
    finally { setBusy(false); }
  };
  // 下書きに残せるのは、残した時から（または見本から）変えた時だけ
  const canKeepDraft = !!onKeepDraft && !doc.library && hasUnsavedChanges(state, doc);
  const draftBtn = canKeepDraft && (
    <button type="button" className="btn" disabled={busy} onClick={keepDraft}>{t('draft.saveButton')}</button>
  );
  const discardBtn = onDiscard && hasUnsavedChanges(state, doc) && (
    <button type="button" className={css.linkBtn} disabled={busy} onClick={onDiscard}>
      {doc.draftSnapshot ? t('discard.revertDraftButton') : doc.snapshot ? t('discard.revertButton') : t('discard.button')}
    </button>
  );

  if (!auth.enabled) return null;
  if (auth.session === undefined) return <Fold id="save" title={t('save.section')}>{null}</Fold>;
  if (!auth.session) {
    return (
      <Fold id="save" title={t('save.section')}>
        <p className={css.note}>{t('save.loginToSave')}</p>
        {(draftBtn || discardBtn) && <div className={css.buttons}>{draftBtn}{discardBtn}</div>}
        {doc.draftId && <p className={css.note}>{t('draft.localOnly')}</p>}
        {draftNote && <p className={css.note} role="status">{draftNote}</p>}
        {error && <p className={css.error} role="alert">{error}</p>}
      </Fold>
    );
  }

  const dirty = doc.id ? hasUnsavedChanges(state, doc) : true;
  const drafted = !!doc.draftId;
  const status = !doc.id ? (drafted ? t(hasUnsavedChanges(state, doc) ? 'save.status.draftDirty' : 'save.status.draft') : t('save.status.new')) : dirty ? t('save.status.dirty', { version: doc.version ?? 0 }) : t('save.status.saved', { version: doc.version ?? 0 });

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); setNameMode(null); } catch (e) { setError(t('save.error', { message: (e as Error).message ?? String(e) })); } finally { setBusy(false); }
  }
  /** 見本（仮）のタイトル・出典・データが残っていたら、保存の前に知らせる（PPT の出力と同じ）。止めはしない */
  async function okToSave(): Promise<boolean> {
    const left = sampleLeftovers(state);
    const key = left.join(',');
    if (!left.length || acceptedLeft.current === key) return true;
    const ok = await confirm({
      title: t('leftover.saveTitle'),
      body: [t('leftover.confirmLead'), ...left.map((k) => '・' + t(`leftover.item.${k}`)), '', t('leftover.saveTail')].join('\n'),
      ok: t('leftover.saveAnyway'),
    });
    if (ok) acceptedLeft.current = key;
    return ok;
  }
  const save = async (id: string | null, name: string | null, tags: string[] | null = null) => (await okToSave()) && act(async () => {
    const r = await saveChart(sb!, id, state, name);
    // タグ：言語のタグは保存のたびに付け直す（スライドの言語を変えても合うように）。タグだけ失敗しても保存はできている
    const want = tags ?? userTags(doc.tags);
    const saved = await setChartTags(sb!, r.id, want, state).catch(() => withLangTag(want, state.slideLocale));
    // 相談から作ったチャートなら、相談の履歴とつなぐ
    const hid = state.recommendation?.consultation_history_id;
    if (hid) await linkChart(sb!, hid, r.id).catch(() => {});
    onSaved({ id: r.id, version: r.version, name: name ?? doc.name ?? viewOf(state, 0).title, snapshot: JSON.stringify(state), tags: saved }, 'saved');
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
            <button type="submit" className={css.primary} disabled={busy || blocked || !nameMode.value.trim()}>
              {busy ? t('save.saving') : nameMode.kind === 'rename' ? t('save.renameConfirm') : t('save.confirm')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setNameMode(null)}>{t('save.cancel')}</button>
          </div>
        </form>
      ) : (
        <div className={css.buttons}>
          <button
            type="button" className={css.primary} disabled={busy || blocked || (!!doc.id && !dirty)} title={blocked ? t('meaning.blocked') : undefined}
            onClick={() => (doc.id ? save(doc.id, null) : setNameMode({ kind: 'save', value: doc.name ?? viewOf(state, 0).title, tags: userTags(doc.tags) }))}
          >
            {busy ? t('save.saving') : t('save.save')}
          </button>
          {doc.id && (
            <button type="button" className="btn" disabled={busy || blocked} onClick={() => setNameMode({ kind: 'saveAs', value: t('my.copySuffix', { name: doc.name ?? viewOf(state, 0).title }), tags: userTags(doc.tags) })}>
              {t('save.saveAsNew')}
            </button>
          )}
          {/* 途中の作業は「下書き」へ（完成したら「保存」でチャートへ） */}
          {draftBtn}
          <button type="button" className="btn" disabled={busy} onClick={onNew}>{t('save.new')}</button>
          {/* 作り始めたけれど、やめたい時（保存するしかない、にしない） */}
          {discardBtn}
        </div>
      )}
      {draftNote && <p className={css.note} role="status">{draftNote}</p>}
      {blocked && <p className={css.blockedNote} role="status">{t('meaning.blocked')}</p>}
      {error && <p className={css.error} role="alert">{error}</p>}
      <p className={css.toMyPage}><Link href="/charts">{t('save.toMyPage')} →</Link></p>
      {admin && !blocked && <PublishToLibrary project={state} doc={doc} setProject={setProject} onUpdated={(snapshot) => onSaved({ ...doc, snapshot })} />}
    </Fold>
  );
}
