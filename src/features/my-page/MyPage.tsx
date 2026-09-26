'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { deleteChart, duplicateChart, listCharts, renameChart, type ChartSummary } from '@/lib/repo/charts';
import { readStored } from '../editor/storage';
import { useAuth } from '../shell/AppShell';
import css from '../ui.module.css';
import my from './my-page.module.css';
import { HistoryList } from './HistoryList';
import { ProjectThumbs } from '../shared/ProjectThumbs';
import { useConfirm } from '../shared/Confirm';
import { CardTags, TagFilter } from '../shared/Tags';
import { filterTags, tagSearchText } from '@/lib/tags';

type Sort = 'updated' | 'created' | 'name';

/** マイページ：保存したチャートの一覧と管理 */
export default function MyPage() {
  const t = useT();
  const auth = useAuth();
  const [list, setList] = useState<ChartSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('updated');
  const [view, setView] = useState<'charts' | 'history'>('charts');
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { setEditingId(readStored().doc?.id ?? null); }, []);

  const refresh = useCallback(async () => {
    if (!auth.client || !auth.session) return;
    try { setList(await listCharts(auth.client, { withUi: true })); setError(null); }
    catch (e) { setError(t('my.error', { message: (e as Error).message ?? String(e) })); }
  }, [auth.client, auth.session, t]);
  useEffect(() => { void refresh(); }, [refresh]);

  const shown = useMemo(() => {
    if (!list) return null;
    const q = query.trim().toLowerCase();
    const byTag = tag ? list.filter((c) => c.tags.includes(tag)) : list;
    const hit = q ? byTag.filter((c) => [c.name, c.title, c.ui?.recommendation?.consultation_text ?? '', c.ui?.origin?.title ?? '', tagSearchText(c.tags)].join(' ').toLowerCase().includes(q)) : byTag;
    const by: Record<Sort, (a: ChartSummary, b: ChartSummary) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => (a.name || a.title).localeCompare(b.name || b.title, 'ja'),
    };
    return [...hit].sort(by[sort]);
  }, [list, query, sort, tag]);
  const tags = useMemo(() => filterTags((list ?? []).map((c) => c.tags)), [list]);

  if (!auth.enabled) return <div className={my.wrap}><p className={css.note}>{t('my.disabled')}</p></div>;
  if (auth.session === undefined) return <div className={my.wrap}><p className={css.note}>{t('my.loading')}</p></div>;
  if (!auth.session) return <div className={my.wrap}><h1 className={my.title}>{t('my.title')}</h1><p className={css.note}>{t('my.signedOut')}</p></div>;

  return (
    <div className={my.wrap}>
      <div className={my.head}>
        <div>
          <h1 className={my.title}>{t('my.title')}</h1>
          <p className={my.sub}>{t('my.subtitle')}{list ? ' · ' + t('my.count', { n: list.length }) : ''}</p>
        </div>
        <Link href="/?new=1" className={css.primary}>{t('my.newChart')}</Link>
      </div>

      <div className={my.tabs} role="tablist">
        <button type="button" role="tab" className={my.tab} aria-selected={view === 'charts'} onClick={() => setView('charts')}>{t('my.tabCharts')}</button>
        <button type="button" role="tab" className={my.tab} aria-selected={view === 'history'} onClick={() => setView('history')}>{t('my.tabHistory')}</button>
      </div>

      {view === 'history' ? <HistoryList /> : <>
      <div className={my.toolbar}>
        <input className={`${css.input} ${my.search}`} type="search" placeholder={t('my.search')} aria-label={t('my.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className={my.sortLabel}>
          <span>{t('my.sort')}</span>
          <select className={css.select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(['updated', 'created', 'name'] as const).map((s) => <option key={s} value={s}>{t(`my.sort.${s}`)}</option>)}
          </select>
        </label>
      </div>

      {tags.length > 0 && <TagFilter tags={tags} value={tag} onChange={setTag} />}
      {error && <p className={css.error} role="alert">{error}</p>}
      {!shown ? (
        !error && <p className={css.note}>{t('my.loading')}</p>
      ) : list!.length === 0 ? (
        <p className={my.emptyBox}>{t('my.empty')}</p>
      ) : shown.length === 0 ? (
        <p className={css.note}>{t('my.noMatch')}</p>
      ) : (
        <ul className={my.grid}>
          {shown.map((c) => <ChartCard key={c.id} chart={c} editing={c.id === editingId} onChanged={refresh} />)}
        </ul>
      )}
      </>}
    </div>
  );
}

function ChartCard({ chart: c, editing, onChanged }: { chart: ChartSummary; editing: boolean; onChanged: () => Promise<void> }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const [renaming, setRenaming] = useState<string | null>(null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = c.name || c.title || t('save.untitled');
  const date = (iso: string) => new Date(iso).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await onChanged(); } catch (e) { setError(t('my.actionError', { message: (e as Error).message ?? String(e) })); } finally { setBusy(false); }
  }
  function submitRename(e: FormEvent) {
    e.preventDefault();
    const v = renaming?.trim();
    if (!v) return;
    void act(async () => { await renameChart(auth.client!, c.id, v); setRenaming(null); });
  }

  return (
    <li className={my.card}>
      <ProjectThumbs project={c.ui ?? null} href={`/?chart=${c.id}`} label={`${t('save.open')}：${name}`} badge={editing ? t('save.current') : undefined} />
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
            <h2 className={my.name}><Link href={`/?chart=${c.id}`}>{name}</Link></h2>
            {c.title && c.title !== c.name && <p className={my.slideTitle}>{c.title}</p>}
            {c.ui?.origin && <p className={my.consult}>{t('context.fromLibrary', { title: c.ui.origin.title })}</p>}
            {!c.ui?.origin && c.ui?.recommendation?.consultation_text && <p className={my.consult} title={c.ui.recommendation.consultation_text}>{t('my.consultation', { text: c.ui.recommendation.consultation_text })}</p>}
          </>
        )}
        <CardTags tags={c.tags} />
        <p className={my.meta}>{t('save.updated', { date: date(c.updatedAt), version: c.version })}</p>
        {renaming == null && <div className={my.actions}>
          <Link href={`/?chart=${c.id}`} className={css.linkBtn}>{t('save.open')}</Link>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => setRenaming(c.name || c.title)}>{t('save.rename')}</button>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => act(() => duplicateChart(auth.client!, c.id, t('my.copySuffix', { name })))}>{t('my.duplicate')}</button>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={async () => {
            if (await confirm({ title: t('confirm.chartTitle', { name }), body: t('confirm.chartBody'), ok: t('confirm.delete'), danger: true })) void act(() => deleteChart(auth.client!, c.id));
          }}>{t('save.delete')}</button>
        </div>}
        {error && <p className={css.error} role="alert">{error}</p>}
      </div>
    </li>
  );
}
