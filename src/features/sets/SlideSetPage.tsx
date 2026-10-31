'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { listCharts, saveChart, type ChartSummary } from '@/lib/repo/charts';
import { listLibrary, type LibraryItem } from '@/lib/repo/library';
import { previewSvg } from '../editor/preview';
import { viewOf, type ProjectState } from '../editor/project';
import { combineSlides, type SetPick } from '../editor/slideSet';
import { useAuth } from '../shell/AppShell';
import css from '../ui.module.css';
import my from '../my-page/my-page.module.css';
import st from './sets.module.css';

type Source = { id: string; label: string; project: ProjectState };
type Picked = SetPick & { key: string };
const MAX_SLIDES = 30;

function Thumb({ project, index }: { project: ProjectState; index: number }) {
  const svg = useMemo(() => { try { return previewSvg(viewOf(project, index)); } catch { return null; } }, [project, index]);
  return svg ? <div className={st.thumb} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className={st.thumb} />;
}

/**
 * スライドセット：自分で作ったチャートとテンプレートから、スライドを1枚ずつ選んで、1つの資料にまとめる。
 * 結果は、ふつうのチャート（複数枚）として「マイチャート」に保存され、そのままエディターで直せる
 */
export default function SlideSetPage() {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();
  const [charts, setCharts] = useState<ChartSummary[] | null>(null);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [tab, setTab] = useState<'mine' | 'templates'>('mine');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picked[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.client || !auth.session) return;
    let live = true;
    void listCharts(auth.client, { withUi: true, onProgress: (l) => { if (live) setCharts(l); } }).then((l) => { if (live) setCharts(l); }).catch(() => { if (live) setCharts([]); });
    void listLibrary(auth.client).then((l) => { if (live) setLibrary(l); }).catch(() => { if (live) setLibrary([]); });
    return () => { live = false; };
  }, [auth.client, auth.session]);

  const sources: Source[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Source[] = tab === 'mine'
      ? (charts ?? []).filter((c) => c.ui).map((c) => ({ id: `c:${c.id}`, label: c.name || c.title || t('sets.untitled'), project: c.ui! }))
      : (library ?? []).filter((x) => x.published).map((x) => ({ id: `l:${x.id}`, label: x.title, project: x.project }));
    return list.filter((s) => !q || s.label.toLowerCase().includes(q));
  }, [tab, charts, library, query, t]);

  const lang = picks[0]?.project.slideLocale ?? null;
  const add = (s: Source, index: number) => {
    if (picks.length >= MAX_SLIDES) return;
    setPicks((p) => [...p, { key: `${s.id}:${index}:${Date.now()}:${p.length}`, sourceId: s.id, sourceLabel: s.label, project: s.project, index }]);
  };
  const move = (i: number, d: -1 | 1) => setPicks((p) => { const j = i + d; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const remove = (i: number) => setPicks((p) => p.filter((_, k) => k !== i));

  async function create() {
    if (!auth.client || !picks.length) return;
    const r = combineSlides(picks);
    if (!r.ok) { setError(t(r.reason === 'locale_mismatch' ? 'sets.err.locale' : 'sets.err.empty')); return; }
    setBusy(true); setError(null);
    try {
      const saved = await saveChart(auth.client, null, r.project, name.trim() || t('sets.defaultName', { n: picks.length }));
      router.push(`/editor?chart=${saved.id}`);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      // 上限（プランの案内）は、案内が開いているのでここでは出さない
      if (err.code !== 'plan_limit') setError(t('sets.err.save', { message: err.message ?? String(e) }));
      setBusy(false);
    }
  }

  if (!auth.enabled) return <div className={my.wrap}><p className={css.note}>{t('my.disabled')}</p></div>;
  if (auth.session === undefined) return <div className={my.wrap}><p className={css.note}>{t('my.loading')}</p></div>;
  if (!auth.session) return <div className={my.wrap}><h1 className={my.title}>{t('sets.title')}</h1><p className={css.note}>{t('my.signedOut')}</p></div>;

  const loading = tab === 'mine' ? charts === null : library === null;
  return (
    <div className={my.wrap}>
      <div className={my.head}>
        <div>
          <h1 className={my.title}>{t('sets.title')}</h1>
          <p className={my.sub}>{t('sets.sub')}</p>
        </div>
        <Link href="/charts" className="btn">{t('sets.back')}</Link>
      </div>
      <div className={st.layout}>
        <section className={st.pick} aria-label={t('sets.pickLabel')}>
          <div className={my.tabs} role="tablist">
            <button type="button" role="tab" className={my.tab} aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>{t('sets.tab.mine')}</button>
            <button type="button" role="tab" className={my.tab} aria-selected={tab === 'templates'} onClick={() => setTab('templates')}>{t('sets.tab.templates')}</button>
          </div>
          <input className={`${css.input} ${my.search}`} type="search" placeholder={t('sets.search')} aria-label={t('sets.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {loading ? <p className={css.note}>{t('my.loading')}</p>
            : sources.length === 0 ? <p className={css.note}>{t(tab === 'mine' ? 'sets.emptyMine' : 'sets.emptyTemplates')}</p>
            : <ul className={st.sources}>
              {sources.map((s) => {
                const n = s.project.slides.length;
                const isOpen = open === s.id;
                const mismatch = lang != null && s.project.slideLocale !== lang;
                return (
                  <li key={s.id} className={st.source}>
                    <button type="button" className={st.sourceHead} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                      <span className={st.sourceName}>{s.label}</span>
                      <span className={st.sourceMeta}>{t('library.slides', { n })}</span>
                    </button>
                    {isOpen && (
                      <div className={st.slides}>
                        {mismatch && <p className={st.warn} role="note">{t('sets.err.locale')}</p>}
                        {n > 1 && !mismatch && <button type="button" className={st.addAll} disabled={picks.length + n > MAX_SLIDES} onClick={() => s.project.slides.forEach((_, i) => add(s, i))}>{t('sets.addAll', { n })}</button>}
                        <ul className={st.grid}>
                          {s.project.slides.map((sl, i) => (
                            <li key={sl.id} className={st.cell}>
                              <Thumb project={s.project} index={i} />
                              <div className={st.cellFoot}>
                                <span className={st.cellTitle} title={sl.title}>{i + 1}. {sl.title || t('sets.noTitle')}</span>
                                <button type="button" className={st.add} disabled={mismatch || picks.length >= MAX_SLIDES} onClick={() => add(s, i)} aria-label={t('sets.addOne', { n: i + 1 })}>＋</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>}
        </section>

        <section className={st.chosen} aria-label={t('sets.chosenLabel')}>
          <h2 className={st.h2}>{t('sets.chosen', { n: picks.length })}</h2>
          {picks.length === 0 ? <p className={css.note}>{t('sets.chosenEmpty')}</p> : (
            <ol className={st.list}>
              {picks.map((p, i) => (
                <li key={p.key} className={st.item}>
                  <span className={st.no}>{i + 1}</span>
                  <Thumb project={p.project} index={p.index} />
                  <div className={st.itemBody}>
                    <span className={st.itemTitle}>{p.project.slides[p.index]?.title || t('sets.noTitle')}</span>
                    <span className={st.itemFrom}>{p.sourceLabel}</span>
                  </div>
                  <div className={st.ops}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('sets.up')}>↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === picks.length - 1} aria-label={t('sets.down')}>↓</button>
                    <button type="button" onClick={() => remove(i)} aria-label={t('sets.remove')}>×</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <label className={st.nameRow}>
            <span>{t('sets.name')}</span>
            <input className={css.input} value={name} maxLength={80} placeholder={t('sets.defaultName', { n: picks.length || 1 })} onChange={(e) => setName(e.target.value)} />
          </label>
          <p className={css.note}>{t('sets.note')}</p>
          {error && <p className={css.error} role="alert">{error}</p>}
          <button type="button" className={css.primary} disabled={busy || picks.length === 0} aria-busy={busy} onClick={() => void create()}>{busy ? t('sets.creating') : t('sets.create', { n: picks.length })}</button>
        </section>
      </div>
      <span hidden>{locale}</span>
    </div>
  );
}
