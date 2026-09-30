'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { localize, registry } from '@/registry';
import { deleteLibraryItem, listLibrary, setLibraryPublished, updateLibraryItem, type LibraryItem } from '@/lib/repo/library';
import { previewSvg } from '../editor/preview';
import { viewOf } from '../editor/project';
import { ProjectThumbs } from '../shared/ProjectThumbs';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { useIsAdmin } from './useIsAdmin';
import { track } from '@/lib/ab/track';
import { useConfirm } from '../shared/Confirm';
import { CardTags, TagInput } from '../shared/Tags';
import { FilterBar } from '../shared/FilterBar';
import { facetItem, facetOptions, facetSearchText, facetSummary, matchesFacets, type FacetItem, type FacetSelection } from '../shared/facets';
import { LANG_TAGS, tagCounts, tagSearchText, userTags } from '@/lib/tags';
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
  // null：まだ選んでいない（画面の言語のタグを選んだ状態で始める）
  const [picked, setPicked] = useState<string[] | null>(null);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [charts, setCharts] = useState<string[]>([]);
  const [dishes, setDishes] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const locale = useLocale();
  const [viewer, setViewer] = useState<{ item: LibraryItem; index: number } | null>(null);
  const member = beta.state.kind === 'active' || beta.state.kind === 'off';

  const refresh = useCallback(async () => {
    if (!auth.client) return;
    try { setList(await listLibrary(auth.client)); setError(null); }
    catch (e) { setError(t('library.error', { message: (e as Error).message ?? String(e) })); }
  }, [auth.client, t]);
  useEffect(() => { void refresh(); }, [refresh, admin]);
  useEffect(() => { if (auth.session !== undefined) track('library_opened', { loggedIn: !!auth.session, oncePerPage: true }); }, [auth.session]);

  const known = useMemo(() => tagCounts((list ?? []).map((x) => x.tags)), [list]);
  // タグは最初、画面の言語のタグを選んだ状態（自分で選び直すまでは言語の切り替えに合わせる）
  const cat = useMemo(() => picked ?? (known.includes(LANG_TAGS[locale]) ? [LANG_TAGS[locale]] : []), [picked, known, locale]);
  const sel: FacetSelection = useMemo(() => ({ purpose: purposes, chart: charts, tag: cat, dish: dishes }), [purposes, charts, cat, dishes]);
  // 絞り込み：検索に当たるものの中で、目的・チャート・タグ
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).map((x) => ({ x, f: facetItem(x.project, x.tags) })).filter(({ x, f }) => !q || searchText(x, f, locale).toLowerCase().includes(q));
  }, [list, query, locale]);
  const options = useMemo(() => facetOptions(searched.map((r) => r.f), sel, locale), [searched, sel, locale]);
  const shown = useMemo(() => searched.filter(({ f }) => matchesFacets(f, sel)).map(({ x }) => x), [searched, sel]);
  // 選んだ目的・チャートは URL に残す（戻る・人に渡すため）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPurposes(q.get('purpose')?.split(',').filter(Boolean) ?? []);
    setCharts(q.get('chart')?.split(',').filter(Boolean) ?? []);
    setDishes(q.get('dish')?.split(',').filter(Boolean) ?? []);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const put = (k: string, v: string[]) => { if (v.length) q.set(k, v.join(',')); else q.delete(k); };
    put('purpose', purposes); put('chart', charts); put('dish', dishes);
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [purposes, charts, dishes]);

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
      {(list?.length ?? 0) > 0 && (
        <div className={my.toolbar}>
          <input className={`${css.input} ${my.search}`} type="search" placeholder={t('library.search')} aria-label={t('library.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {(list?.length ?? 0) > 0 && (
        <FilterBar
          resultCount={shown.length}
          onClear={() => { setPurposes([]); setCharts([]); setDishes([]); setPicked([]); }}
          facets={[
            { key: 'purpose', label: t('filter.purpose'), options: options.purpose, value: purposes, onChange: setPurposes },
            { key: 'chart', label: t('filter.chart'), options: options.chart, value: charts, onChange: setCharts },
            { key: 'tag', label: t('filter.tag'), options: options.tag, value: cat, onChange: setPicked },
            ...(options.dish.length ? [{ key: 'dish', label: t('filter.dish'), options: options.dish, value: dishes, onChange: setDishes }] : []),
          ]}
        />
      )}
      {error && <p className={css.error} role="alert">{error}</p>}
      {!list ? (!error && <p className={css.note}>{t('my.loading')}</p>)
        : list.length === 0 ? <p className={my.emptyBox}>{admin ? t('library.emptyAdmin') : t('library.empty')}</p>
        : shown.length === 0 ? <p className={css.note}>{t('my.noMatch')}</p>
        : (
          <ul className={my.grid}>
            {shown.map((item) => <LibraryCard key={item.id} item={item} admin={admin} onView={(i) => setViewer({ item, index: i })} onEdit={() => setEditing(item)} onChanged={refresh} />)}
          </ul>
        )}
      {editing && admin && <EditDialog item={editing} known={known} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
      {viewer && <Viewer item={viewer.item} index={viewer.index} onIndex={(i) => setViewer({ ...viewer, index: i })} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** 検索の対象：名前・説明・タグ（言語のタグは日本語・英語の両方の名前）・チャートの種類 */
function searchText(item: LibraryItem, f: FacetItem, locale: 'ja' | 'en'): string {
  const charts = item.project.slides.map((s) => localize(registry.charts[s.chart].label, locale));
  return [item.title, item.description, tagSearchText(item.tags), ...charts, facetSearchText(f)].join(' ');
}

/** カードの一言：目的とチャート（例：構成・Mekko ほか2枚） */
function useChartNames(item: LibraryItem): string {
  const locale = useLocale();
  const t = useT();
  return facetSummary(item.project, locale, (n) => t('filter.more', { n }));
}

function LibraryCard({ item, admin, onView, onEdit, onChanged }: { item: LibraryItem; admin: boolean; onView: (i: number) => void; onEdit: () => void; onChanged: () => Promise<void> }) {
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
        <p className={my.meta}>{[t('library.slides', { n: item.project.slides.length }), charts].filter(Boolean).join(' · ')}</p>
        <CardTags tags={item.tags} />
        <div className={my.actions}>
          <button type="button" className={css.linkBtn} onClick={() => onView(0)}>{t('library.view')}</button>
          <Link href={`/editor?library=${item.id}`} className={css.linkBtn}>{t('library.copy')}</Link>
        </div>
        {/* ここから下は管理者だけ（Library の書き換えは、データベースの側でも管理者だけに限っている） */}
        {admin && (
          <div className={lb.adminRow}>
            <span className={lb.adminLabel}>{t('library.adminOnly')}</span>
              <button type="button" className={css.linkBtn} onClick={onEdit}>{t('library.edit')}</button>
              <button type="button" className={css.linkBtn} onClick={() => act(() => setLibraryPublished(auth.client!, item.id, !item.published))}>{item.published ? t('library.unpublish') : t('library.republish')}</button>
              <button type="button" className={css.linkBtn} onClick={async () => {
                if (await confirm({ title: t('confirm.libraryTitle', { name: item.title }), body: t('confirm.libraryBody'), ok: t('confirm.delete'), danger: true })) void act(() => deleteLibraryItem(auth.client!, item.id));
              }}>{t('save.delete')}</button>
          </div>
        )}
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
          <Link href={`/editor?library=${item.id}`} className={css.primary}>{t('library.copyLong')}</Link>
        </div>
      </div>
    </div>
  );
}

/** 管理者：見本の名前・説明・タグを直す。スライドはエディターで直して「見本を更新」 */
function EditDialog({ item, known, onClose, onSaved }: { item: LibraryItem; known: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useT();
  const auth = useAuth();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [tags, setTags] = useState(userTags(item.tags));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!auth.client || !title.trim()) return;
    setBusy(true); setError(null);
    try { await updateLibraryItem(auth.client, item.id, { title, description, tags, locale: item.project.slideLocale }); await onSaved(); }
    catch (err) { setError((err as Error).message ?? String(err)); setBusy(false); }
  }
  return (
    <div className={lb.overlay} role="dialog" aria-modal="true" aria-label={t('library.editTitle')} onClick={onClose}>
      <form className={lb.editBox} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className={lb.editHead}>{t('library.editTitle')}</h2>
        <label className={css.field}><span>{t('library.fieldTitle')}</span><input className={css.input} required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
        <label className={css.field}><span>{t('library.fieldDesc')}</span><textarea className={css.input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></label>
        <div className={css.field}><span>{t('tags.label')}</span><TagInput label={t('tags.label')} value={tags} onChange={setTags} autoTag={LANG_TAGS[item.project.slideLocale]} suggestions={known} /></div>
        <p className={css.note}>{t('library.editSlidesNote')} <Link href={`/editor?libraryEdit=${item.id}`} className={css.linkBtn}>{t('library.editSlides')}</Link></p>
        {error && <p className={css.error} role="alert">{error}</p>}
        <div className={css.buttons}>
          <button type="submit" className={css.primary} disabled={busy || !title.trim()}>{t('library.editSave')}</button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>{t('save.cancel')}</button>
        </div>
      </form>
    </div>
  );
}
