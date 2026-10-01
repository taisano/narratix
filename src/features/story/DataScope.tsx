'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { attachShared, detachData, ownDataRef, renameData, type ProjectState } from '../editor/project';
import { useConfirm } from '../shared/Confirm';
import css from '../ui.module.css';
import nav from './nav.module.css';

/**
 * データの欄の見出しの下（ストーリーの編集画面）：今のデータをどの問いと共有しているか、と切り替え（docs/story-spec.md 10.1）。
 * 共通のデータ → ［このスライドだけ別のデータにする］（今のデータを複製）。
 * このスライドだけのデータ → 名前・［名前を変える］・［共通のデータに戻す］
 */
export function DataScope({ project, setProject, share }: {
  project: ProjectState; setProject: (f: (p: ProjectState) => ProjectState) => void;
  /** 同じデータを使う問いの並び（「メインストーリーの問い 1・2」など。1つの問いだけなら null） */
  share: string | null;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const slide = project.slides[project.current];
  if (!slide) return null;
  const own = ownDataRef(project, slide);
  const label = own ? project.extra![own]!.label : '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (own && renaming?.trim()) setProject((p) => renameData(p, own, renaming));
    setRenaming(null);
  }

  if (!own) {
    if (!share) return null;
    return (
      // 共通のデータ：ここを変えるとほかの問いも変わることを、いつも目立つ形で出す（意図せずほかのスライドを変えないように）
      <div className={`${nav.scope} ${nav.scopeShared}`} role="note">
        <p className={nav.scopeLead}>{t('nav.dataShared', { list: share })}</p>
        <p className={nav.scopeRow}>
          <button type="button" className="btn" onClick={() => setProject((p) => detachData(p))}>{t('data.detachShort')}</button>
          <span className={nav.small}>{t('data.detachNote')}</span>
        </p>
      </div>
    );
  }
  return (
    <div className={nav.scope}>
      {renaming != null ? (
        <form className={nav.scopeRow} onSubmit={submit}>
          <input className={css.input} autoFocus aria-label={t('data.nameLabel')} value={renaming} maxLength={60} onChange={(e) => setRenaming(e.target.value)} />
          <button type="submit" className="btn" disabled={!renaming.trim()}>{t('save.renameConfirm')}</button>
          <button type="button" className={css.linkBtn} onClick={() => setRenaming(null)}>{t('save.cancel')}</button>
        </form>
      ) : (
        <p className={css.note}>{share ? t('data.ownShared', { name: label, list: share }) : t('data.own', { name: label })}</p>
      )}
      {renaming == null && (
        <p className={nav.scopeRow}>
          <button type="button" className={css.linkBtn} onClick={() => setRenaming(label)}>{t('data.rename')}</button>
          <button type="button" className={css.linkBtn} onClick={async () => {
            if (await confirm({ title: t('data.attachTitle'), body: t('data.attachBody'), ok: t('data.attachOk') })) setProject((p) => attachShared(p));
          }}>{t('data.attach')}</button>
        </p>
      )}
    </div>
  );
}
