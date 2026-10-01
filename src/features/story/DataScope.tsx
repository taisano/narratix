'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { attachShared, dataAsk, detachData, keepSharedData, ownDataRef, renameData, type ProjectState } from '../editor/project';
import { useConfirm } from '../shared/Confirm';
import css from '../ui.module.css';
import nav from './nav.module.css';

/**
 * データの欄の見出しの下（ストーリーの編集画面）：今のデータをどの問いと共有しているか、と切り替え（docs/story-spec.md 10.1）。
 * 共通のデータ：ほかのスライドで入れたデータがあれば「n枚目で入れたデータを使いますか？」（このまま使う／別のデータを入れる＝見本から）。
 * 決めた後・共有している時は小さな注記だけ（言い切らない）。見本のままなら何も出さない。
 * このスライドだけのデータ → 名前・［名前を変える］・［共通のデータに戻す］
 */
export function DataScope({ project, setProject, share, sample }: {
  project: ProjectState; setProject: (f: (p: ProjectState) => ProjectState) => void;
  /** 同じデータを使う問いの並び（「メインストーリーの問い 1・2」など。1つの問いだけなら null） */
  share: string | null;
  /** 今のデータが見本のまま（誰もまだデータを入れていない。共有の知らせは出さない） */
  sample: boolean;
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
    // ほかのスライドで入れたデータがあれば、ゆるく聞く（言い切らない。違うデータを持っていることも、違う切り口のこともある）
    const ask = dataAsk(project);
    if (ask) {
      const sep = t('nav.dataSharedJoin') === 'と' ? '・' : ', ';
      const what = [ask.cols.slice(0, 2).join(sep) + (ask.cols.length > 2 ? t('data.askEtc') : ''), ask.years ? t('data.askYears', { from: ask.years[0], to: ask.years[1] }) : ''].filter(Boolean).join(t('data.askSep'));
      return (
        <div className={`${nav.scope} ${nav.scopeAsk}`} role="note">
          <p className={nav.scopeLead}>{t('data.ask', { n: ask.from.join(sep), what })}</p>
          <p className={nav.scopeRow}>
            <button type="button" className="btn" onClick={() => setProject((p) => keepSharedData(p))}>{t('data.askKeep')}</button>
            <button type="button" className="btn" onClick={() => setProject((p) => detachData(p, p.current, undefined, 'sample'))}>{t('data.askOwn')}</button>
          </p>
          <p className={nav.small}>{t('data.askNote')}</p>
        </div>
      );
    }
    // 見本のまま（まだ誰もデータを入れていない）は何も出さない。共有している時は、小さな注記だけ
    if (!share || sample) return null;
    return (
      <div className={nav.scope}>
        <p className={css.note}>{t('data.sharedSoft', { list: share })}</p>
        <p className={nav.scopeRow}>
          <button type="button" className={css.linkBtn} onClick={() => setProject((p) => detachData(p, p.current, undefined, 'sample'))}>{t('data.askOwn')}</button>
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
