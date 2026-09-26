'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { localize, registry } from '@/registry';
import { deleteLibraryItem, listLibrary, setLibraryPublished, type LibraryItem } from '@/lib/repo/library';
import { previewSvg } from '../editor/preview';
import { viewOf } from '../editor/project';
import { ProjectThumbs } from '../shared/ProjectThumbs';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { useIsAdmin } from './useIsAdmin';
import { useConfirm } from '../shared/Confirm';
import css from '../ui.module.css';
import my from '../my-page/my-page.module.css';
import lb from './library.module.css';

/** Library：見本のスライド。登録前でも見られる。登録した人は複製して、自分のデータで作れる */
export default function LibraryPage() {
  const t = useT();
  const auth = useAuth();
  const beta = useBetaAccess();
  const admin = useIsAdmin();
  const [list, setList] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ item: LibraryItem; index: number } | null>(null);
  const member = beta.state.kind === 'active' || beta.state.kind === 'off';

  const refresh = useCallback(async () => {
    if (!auth.client) return;
    try { setList(await listLibrary(auth.client)); setError(null); }
    catch (e) { setError(t('library.error', { message: (e as Error).message ?? String(e) })); }
  }, [auth.client, t]);
  useEffect(() => { void refresh(); }, [refresh, admin]);

  const cats = useMemo(() => [...new Set((list ?? []).map((x) => x.category).filter(Boolean))], [list]);
  const shown = (list ?? []).filter((x) => !cat || x.category === cat);

  if (!auth.enabled) return <div className={my.wrap}><p className={css.note}>{t('my.disabled')}</p></div>;
  return (
    <div className={my.wrap}>
      <div className={my.head}>
        <div>
          <h1 className={my.title}>{t('library.title')}</h1>
          <p className={my.sub}>{t('library.lead')}</p>
        </div>
      </div>
      {!member && (
        <p className={lb.banner}>{t('library.joinNote')} <Link href="/join?next=/library" className={css.linkBtn}>{t('auth.toJoin')}</Link></p>
      )}
      {cats.length > 0 && (
        <div className={lb.cats} role="group" aria-label={t('library.category')}>
          <button type="button" className={lb.cat} aria-pressed={cat == null} onClick={() => setCat(null)}>{t('library.all')}</button>
          {cats.map((c) => <button key={c} type="button" className={lb.cat} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {error && <p className={css.error} role="alert">{error}</p>}
      {!list ? (!error && <p className={css.note}>{t('my.loading')}</p>)
        : shown.length === 0 ? <p className={my.emptyBox}>{admin ? t('library.emptyAdmin') : t('library.empty')}</p>
        : (
          <ul className={my.grid}>
            {shown.map((item) => <LibraryCard key={item.id} item={item} admin={admin} onView={(i) => setViewer({ item, index: i })} onChanged={refresh} />)}
          </ul>
        )}
      {viewer && <Viewer item={viewer.item} index={viewer.index} onIndex={(i) => setViewer({ ...viewer, index: i })} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** 使っているチャートの名前（重なりなし） */
function useChartNames(item: LibraryItem): string {
  const locale = useLocale();
  return [...new Set(item.project.slides.map((s) => localize(registry.charts[s.chart].label, locale)))].join('・');
}

function LibraryCard({ item, admin, onView, onChanged }: { item: LibraryItem; admin: boolean; onView: (i: number) => void; onChanged: () => Promise<void> }) {
  const t = useT();
  const auth = useAuth();
  const confirm = useConfirm();
  const charts = useChartNames(item);
  const act = async (fn: () => Promise<void>) => { await fn().catch(() => {}); await onChanged(); };
  return (
    <li className={`${my.card} ${item.published ? '' : lb.hidden}`}>
      <ProjectThumbs project={item.project} onOpen={onView} label={`${t('library.view')}：${item.title}`} badge={item.published ? undefined : t('library.unpublished')} />
      <div className={my.body}>
        <h2 className={my.name}>{item.title}</h2>
        {item.description && <p className={lb.desc}>{item.description}</p>}
        <p className={my.meta}>{[item.category, t('library.slides', { n: item.project.slides.length }), charts].filter(Boolean).join(' · ')}</p>
        <div className={my.actions}>
          <button type="button" className={css.linkBtn} onClick={() => onView(0)}>{t('library.view')}</button>
          <Link href={`/?library=${item.id}`} className={css.linkBtn}>{t('library.copy')}</Link>
          {admin && (
            <>
              <button type="button" className={css.linkBtn} onClick={() => act(() => setLibraryPublished(auth.client!, item.id, !item.published))}>{item.published ? t('library.unpublish') : t('library.republish')}</button>
              <button type="button" className={css.linkBtn} onClick={async () => {
                if (await confirm({ title: t('confirm.libraryTitle', { name: item.title }), body: t('confirm.libraryBody'), ok: t('confirm.delete'), danger: true })) void act(() => deleteLibraryItem(auth.client!, item.id));
              }}>{t('save.delete')}</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** 大きく見る：1枚ずつ、‹ › と矢印キーで。ここから複製もできる */
function Viewer({ item, index, onIndex, onClose }: { item: LibraryItem; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT();
  const n = item.project.slides.length;
  const svg = useMemo(() => { try { return previewSvg(viewOf(item.project, index)); } catch { return null; } }, [item, index]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < n - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, n, onClose, onIndex]);
  return (
    <div className={lb.overlay} role="dialog" aria-modal="true" aria-label={item.title} onClick={onClose}>
      <div className={lb.viewer} onClick={(e) => e.stopPropagation()}>
        <div className={lb.viewerHead}>
          <b>{item.title}</b>
          <span className={css.note}>{t('my.slideAt', { n: index + 1, total: n })}</span>
          <button type="button" className="btn" onClick={onClose}>{t('account.close')}</button>
        </div>
        <div className={lb.stage}>
          {index > 0 && <button type="button" className={`${lb.navBig} ${lb.navL}`} aria-label={t('my.prevSlide')} onClick={() => onIndex(index - 1)}>‹</button>}
          {svg ? <div className={lb.slide} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className={css.note}>{t('my.thumbError')}</p>}
          {index < n - 1 && <button type="button" className={`${lb.navBig} ${lb.navR}`} aria-label={t('my.nextSlide')} onClick={() => onIndex(index + 1)}>›</button>}
        </div>
        {item.description && <p className={lb.desc}>{item.description}</p>}
        <div className={css.buttons}>
          <Link href={`/?library=${item.id}`} className={css.primary}>{t('library.copy')}</Link>
        </div>
      </div>
    </div>
  );
}
