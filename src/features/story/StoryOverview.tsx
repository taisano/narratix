'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { PROOF_NEEDS, STORY_SECTION_IDS, localize, registry, type StorySectionId } from '@/registry';
import { loadStory, saveStory } from '@/lib/repo/stories';
import { useAuth } from '../shell/AppShell';
import { useConfirm } from '../shared/Confirm';
import { storyDisplayTitle, type StorySlide, type StoryState } from './model';
import {
  addQuestion, canMergeWithNext, canSplit, isBlank, mergeWithNext, moveQuestion, removeQuestion, renameQuestion, setCoachingOnly, setSection,
  sizeAdvice, splitQuestion, unusedNeeds,
} from './storyOps';
import css from './story.module.css';

/**
 * Story の Question Map（docs/story-spec.md 3.3・7章）。Question を Main Story／Supporting Evidence／Appendix に分けて並べ、
 * 並べ替え・置き場所の変更・スライドにしない・統合・分割・名前の変更・追加・外すができる（規則だけ。AI は使わない）。
 * 変えると自動で保存する。スライドの中身（データ・見せ方）は Story の編集画面（準備中）で入れる
 */
export default function StoryOverview() {
  const t = useT();
  const auth = useAuth();
  const [id, setId] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ name: string; story: StoryState } | null>(null);
  const [error, setError] = useState<'not_found' | string | null>(null);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!auth.client || !auth.session) return;
    const q = new URLSearchParams(window.location.search).get('id');
    if (!q) { setError('not_found'); return; }
    setId(q);
    loadStory(auth.client, q).then(setDoc).catch((e: { code?: string; message?: string }) => setError(e.code === 'not_found' ? 'not_found' : e.message ?? String(e)));
  }, [auth.client, auth.session]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** 変えたら少し待って保存する（続けて操作した時は最後の1回だけ） */
  const change = (next: StoryState) => {
    if (!doc || !id || !auth.client) return;
    setDoc({ ...doc, story: next });
    setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    const client = auth.client;
    timer.current = setTimeout(() => {
      // 名前は一覧で付けたものを保つ
      saveStory(client, id, next, doc.name || undefined).then(() => setSave('saved'), () => setSave('error'));
    }, 600);
  };

  const back = <Link href="/charts" className={css.back}>{t('story.back')}</Link>;
  if (auth.session === undefined) return <div className={css.wrap}><p className={css.note}>{t('my.loading')}</p></div>;
  if (!auth.session) return <div className={css.wrap}><p className={css.note}>{t('my.signedOut')}</p></div>;
  if (error) return <div className={css.wrap}>{back}<p className={css.statusErr} role="alert">{error === 'not_found' ? t('story.notFound') : t('story.error', { message: error })}</p></div>;
  if (!doc) return <div className={css.wrap}><p className={css.note}>{t('my.loading')}</p></div>;

  return <div className={css.wrap}>{back}<StoryMapView name={doc.name} story={doc.story} save={save} onChange={change} /></div>;
}

/** Question Map の本体（読み込み・保存は呼ぶ側） */
export function StoryMapView({ name, story: s, save, onChange: change }: { name: string; story: StoryState; save: 'idle' | 'saving' | 'saved' | 'error'; onChange: (s: StoryState) => void }) {
  const t = useT();
  const size = sizeAdvice(s);
  return (
    <>
      <span className={save === 'error' ? css.statusErr : css.status} role="status">{save === 'idle' ? '' : t(`story.save.${save}`)}</span>
      <h1 className={css.title}>{name || storyDisplayTitle(s) || t('story.untitled')}</h1>
      {(s.decisionQuestion || s.primaryBarrier) && (
        <dl className={css.context}>
          {s.decisionQuestion && <><dt>{t('scope.decisionLabel')}</dt><dd>{s.decisionQuestion}</dd></>}
          {s.primaryBarrier && <><dt>{t('scope.barrierLabel')}</dt><dd>{s.primaryBarrier}</dd></>}
        </dl>
      )}
      <p className={css.note}>{t('story.mapLead')}</p>
      {size.level !== 'ideal' && <p className={size.level === 'over' ? css.adviceOver : css.advice}>{t(`story.size.${size.level}`, { n: size.main })}</p>}

      {STORY_SECTION_IDS.map((sec) => {
        const list = s.slides.filter((x) => x.section === sec);
        if (!list.length && sec !== 'MAIN') return null;
        return (
          <section key={sec} className={css.section} aria-label={t(`story.section.${sec}`)}>
            <h2 className={css.sectionHead}>{t(`story.section.${sec}`)}</h2>
            {!list.length && <p className={css.note}>{t('story.noQuestions')}</p>}
            <ol className={css.list}>
              {list.map((q) => <QuestionItem key={q.id} story={s} q={q} n={sec === 'MAIN' ? mainNumber(s, q) : null} onChange={change} />)}
            </ol>
          </section>
        );
      })}

      <AddQuestion story={s} onChange={change} />
      <p className={css.note}>{t('story.editorSoon')}</p>
    </>
  );
}

/** Main Story の中での番号（スライドにしない Question は数えない） */
const mainNumber = (s: StoryState, q: StorySlide): number | null => {
  if (q.questionPriority === 'COACHING_ONLY') return null;
  const main = s.slides.filter((x) => x.section === 'MAIN' && x.questionPriority !== 'COACHING_ONLY');
  return main.findIndex((x) => x.id === q.id) + 1;
};

const ROLE_KEY: Record<string, MessageKey> = {
  'AIMED.IMPACT': 'story.role.impact', 'AIMED.MISMATCH': 'story.role.mismatch', 'AIMED.EXPLANATION': 'story.role.explanation', 'AIMED.DECISION': 'story.role.decision',
};

function QuestionItem({ story, q, n, onChange }: { story: StoryState; q: StorySlide; n: number | null; onChange: (s: StoryState) => void }) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const out = q.questionPriority === 'COACHING_ONLY';
  const i = story.slides.findIndex((x) => x.id === q.id);
  const recipes = q.referenceRecipes.slice(0, 2).map((r) => localize(registry.recipes[r].name, locale)).join(locale === 'ja' ? '／' : ' / ');
  return (
    <li className={`${css.item} ${out ? css.itemOut : ''}`}>
      <span className={`${css.num} ${out ? css.numOut : ''}`} aria-hidden="true">{n ?? '–'}</span>
      <div className={css.body}>
        <div className={css.tags}>
          {q.routeRole && ROLE_KEY[q.routeRole] && <span className={css.tag}>{t(ROLE_KEY[q.routeRole]!)}</span>}
          {q.questionPriority === 'CONDITIONAL' && <span className={css.tagMute}>{t('story.priority.CONDITIONAL')}</span>}
          {out && <span className={css.tagMute}>{t('story.priority.COACHING_ONLY')}</span>}
        </div>
        {editing != null ? (
          <form className={css.edit} onSubmit={(e) => { e.preventDefault(); if (editing.trim()) onChange(renameQuestion(story, q.id, editing.trim())); setEditing(null); }}>
            <input className={css.input} autoFocus aria-label={t('story.questionLabel')} value={editing} onChange={(e) => setEditing(e.target.value)} />
            <button type="submit" className={css.act} disabled={!editing.trim()}>{t('save.renameConfirm')}</button>
            <button type="button" className={css.act} onClick={() => setEditing(null)}>{t('save.cancel')}</button>
          </form>
        ) : <p className={css.q}>{q.question || '—'}</p>}
        {recipes && <p className={css.sub}>{t('scope.recipes', { names: recipes })}</p>}
        {q.routeRole === 'AIMED.DECISION' && <p className={css.sub}>{t('scope.decisionRole')}</p>}
        <p className={css.sub}>{q.userAuthoredMessage ? t('story.message', { text: q.userAuthoredMessage }) : t('story.noMessage')}</p>
        <div className={css.actions}>
          <button type="button" className={css.act} disabled={i <= 0} aria-label={t('story.upLabel')} onClick={() => onChange(moveQuestion(story, q.id, -1))}>{t('story.up')}</button>
          <button type="button" className={css.act} disabled={i >= story.slides.length - 1} aria-label={t('story.downLabel')} onClick={() => onChange(moveQuestion(story, q.id, 1))}>{t('story.down')}</button>
          <button type="button" className={css.act} onClick={() => setEditing(q.question)}>{t('story.rename')}</button>
          <label className={css.sub}>
            {t('story.sectionLabel')}{' '}
            <select className={css.select} value={q.section} onChange={(e) => onChange(setSection(story, q.id, e.target.value as StorySectionId))}>
              {STORY_SECTION_IDS.map((x) => <option key={x} value={x}>{t(`story.section.${x}`)}</option>)}
            </select>
          </label>
          <button type="button" className={css.act} onClick={() => onChange(setCoachingOnly(story, q.id, !out))}>{out ? t('story.toSlide') : t('story.toCoaching')}</button>
          {canMergeWithNext(story, q.id) && <button type="button" className={css.act} onClick={() => onChange(mergeWithNext(story, q.id, locale))}>{t('story.merge')}</button>}
          {canSplit(q) && <button type="button" className={css.act} onClick={() => onChange(splitQuestion(story, q.id, locale))}>{t('story.split')}</button>}
          <button type="button" className={css.actDanger} onClick={async () => {
            if (!isBlank(q) && !(await confirm({ title: t('story.removeTitle'), body: t('story.removeBody'), ok: t('story.remove'), danger: true }))) return;
            onChange(removeQuestion(story, q.id));
          }}>{t('story.remove')}</button>
        </div>
      </div>
    </li>
  );
}

/** Question を足す：まだ入っていない proof_needs から（役割ごと） */
function AddQuestion({ story, onChange }: { story: StoryState; onChange: (s: StoryState) => void }) {
  const t = useT();
  const locale = useLocale();
  const list = unusedNeeds(story);
  if (!list.length) return null;
  const roles = [...new Set(list.map((x) => x.role))];
  return (
    <details className={css.add}>
      <summary>{t('story.add')}</summary>
      <p className={css.note}>{t('story.addLead')}</p>
      {roles.map((role) => (
        <div key={role} className={css.addGroup}>
          <p className={css.addHead}>{t(ROLE_KEY[role]!)}</p>
          <div className={css.chips}>
            {list.filter((x) => x.role === role).map((x) => (
              <button key={x.need} type="button" className={css.chip} onClick={() => onChange(addQuestion(story, [x.need], locale))}>
                <b>{localize(PROOF_NEEDS[x.need].question, locale)}</b>
                <small>{localize(PROOF_NEEDS[x.need].label, locale)}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
    </details>
  );
}
