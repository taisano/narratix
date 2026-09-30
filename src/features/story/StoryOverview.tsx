'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/ui';
import { STORY_SECTION_IDS, STORY_SIZE } from '@/registry';
import { loadStory } from '@/lib/repo/stories';
import { useAuth } from '../shell/AppShell';
import { mainCount, storyDisplayTitle, type StoryState } from './model';
import css from '../ui.module.css';
import my from '../my-page/my-page.module.css';

/**
 * 保存した Story の概要（読むだけ）。Question を Main Story／Supporting Evidence／Appendix に分けて並べる。
 * Story の編集画面（docs/story-spec.md 8章）ができたら、そちらで開く
 */
export default function StoryOverview() {
  const t = useT();
  const auth = useAuth();
  const [story, setStory] = useState<{ name: string; story: StoryState } | null>(null);
  const [error, setError] = useState<'not_found' | string | null>(null);

  useEffect(() => {
    if (!auth.client || !auth.session) return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) { setError('not_found'); return; }
    loadStory(auth.client, id).then(setStory).catch((e: { code?: string; message?: string }) => setError(e.code === 'not_found' ? 'not_found' : e.message ?? String(e)));
  }, [auth.client, auth.session]);

  const back = <Link href="/charts" className={css.linkBtn}>{t('story.back')}</Link>;
  if (auth.session === undefined) return <div className={my.wrap}><p className={css.note}>{t('my.loading')}</p></div>;
  if (!auth.session) return <div className={my.wrap}><p className={css.note}>{t('my.signedOut')}</p></div>;
  if (error) return <div className={my.wrap}>{back}<p className={css.error} role="alert">{error === 'not_found' ? t('story.notFound') : t('story.error', { message: error })}</p></div>;
  if (!story) return <div className={my.wrap}><p className={css.note}>{t('my.loading')}</p></div>;

  const s = story.story;
  const n = mainCount(s);
  return (
    <div className={my.wrap}>
      {back}
      <div className={my.head}>
        <div>
          <h1 className={my.title}>{story.name || storyDisplayTitle(s) || t('story.untitled')}</h1>
          {s.decisionQuestion && <p className={my.sub}>{t('story.decision', { text: s.decisionQuestion })}</p>}
        </div>
      </div>
      <p className={css.note}>{t('story.editorSoon')}</p>
      {n > STORY_SIZE.softMax && <p className={css.note}>{t('story.overTen', { n })}</p>}
      {!s.slides.length && <p className={my.emptyBox}>{t('story.noQuestions')}</p>}
      {STORY_SECTION_IDS.map((sec) => {
        const list = s.slides.filter((x) => x.section === sec);
        if (!list.length) return null;
        return (
          <section key={sec} aria-label={t(`story.section.${sec}`)}>
            <h2 className={my.name}>{t(`story.section.${sec}`)}</h2>
            <ol>
              {list.map((q) => (
                <li key={q.id}>
                  <strong>{q.question || '—'}</strong>{' '}
                  <span className={my.meta}>{q.questionPriority === 'COACHING_ONLY' ? t('story.priority.COACHING_ONLY') : t(`story.status.${q.status}`)}</span>
                  <p className={my.meta}>{q.userAuthoredMessage ? t('story.message', { text: q.userAuthoredMessage }) : t('story.noMessage')}</p>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
