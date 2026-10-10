'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { controlsFor, slideSvgFont } from '@/registry';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { chartVersion, loadChart, saveChart } from '@/lib/repo/charts';
import { checkpointPptExport } from '@/lib/repo/decks';
import { track } from '@/lib/ab/track';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { useConfirm } from '../shared/Confirm';
import { useIsAdmin } from '../library/useIsAdmin';
import { evaluate } from '../editor/preview';
import { viewOf, withView, type ProjectState } from '../editor/project';
import { controlSource, hasBase, viewAxes, type BuilderState } from '../editor/state';
import { sampleLeftovers } from '../editor/leftovers';
import { buildProjectPptx, downloadFile } from '../editor/pptExport';
import { OutputMenu } from '../editor/OutputMenu';
import { sendNote, useSendFile } from '../editor/useSendFile';
import { parseCellNumber } from './parse';
import css from './quick.module.css';
import { sourceMetaOf, sourcePatch } from '../data/source';

type Doc = { id: string; version: number; name: string; snapshot: string };
type Period = 'current' | 'base';

/**
 * かんたん修正（スマホ向け）：保存したチャートの、タイトル・出典・数字・強調だけを直して、保存と PPT 出力をする。
 * データの貼り付け・行や列の増減・チャートの種類などはパソコンのエディターで。
 */
export default function QuickEdit() {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const beta = useBetaAccess();
  const admin = useIsAdmin();
  const confirm = useConfirm();
  const [id, setId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [original, setOriginal] = useState<ProjectState | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ busy?: 'save' | 'ppt' | 'send'; note?: string; error?: string }>({});
  const sender = useSendFile();
  const [row, setRow] = useState(0);
  const [period, setPeriod] = useState<Period>('current');
  const [zoom, setZoom] = useState(false);

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('chart')); }, []);
  useEffect(() => {
    if (!id || !auth.client) return;
    let off = false;
    loadChart(auth.client, id).then((r) => {
      if (off) return;
      setProject(r.state); setOriginal(r.state);
      setDoc({ id, version: r.version, name: r.name, snapshot: JSON.stringify(r.state) });
      track('quick_edit_opened', { loggedIn: true, oncePerPage: true });
    }).catch((e: Error) => { if (!off) setError(t('quick.loadError', { message: e.message ?? String(e) })); });
    return () => { off = true; };
  }, [id, auth.client, t]);

  const dirty = !!project && !!doc && JSON.stringify(project) !== doc.snapshot;
  // 保存していない直しがあるまま閉じようとしたら知らせる
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const view = project ? viewOf(project) : null;
  const result = useMemo(() => (view ? evaluate(view) : null), [view]);
  const svg = useMemo(() => (result?.scene && view ? sceneToSvg(result.scene, { title: view.title, font: slideSvgFont(view.deckStyle?.font, view.slideLocale) }) : null), [result, view]);

  if (!id) return <div className={css.wrap}><p className={css.note}>{t('quick.noChart')} <Link href="/charts">{t('quick.toList')}</Link></p></div>;
  if (error) return <div className={css.wrap}><p className={css.error} role="alert">{error}</p><Link href="/charts">{t('quick.toList')}</Link></div>;
  if (!project || !view || !doc) return <div className={css.wrap}><p className={css.note}>{t('my.loading')}</p></div>;

  const i = project.current;
  const setView = (patch: Partial<BuilderState>) => setProject((p) => (p ? withView(p, p.current, { ...viewOf(p), ...patch }) : p));
  const orig = original ? viewOf(original, Math.min(i, original.slides.length - 1)) : null;

  // 数字：縦長の表から切り出しているデータは、ここでは直さない（パソコンで）
  const d = view.dataset;
  const canEditData = !d.long;
  const withBase = hasBase(view);
  const r = Math.min(row, d.rows.length - 1);
  const vals = d.periods[period].values[r] ?? [];
  const origVal = (k: number): number | null | undefined => {
    const od = orig?.dataset;
    if (!od || od.rows[r] !== d.rows[r] || od.cols[k] !== d.cols[k]) return undefined;
    return od.periods[period].values[r]?.[k];
  };
  const setCell = (k: number, v: number | null) => {
    const values = d.periods[period].values.map((rr, ri) => (ri === r ? rr.map((x, ki) => (ki === k ? v : x)) : rr));
    setView({ dataset: { ...d, periods: { ...d.periods, [period]: { ...d.periods[period], values } } } });
  };
  const changedCount = (p: Period) => {
    const od = orig?.dataset;
    if (!od || od.rows.join('\u0001') !== d.rows.join('\u0001') || od.cols.join('\u0001') !== d.cols.join('\u0001')) return 0;
    return d.periods[p].values.reduce((a, rr, ri) => a + rr.filter((x, ki) => x !== od.periods[p].values[ri]?.[ki]).length, 0);
  };

  // 強調：そのチャートで使える時だけ
  const canHighlight = controlsFor(view.chart).some((c) => c.id === 'highlight');
  const axes = viewAxes(view);
  const hlOptions = controlSource('highlight', 'cols', view.chart) === 'rows' ? axes.rows : axes.cols;
  const hl = typeof view.controls.highlight === 'string' && hlOptions.includes(view.controls.highlight) ? view.controls.highlight : '';

  async function save() {
    if (!auth.client || !project || !doc) return;
    setStatus({ busy: 'save' });
    try {
      // ほかの端末で新しく保存されていたら、上書きしてよいか確かめる
      const latest = await chartVersion(auth.client, doc.id);
      if (latest > doc.version && !(await confirm({ title: t('quick.conflictTitle'), body: t('quick.conflictBody'), ok: t('quick.overwrite'), danger: true }))) {
        setStatus({}); return;
      }
      const saved = await saveChart(auth.client, doc.id, project);
      setDoc({ ...doc, version: saved.version, snapshot: JSON.stringify(project) });
      setOriginal(project);
      setStatus({ note: t('quick.saved') });
      track('quick_edit_saved', { loggedIn: true });
    } catch (e) {
      setStatus({ error: t('save.error', { message: (e as Error).message ?? String(e) }) });
    }
  }

  /** PPT：ダウンロードか、送る（メールなど）。見本のまま残っていれば先に確かめる */
  async function ppt(mode: 'download' | 'send') {
    if (!project || !doc) return;
    const left0 = sampleLeftovers(project);
    if (left0.length && !(await confirm({
      title: t('leftover.confirmTitle'),
      body: [t('leftover.confirmLead'), ...left0.map((k) => '・' + t(`leftover.item.${k}`)), '', t('leftover.confirmTail')].join('\n'),
      ok: t('leftover.exportAnyway'),
    }))) return;
    setStatus({ busy: mode === 'send' ? 'send' : 'ppt' });
    try {
      const res = await buildProjectPptx({ project, name: doc.name, dataSlide: true, client: auth.client, count: beta.state.kind !== 'off', admin, t });
      if (!res.ok) { setStatus({ error: t('ppt.limit') }); return; }
      if (auth.client) {
        const checkpoint = await checkpointPptExport(auth.client, doc.id, project);
        setDoc((current) => current?.id === doc.id ? { ...current, version: checkpoint.version } : current);
      }
      const remain = res.left != null ? t('ppt.remaining', { n: res.left }) : '';
      if (mode === 'download') {
        downloadFile(res.file);
        setStatus(remain ? { note: remain } : {});
        track('quick_edit_exported', { loggedIn: true, detail: 'download' });
        return;
      }
      const title = viewOf(project, 0).title;
      const r = await sender.send(res.file, doc.name || title, t('share.body', { title }));
      setStatus({ note: [sendNote(r, t), remain].filter(Boolean).join(' ') });
      track('quick_edit_exported', { loggedIn: true, detail: r === 'mailto' ? 'mail' : 'share' });
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className={css.wrap}>
      <div className={css.top}>
        <Link href="/charts" className={css.back}>← {t('quick.toList')}</Link>
        <h1 className={css.name}>{doc.name || view.title || t('save.untitled')}</h1>
        <p className={css.lead}>{t('quick.lead')}</p>
      </div>

      {project.slides.length > 1 && (
        <div className={css.slides} role="group" aria-label={t('quick.slides')}>
          {project.slides.map((s, k) => (
            <button key={s.id} type="button" aria-pressed={k === i} onClick={() => { setProject({ ...project, current: k }); setRow(0); }}>{k + 1}</button>
          ))}
        </div>
      )}

      <section className={css.preview} aria-label={t('quick.preview')}>
        <div className={zoom ? css.zoomed : css.fit}>
          {svg ? <div className={css.svg} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className={css.note}>{t('quick.cannotDraw')}</p>}
        </div>
        <button type="button" className={css.zoomBtn} aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>{zoom ? t('quick.fit') : t('quick.zoom')}</button>
      </section>

      <section className={css.card}>
        <label className={css.field}>
          <span>{t('quick.title')}</span>
          <textarea rows={3} value={view.title} onChange={(e) => setView({ title: e.target.value })} />
        </label>
        <label className={css.field}>
          <span>{t('quick.source')}</span>
          <input value={sourceMetaOf(view.source, view.sourceMeta, locale, view.sourceMeta?.kind === 'sample' && view.sourceMeta.citationText === view.source)?.title ?? ''}
            onChange={(e) => setView(sourcePatch(sourceMetaOf(view.source, view.sourceMeta, locale, view.sourceMeta?.kind === 'sample' && view.sourceMeta.citationText === view.source), { title: e.target.value, kind: 'internal' }, locale))} />
        </label>
        <label className={css.field}>
          <span>{t('field.sourceUrl')}</span>
          <input type="url" value={view.sourceMeta?.url ?? ''} onChange={(e) => setView(sourcePatch(sourceMetaOf(view.source, view.sourceMeta, locale, false), { url: e.target.value, kind: e.target.value ? 'external_web' : 'internal' }, locale))} />
        </label>
        <label className={css.field}>
          <span>{t('field.sourcePublishedAt')}</span>
          <input type="date" value={view.sourceMeta?.publishedAt ?? ''} onChange={(e) => setView(sourcePatch(sourceMetaOf(view.source, view.sourceMeta, locale, false), { publishedAt: e.target.value }, locale))} />
        </label>
        {canHighlight && hlOptions.length > 0 && (
          <label className={css.field}>
            <span>{t('quick.highlight')}</span>
            <select value={hl} onChange={(e) => {
              const controls = { ...view.controls };
              if (e.target.value) controls.highlight = e.target.value; else delete controls.highlight;
              setView({ controls });
            }}>
              <option value="">{t('field.highlightNone')}</option>
              {hlOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className={css.card} aria-labelledby="quick-data">
        <h2 id="quick-data" className={css.h2}>{t('quick.data')}</h2>
        {!canEditData ? <p className={css.note}>{t('quick.dataLong')}</p> : (
          <>
            {withBase && (
              <div className={css.periods} role="group" aria-label={t('quick.period')}>
                {(['current', 'base'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                    {t(p === 'current' ? 'grid.tabCurrent' : 'grid.tabBase', { label: d.periods[p].label })}
                    {changedCount(p) > 0 && <span className={css.count}>{changedCount(p)}</span>}
                  </button>
                ))}
              </div>
            )}
            <label className={css.field}>
              <span>{d.dimensions?.rows || t('quick.row')}</span>
              <select value={r} onChange={(e) => setRow(Number(e.target.value))}>
                {d.rows.map((name, k) => <option key={k} value={k}>{name}</option>)}
              </select>
            </label>
            <ul className={css.cells}>
              {d.cols.map((col, k) => {
                const o = origVal(k);
                const changed = o !== undefined && o !== (vals[k] ?? null);
                return (
                  <li key={k} className={changed ? css.changed : undefined}>
                    <label>
                      <span className={css.col}>{col}</span>
                      <NumberInput value={vals[k] ?? null} onChange={(v) => setCell(k, v)} label={`${d.rows[r]} ${col}`} />
                    </label>
                    {changed && <span className={css.was}>{t('quick.was', { value: o == null ? '—' : String(o) })}</span>}
                  </li>
                );
              })}
            </ul>
            {d.unit && <p className={css.note}>{t('quick.unit', { unit: d.unit })}</p>}
          </>
        )}
      </section>

      <p className={css.pc}>{t('quick.pcNote')} <Link href={`/editor?chart=${doc.id}`}>{t('quick.openEditor')}</Link></p>

      <div className={css.bar}>
        {(status.note || status.error) && <p className={status.error ? css.error : css.ok} role="status">{status.error ?? status.note}</p>}
        <div className={css.buttons}>
          <button type="button" className={css.primary} disabled={!!status.busy || !dirty} onClick={save}>
            {status.busy === 'save' ? t('save.saving') : dirty ? t('quick.save') : t('quick.noChanges')}
          </button>
          <OutputMenu up wrapClass={css.outWrap} buttonClass={css.secondary} disabled={!!status.busy} busy={status.busy === 'ppt' || status.busy === 'send'}
            onDownload={() => ppt('download')} onSend={() => ppt('send')} />
        </div>
        {sender.pending && <button type="button" className={css.primary} onClick={async () => { const r = await sender.retry(); if (r) setStatus({ note: sendNote(r, t) }); }}>{t('share.retry')}</button>}
      </div>
    </div>
  );
}

/** 数字の入力。入力中はそのままの文字を持ち、数字として読めた時だけ反映する（「1,2」の途中などで消えないように） */
function NumberInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(value == null ? '' : String(value)); }, [value, focus]);
  return (
    <input
      inputMode="decimal" aria-label={label} value={text}
      onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); const v = parseCellNumber(text); if (v !== undefined) onChange(v); }}
      onChange={(e) => { setText(e.target.value); const v = parseCellNumber(e.target.value); if (v !== undefined) onChange(v); }}
    />
  );
}
