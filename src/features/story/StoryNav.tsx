'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/ui';
import type { ProjectState } from '../editor/project';
import { groupOf, neighbor } from './storyOps';
import { orderedQuestions } from './storyProject';
import { NeedPicker, QuestionList } from './QuestionMap';
import { EXEC_SUMMARY_ROLE } from '@/registry';
import { storyDisplayTitle, type StorySlide, type StoryState } from './model';
import css from './nav.module.css';

export type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * 編集画面の左：Story の目的と、問いの一覧（docs/decisions.md「Story 編集画面の整理」）。
 * 一番上に目的（決めたいこと）を1回だけ大きめに、横の「…」に Story 全体の操作（伝え方を選び直す・最初から作り直す）。
 * 一覧の各行は 番号・問い・↑↓・× だけ。今の問いは色（背景と左端の線）だけで示し、状態の文言は出さない。
 * × は「Story から外す」（確認して外し、通知から元に戻せる）。外した問いは下の「外した問い」から元の位置へ戻せる。
 * 保存は失敗した時だけ知らせる
 */
export function StoryNav({ name, story, project, save, onSelect, onMove, onOrganize, onRemove, onRestore, onRename, suggest, menu }: {
  name: string; story: StoryState; project: ProjectState; save: StorySaveStatus;
  onSelect: (q: StorySlide) => void; onMove: (id: string, dir: -1 | 1) => void; onOrganize: () => void;
  /** Story から外す（確認は呼ぶ側）／戻す（元の位置へ） */
  onRemove: (id: string) => void; onRestore: (id: string) => void;
  /** 今の問いをその場で書き換える */
  onRename?: (id: string, question: string) => void;
  /** 見せ方を替えたが、問いを自分で書き換えていたので替えなかった時の、替える先の問い */
  suggest?: string | null;
  /** 「…」メニューの項目 */
  menu: { label: string; onClick: () => void }[];
}) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const currentId = project.slides[project.current]?.id ?? null;
  const ordered = orderedQuestions(story);
  const isExec = (q: StorySlide) => q.routeRole === EXEC_SUMMARY_ROLE;
  const removed = story.slides.filter((q) => groupOf(q) === 'OUT');
  const purpose = story.decisionQuestion.trim() || name || storyDisplayTitle(story) || t('story.untitled');
  useEffect(() => { setEditing(null); }, [currentId]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);
  const groups: { g: 'MAIN' | 'APPENDIX' }[] = [{ g: 'MAIN' }, { g: 'APPENDIX' }];
  let n = 0;
  return (
    <nav className={css.nav} aria-label={t('nav.label')}>
      <div className={css.headRow}>
        <span className={css.headLabel}>{t('nav.storyLabel')}</span>
        {menu.length > 0 && (
          <span className={css.menuWrap}>
            <button type="button" className={css.menuBtn} aria-label={t('nav.menu')} aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>…</button>
            {menuOpen && (
              <span className={css.menu} role="menu">
                {menu.map((m) => <button key={m.label} type="button" role="menuitem" onClick={() => { setMenuOpen(false); m.onClick(); }}>{m.label}</button>)}
              </span>
            )}
          </span>
        )}
      </div>
      <p className={css.purpose}>{purpose}</p>
      {save === 'error' && <p className={css.saveErr} role="alert">{t('story.save.error')}</p>}
      <div className={css.flowBox}>
        {groups.map(({ g }) => {
          const list = ordered.filter((q) => groupOf(q) === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              {g === 'APPENDIX' && <p className={css.group}>{t('story.section.APPENDIX')}</p>}
              <ol className={css.list}>
                {list.map((q) => {
                  const num = g === 'MAIN' ? ++n : null;
                  const cur = q.id === currentId;
                  return (
                    <li key={q.id} className={css.row} data-current={cur}>
                      <button type="button" className={css.pick} aria-current={cur ? 'step' : undefined} onClick={() => onSelect(q)}>
                        {num != null && <span className={css.num}>{num}</span>}
                        {!(cur && editing != null) && <span className={css.q}>{q.question || '—'}</span>}
                      </button>
                      <span className={css.tools}>
                        {cur && onRename && editing == null && (
                          <button type="button" className={css.tool} aria-label={t('nav.qEdit')} title={t('nav.qEdit')} onClick={() => setEditing(q.question)}>✎</button>
                        )}
                        {!isExec(q) && <>
                          <button type="button" className={css.tool} aria-label={t('story.upLabel')} disabled={neighbor(story, q.id, -1) < 0} onClick={() => onMove(q.id, -1)}>↑</button>
                          <button type="button" className={css.tool} aria-label={t('story.downLabel')} disabled={neighbor(story, q.id, 1) < 0} onClick={() => onMove(q.id, 1)}>↓</button>
                        </>}
                        <button type="button" className={css.tool} aria-label={t('nav.remove')} title={t('nav.remove')} onClick={() => onRemove(q.id)}>×</button>
                      </span>
                      {cur && onRename && (editing != null ? (
                        <form className={css.qEdit} onSubmit={(e) => { e.preventDefault(); if (editing.trim()) onRename(q.id, editing.trim()); setEditing(null); }}>
                          <textarea className={css.qInput} autoFocus aria-label={t('nav.qEdit')} value={editing} maxLength={500} rows={3}
                            onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }} />
                          <span className={css.qEditBtns}>
                            <button type="submit" className="btn" disabled={!editing.trim()}>{t('save.renameConfirm')}</button>
                            <button type="button" className={css.linkSm} onClick={() => setEditing(null)}>{t('save.cancel')}</button>
                          </span>
                        </form>
                      ) : suggest && suggest !== q.question ? (
                        <span className={css.qTools}>
                          <button type="button" className={css.linkSm} title={suggest} onClick={() => onRename(q.id, suggest)}>{t('nav.qSuggest', { q: suggest })}</button>
                        </span>
                      ) : null)}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      {removed.length > 0 && (
        <details className={css.removed}>
          <summary>{t('nav.removed', { n: removed.length })}</summary>
          <ul>
            {removed.map((q) => (
              <li key={q.id}><span>{q.question || '—'}</span><button type="button" className={css.linkSm} onClick={() => onRestore(q.id)}>{t('nav.restore')}</button></li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" className={css.organize} onClick={onOrganize}>{t('nav.organize')}</button>
    </nav>
  );
}

/** 問いを整える（② と同じ部品）。真ん中に重ねて開き、閉じると編集に戻る */
export function OrganizeDialog({ story, onChange, onClose }: { story: StoryState; onChange: (s: StoryState) => void; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={css.backdrop} role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={css.dialog} role="dialog" aria-modal="true" aria-labelledby="organize-title">
        <div className={css.dialogHead}>
          <h2 id="organize-title" className={css.dialogTitle}>{t('nav.organizeTitle')}</h2>
          <button type="button" className={css.close} onClick={onClose}>{t('nav.close')}</button>
        </div>
        <p className={css.small}>{t('nav.organizeLead')}</p>
        <QuestionList story={story} onChange={onChange} />
        <NeedPicker story={story} onChange={onChange} lead={t('story.pickLead')} />
      </div>
    </div>
  );
}
