'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/ui';
import type { ProjectState } from '../editor/project';
import { execQuestion, groupOf, neighbor } from './storyOps';
import { orderedQuestions, progressOf, viewModeOf } from './storyProject';
import { NeedPicker, QuestionList } from './QuestionMap';
import { EXEC_SUMMARY_ROLE } from '@/registry';
import { storyDisplayTitle, type StorySlide, type StoryState } from './model';
import css from './nav.module.css';

export type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * 編集画面の左：ストーリーの地図（docs/story-spec.md 8.1）。問いの一覧と状態（確認済み・作成中・次に作る・この後）、現在地、次の問い。
 * ↑↓で順番を変えられる。［問いを整える］で、② と同じ整える画面を真ん中に重ねて開く。
 * 表・言葉の問いも、編集画面のスライド（結論＋3つの根拠・比較表など）として作る
 */
export function StoryNav({ name, story, project, save, onSelect, onMove, onOrganize, onAddExec, onSkipExec, onRename, suggest }: {
  name: string; story: StoryState; project: ProjectState; save: StorySaveStatus;
  onSelect: (q: StorySlide) => void; onMove: (id: string, dir: -1 | 1) => void; onOrganize: () => void;
  /** 今の問いをその場で書き換える */
  onRename?: (id: string, question: string) => void;
  /** 見せ方を替えたが、問いを自分で書き換えていたので替えなかった時の、替える先の問い */
  suggest?: string | null;
  /** Executive Summary：追加して作成／今回はスキップ（14章） */
  onAddExec?: () => void; onSkipExec?: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const currentId = project.slides[project.current]?.id ?? null;
  const ordered = orderedQuestions(story);
  const progress = new Map(ordered.map((q) => [q.id, progressOf(q, project)]));
  const curIdx = ordered.findIndex((q) => q.id === currentId);
  // Executive Summary は、編集中はメインの一番下（並びで「最後に書く」が分かる。並べ替えはしない）
  const isExec = (q: StorySlide) => q.routeRole === EXEC_SUMMARY_ROLE;
  const nextQ = ordered.find((q, i) => i > curIdx && progress.get(q.id) !== 'done') ?? null;
  // 完成度（確認済み・作成中・次に作る・この後）と、今開いているか（「編集中」の印）は分けて出す
  const statusOf = (q: StorySlide, i: number): 'done' | 'next' | 'working' | 'later' => {
    if (progress.get(q.id) === 'done') return 'done';
    if (q.id === currentId) return 'working';
    if (q.id === nextQ?.id) return 'next';
    return i < curIdx ? 'working' : 'later';
  };
  const groups: { g: 'MAIN' | 'APPENDIX'; label: string }[] = [{ g: 'MAIN', label: t('story.section.MAIN') }, { g: 'APPENDIX', label: t('story.section.APPENDIX') }];
  let n = 0;
  return (
    <nav className={css.nav} aria-label={t('nav.label')}>
      <div className={css.head}>
        <p className={css.kicker}>{t('nav.kicker')}</p>
        <span className={save === 'error' ? css.saveErr : css.save} role="status">{save === 'idle' ? '' : t(`story.save.${save}`)}</span>
      </div>
      <p className={css.name}>{name || storyDisplayTitle(story) || t('story.untitled')}</p>
      {story.decisionQuestion && <p className={css.decision}>{t('nav.decision', { text: story.decisionQuestion })}</p>}
      {onAddExec && !execQuestion(story) && (story.executiveSummary.skipped ? (
        <button type="button" className={`${css.execLink}`} onClick={onAddExec}>{t('nav.exec.addLater')}</button>
      ) : (
        <div className={css.exec}>
          <p className={css.execHead}>{t('nav.exec.title')}</p>
          <p className={css.small}>{t('nav.exec.lead')}</p>
          <div className={css.execBtns}>
            <button type="button" className={css.execAdd} onClick={onAddExec}>{t('nav.exec.add')}</button>
            <button type="button" className={css.execSkip} onClick={onSkipExec}>{t('nav.exec.skip')}</button>
          </div>
        </div>
      ))}
      {groups.map(({ g, label }) => {
        const list = ordered.filter((q) => groupOf(q) === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className={css.group}>{label}</p>
            <ol className={css.list}>
              {list.map((q) => {
                const st = statusOf(q, ordered.indexOf(q));
                // 見せ方（表・言葉）を状態の横に添える。グラフは何も付けない
                const mode = viewModeOf(q, project);
                const num = g === 'MAIN' ? ++n : null;
                return (
                  <li key={q.id} className={css.row} data-current={q.id === currentId}>
                    <button type="button" className={css.pick} aria-current={q.id === currentId ? 'step' : undefined} onClick={() => onSelect(q)}>
                      <span className={css.status} data-s={st}>
                        {num != null ? `${num}. ` : ''}{t(`nav.status.${st}`)}{mode ? ` ・${t(`nav.mode.${mode}`)}` : ''}
                        {q.id === currentId && <span className={css.editing}>{t('nav.editing')}</span>}
                      </span>
                      {!(q.id === currentId && editing != null) && <span className={css.q}>{q.question || '—'}</span>}
                    </button>
                    {q.id === currentId && onRename && (editing != null ? (
                      <form className={css.qEdit} onSubmit={(e) => { e.preventDefault(); if (editing.trim()) onRename(q.id, editing.trim()); setEditing(null); }}>
                        <textarea className={css.qInput} autoFocus aria-label={t('nav.qEdit')} value={editing} maxLength={500} rows={3}
                          onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }} />
                        <span className={css.qEditBtns}>
                          <button type="submit" className="btn" disabled={!editing.trim()}>{t('save.renameConfirm')}</button>
                          <button type="button" className={css.linkSm} onClick={() => setEditing(null)}>{t('save.cancel')}</button>
                        </span>
                      </form>
                    ) : (
                      <span className={css.qTools}>
                        <button type="button" className={css.linkSm} onClick={() => setEditing(q.question)}>{t('nav.qEdit')}</button>
                        {suggest && suggest !== q.question && (
                          <button type="button" className={css.linkSm} title={suggest} onClick={() => onRename(q.id, suggest)}>{t('nav.qSuggest', { q: suggest })}</button>
                        )}
                      </span>
                    ))}
                    {!isExec(q) && <span className={css.moves}>
                      <button type="button" className={css.move} aria-label={t('story.upLabel')} disabled={neighbor(story, q.id, -1) < 0} onClick={() => onMove(q.id, -1)}>↑</button>
                      <button type="button" className={css.move} aria-label={t('story.downLabel')} disabled={neighbor(story, q.id, 1) < 0} onClick={() => onMove(q.id, 1)}>↓</button>
                    </span>}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      {nextQ && <p className={css.next}>{t('nav.next', { q: nextQ.question })}</p>}
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
