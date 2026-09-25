'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { deleteChart, duplicateChart, listCharts, renameChart, type ChartSummary } from '@/lib/repo/charts';
import { previewSvg } from '../editor/preview';
import { readStored } from '../editor/storage';
import { viewOf } from '../editor/project';
import { useAuth } from '../shell/AppShell';
import css from '../ui.module.css';
import my from './my-page.module.css';
import { HistoryList } from './HistoryList';

type Sort = 'updated' | 'created' | 'name';

/** マイページ：保存したチャートの一覧と管理 */
export default function MyPage() {
  const t = useT();
  const auth = useAuth();
  const [list, setList] = useState<ChartSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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
    const hit = q ? list.filter((c) => (c.name + ' ' + c.title + ' ' + (c.ui?.recommendation?.consultation_text ?? '')).toLowerCase().includes(q)) : list;
    const by: Record<Sort, (a: ChartSummary, b: ChartSummary) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => (a.name || a.title).localeCompare(b.name || b.title, 'ja'),
    };
    return [...hit].sort(by[sort]);
  }, [list, query, sort]);

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

/** カードの縮小表示。複数枚のプロジェクトは、横にスクロール（または ‹ ›）で各スライドを見られる。見た枚から描く */
function SlideStrip({ chart: c, name, editing, total }: { chart: ChartSummary; name: string; editing: boolean; total: number }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const svgs = useMemo(() => {
    const out = new Map<number, string | null>();
    if (!c.ui) return out;
    for (const i of seen) { try { out.set(i, previewSvg(viewOf(c.ui, i))); } catch { out.set(i, null); } }
    return out;
  }, [c.ui, seen]);
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const k = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (k !== at) setAt(k);
    // 今の1枚と次の1枚を描いておく
    if (!seen.has(k) || (k + 1 < total && !seen.has(k + 1))) setSeen((prev) => new Set([...prev, k, Math.min(total - 1, k + 1)]));
  };
  const slides = Math.max(1, total);
  return (
    <div className={my.thumb}>
      <div ref={ref} className={my.strip} onScroll={onScroll}>
        {Array.from({ length: slides }, (_, i) => {
          const svg = svgs.get(i);
          return (
            <Link key={i} href={`/?chart=${c.id}`} className={my.stripItem} aria-label={`${t('save.open')}：${name}${total > 1 ? `（${i + 1} / ${total}）` : ''}`}>
              {svg ? <div className={my.thumbSvg} dangerouslySetInnerHTML={{ __html: svg }} /> : svg === null ? <span className={my.thumbNone}>{t('my.thumbError')}</span> : <span className={my.thumbNone} />}
            </Link>
          );
        })}
      </div>
      {editing && <span className={my.badge}>{t('save.current')}</span>}
      {total > 1 && (
        <>
          <span className={my.count}>{t('my.slideAt', { n: at + 1, total })}</span>
          {at > 0 && <button type="button" className={`${my.nav} ${my.navPrev}`} aria-label={t('my.prevSlide')} onClick={() => go(at - 1)}>‹</button>}
          {at < total - 1 && <button type="button" className={`${my.nav} ${my.navNext}`} aria-label={t('my.nextSlide')} onClick={() => go(at + 1)}>›</button>}
        </>
      )}
    </div>
  );
}

function ChartCard({ chart: c, editing, onChanged }: { chart: ChartSummary; editing: boolean; onChanged: () => Promise<void> }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = c.ui?.slides.length ?? 0;
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
      <SlideStrip chart={c} name={name} editing={editing} total={total} />
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
            {c.ui?.recommendation?.consultation_text && <p className={my.consult} title={c.ui.recommendation.consultation_text}>{t('my.consultation', { text: c.ui.recommendation.consultation_text })}</p>}
          </>
        )}
        <p className={my.meta}>{t('save.updated', { date: date(c.updatedAt), version: c.version })}</p>
        {renaming == null && <div className={my.actions}>
          <Link href={`/?chart=${c.id}`} className={css.linkBtn}>{t('save.open')}</Link>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => setRenaming(c.name || c.title)}>{t('save.rename')}</button>
          <button type="button" className={css.linkBtn} disabled={busy} onClick={() => act(() => duplicateChart(auth.client!, c.id, t('my.copySuffix', { name })))}>{t('my.duplicate')}</button>
          <button
            type="button"
            className={`${css.linkBtn} ${confirming ? css.danger : ''}`}
            disabled={busy}
            onClick={() => (confirming ? act(() => deleteChart(auth.client!, c.id)) : setConfirming(true))}
            onBlur={() => setConfirming(false)}
          >
            {confirming ? t('save.confirmDelete') : t('save.delete')}
          </button>
        </div>}
        {error && <p className={css.error} role="alert">{error}</p>}
      </div>
    </li>
  );
}
