'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { STORY_SIZE } from '@/registry';
import { deleteStory, duplicateStory, listStories, renameStory, type StorySummary } from '@/lib/repo/stories';
import { useAuth } from '../shell/AppShell';
import { ProjectThumbs } from '../shared/ProjectThumbs';
import { SlideViewer } from '../shared/SlideViewer';
import { exportOrder, projectOfStory } from '../story/storyProject';
import { useConfirm } from '../shared/Confirm';
import css from '../ui.module.css';
import my from './my-page.module.css';

/**
 * マイチャートの「Story」タブ：保存した Story の一覧（1つの Story＝1件）。docs/story-spec.md 15.4。
 * 検索・開く・名前の変更・複製・削除。件数は onCount で知らせる
 */
export function StoriesList({ onCount, hidden = false }: { onCount?: (n: number) => void; hidden?: boolean } = {}) {
  const t = useT();
  const auth = useAuth();
  const [list, setList] = useState<StorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    if (!auth.client || !auth.session) return;
    try { const l = await listStories(auth.client); setList(l); onCount?.(l.length); setError(null); }
    catch (e) { setError(t('story.error', { message: (e as Error).message ?? String(e) })); }
  }, [auth.client, auth.session, t, onCount]);
  useEffect(() => { void refresh(); }, [refresh]);

  const shown = useMemo(() => {
    if (!list) return null;
    const q = query.trim().toLowerCase();
    return list.filter((s) => !q || [s.name, s.decisionQuestion].join(' ').toLowerCase().includes(q));
  }, [list, query]);

  if (hidden) return null;
  return (
    <div>
      <div className={my.toolbar}>
        <input className={`${css.input} ${my.search}`} type="search" placeholder={t('story.search')} aria-label={t('story.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && <p className={css.error} role="alert">{error}</p>}
      {!shown ? (!error && <p className={css.note}>{t('my.loading')}</p>)
        : list!.length === 0 ? <p className={my.emptyBox}>{t('story.empty')}</p>
        : shown.length === 0 ? <p className={css.note}>{t('story.noMatch')}</p>
        : <ul className={my.grid}>{shown.map((s) => <StoryCard key={s.id} story={s} onChanged={refresh} />)}</ul>}
    </div>
  );
}

function StoryCard({ story: s, onChanged }: { story: StorySummary; onChanged: () => Promise<void> }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = s.name || t('story.untitled');
  const href = `/editor?story=${s.id}`;
  // スライドの絵：PPT に出す順（本編 → 付録。外した問いは出さない）。横に送ると流れが見える
  const project = useMemo(() => { try { return exportOrder(projectOfStory(s.story, locale), s.story); } catch { return null; } }, [s.story, locale]);
  const [shownAt, setShownAt] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await onChanged(); } catch (e) { setError(t('my.actionError', { message: (e as Error).message ?? String(e) })); } finally { setBusy(false); }
  }
  function submitRename(e: FormEvent) {
    e.preventDefault();
    const v = renaming?.trim();
    if (!v) return;
    void act(async () => { await renameStory(auth.client!, s.id, v); setRenaming(null); });
  }

  return (
    <li className={my.card}>
      <ProjectThumbs project={project} onOpen={project ? (i) => setViewing(i) : undefined} onIndex={setShownAt} label={`${t('my.view')}：${name}`} />
      {viewing != null && project && <SlideViewer project={project} title={name} start={viewing} onClose={() => setViewing(null)} />}
      <div className={my.body}>
        {renaming != null ? (
          <form onSubmit={submitRename} className={my.renameForm}>
            <input className={css.input} autoFocus aria-label={t('save.nameLabel')} value={renaming} onChange={(e) => setRenaming(e.target.value)} />
            <div className={css.buttons}>
              <button type="submit" className={css.primary} disabled={busy || !renaming.trim()}>{t('save.renameConfirm')}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setRenaming(null)}>{t('save.cancel')}</button>
            </div>
          </form>
        ) : (
          <>
            <h2 className={my.name}><Link href={href}>{name}</Link></h2>
            {s.decisionQuestion && s.decisionQuestion !== s.name && <p className={my.consult}>{t('story.decision', { text: s.decisionQuestion })}</p>}
          </>
        )}
        <p className={my.meta}>{t('story.meta', { n: s.slides, done: s.progress.done, total: s.progress.total })}</p>
        {s.slides > STORY_SIZE.softMax && <p className={my.meta}>{t('story.overTen', { n: s.slides })}</p>}
        <p className={my.meta}>{t('story.updated', { date: date(s.updatedAt) })}</p>
        {renaming == null && <div className={my.actions}>
          {project && <button type="button" className={css.linkBtn} onClick={() => setViewing(shownAt)}>{t('my.view')}</button>}
          <Link href={href} className={css.linkBtn}>{t('my.edit')}</Link>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => setRenaming(s.name)}>{t('save.rename')}</button>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => act(() => duplicateStory(auth.client!, s.id, t('story.copySuffix', { name })))}>{t('my.duplicate')}</button>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={async () => {
            if (await confirm({ title: t('story.deleteTitle', { name }), body: t('story.deleteBody'), ok: t('confirm.delete'), danger: true })) void act(() => deleteStory(auth.client!, s.id));
          }}>{t('save.delete')}</button>
        </div>}
        {error && <p className={css.error} role="alert">{error}</p>}
      </div>
    </li>
  );
}
