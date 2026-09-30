'use client';

import { useEffect } from 'react';
import { useT } from '@/i18n/ui';
import type { ProjectState } from '../editor/project';
import { groupOf, neighbor } from './storyOps';
import { isGraphQuestion, progressOf } from './storyProject';
import { NeedPicker, QuestionList } from './QuestionMap';
import { storyDisplayTitle, type StorySlide, type StoryState } from './model';
import css from './nav.module.css';

export type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * 編集画面の左：ストーリーの地図（docs/story-spec.md 8.1）。問いの一覧と状態（確認済み・作成中・次に作る・この後）、現在地、次の問い。
 * ↑↓で順番を変えられる。［問いを整える］で、② と同じ整える画面を真ん中に重ねて開く。
 * 言葉の問い（判断など）は、ここで Message を書く（言葉のスライドは準備中）
 */
export function StoryNav({ name, story, project, textFocus, save, onSelect, onMove, onMessage, onOrganize }: {
  name: string; story: StoryState; project: ProjectState; textFocus: string | null; save: StorySaveStatus;
  onSelect: (q: StorySlide) => void; onMove: (id: string, dir: -1 | 1) => void; onMessage: (id: string, text: string) => void; onOrganize: () => void;
}) {
  const t = useT();
  const currentId = textFocus ?? project.slides[project.current]?.id ?? null;
  const order = story.slides.filter((s) => groupOf(s) !== 'OUT');
  const ordered = [...order.filter((s) => groupOf(s) === 'MAIN'), ...order.filter((s) => groupOf(s) === 'APPENDIX')];
  const progress = new Map(ordered.map((q) => [q.id, progressOf(q, project)]));
  const curIdx = ordered.findIndex((q) => q.id === currentId);
  const nextQ = ordered.find((q, i) => i > curIdx && progress.get(q.id) !== 'done') ?? null;
  // 今より前でまだ終わっていない問いは「作成中」、次の1つは「次に作る」、それ以外は「この後」
  const statusOf = (q: StorySlide, i: number): 'now' | 'done' | 'next' | 'working' | 'later' => {
    if (q.id === currentId) return 'now';
    if (progress.get(q.id) === 'done') return 'done';
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
      {groups.map(({ g, label }) => {
        const list = ordered.filter((q) => groupOf(q) === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className={css.group}>{label}</p>
            <ol className={css.list}>
              {list.map((q) => {
                const st = statusOf(q, ordered.indexOf(q));
                const graph = isGraphQuestion(q);
                const num = g === 'MAIN' ? ++n : null;
                return (
                  <li key={q.id} className={css.row} data-current={q.id === currentId}>
                    <button type="button" className={css.pick} aria-current={q.id === currentId ? 'step' : undefined} onClick={() => onSelect(q)}>
                      <span className={css.status} data-s={graph ? st : st === 'now' || st === 'done' ? st : 'text'}>
                        {num != null ? `${num}. ` : ''}{t(`nav.status.${st}`)}{graph ? '' : ` ・${t('nav.textSlide')}`}
                      </span>
                      <span className={css.q}>{q.question || '—'}</span>
                    </button>
                    <span className={css.moves}>
                      <button type="button" className={css.move} aria-label={t('story.upLabel')} disabled={neighbor(story, q.id, -1) < 0} onClick={() => onMove(q.id, -1)}>↑</button>
                      <button type="button" className={css.move} aria-label={t('story.downLabel')} disabled={neighbor(story, q.id, 1) < 0} onClick={() => onMove(q.id, 1)}>↓</button>
                    </span>
                    {!graph && q.id === textFocus && (
                      <div className={css.text}>
                        <label className={css.small} htmlFor={`msg-${q.id}`}>{t('nav.messageLabel')}</label>
                        <textarea id={`msg-${q.id}`} value={q.userAuthoredMessage} placeholder={t('nav.messagePlaceholder')} onChange={(e) => onMessage(q.id, e.target.value)} />
                        <p className={css.small}>{t('nav.textSoon')}</p>
                      </div>
                    )}
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
