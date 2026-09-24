'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { useT } from '@/i18n/ui';
import { SLIDE_FONTS } from '@/i18n/slide';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import { buildPptx } from '@/export/pptx/scene-to-pptx';
import { loadChart } from '@/lib/repo/charts';
import { useAuth } from '../shell/AppShell';
import { ChartPicker } from './ChartPicker';
import { DataGrid } from './DataGrid';
import { evaluate } from './preview';
import { SavePanel } from './SavePanel';
import { Settings } from './Settings';
import { initialState, purposeOf, sampleFor, toDataset, type BuilderState } from './state';
import { EMPTY_DOC, hasUnsavedChanges, readStored, writeStored, type DocRef } from './storage';
import css from '../ui.module.css';

/** マイページなどから URL で渡される「開く」「新規」の指示 */
type Intent = { kind: 'open'; id: string } | { kind: 'new' };

function readIntent(): Intent | null {
  const q = new URLSearchParams(window.location.search);
  const id = q.get('chart');
  if (id) return { kind: 'open', id };
  if (q.get('new')) return { kind: 'new' };
  return null;
}

export default function Builder() {
  const t = useT();
  const auth = useAuth();
  const [state, setState] = useState<BuilderState>(initialState);
  const [doc, setDoc] = useState<DocRef>(EMPTY_DOC);
  const [loaded, setLoaded] = useState(false);
  const [dataSlide, setDataSlide] = useState(true);
  const [pptStatus, setPptStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [pending, setPending] = useState<Intent | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // ブラウザに残した作業中の控えを戻す
  useEffect(() => {
    const stored = readStored();
    if (stored.state) setState(stored.state);
    if (stored.doc) setDoc(stored.doc);
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) writeStored(state, doc); }, [state, doc, loaded]);

  const openChart = useCallback(async (id: string) => {
    if (!auth.client) return;
    setOpenError(null);
    try {
      const r = await loadChart(auth.client, id);
      setState(r.state);
      setDoc({ id, version: r.version, name: r.name, snapshot: JSON.stringify(r.state) });
    } catch (e) {
      setOpenError(t('save.loadError', { message: (e as Error).message ?? String(e) }));
    }
  }, [auth.client, t]);

  const startNew = useCallback(() => { setState(initialState()); setDoc(EMPTY_DOC); }, []);

  const run = useCallback((intent: Intent) => {
    setPending(null);
    if (intent.kind === 'open') void openChart(intent.id);
    else startNew();
  }, [openChart, startNew]);

  // URL の指示（?chart=… / ?new=1）。未保存の変更があれば確認してから
  useEffect(() => {
    if (!loaded || auth.session === undefined) return;
    const intent = readIntent();
    if (!intent) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (intent.kind === 'open' && intent.id === doc.id) return;
    if (hasUnsavedChanges(state, doc)) setPending(intent);
    else run(intent);
    // 読み込み完了とログイン状態の確定時に1回だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, auth.session === undefined]);

  const result = useMemo(() => evaluate(state), [state]);
  const svg = useMemo(() => (result.scene ? sceneToSvg(result.scene, { title: state.title }) : null), [result.scene, state.title]);
  const update = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));
  const noData = result.warnings.some((w) => w.key === 'warn.no_data');

  /** プレビューと同じ Scene から PPTX を作る。PptxGenJS は押した時に読み込む */
  async function downloadPptx() {
    if (!result.scene) return;
    setPptStatus({ busy: true });
    try {
      const { default: Pptx } = await import('pptxgenjs');
      const font = SLIDE_FONTS[state.slideLocale];
      const slides = [{ scene: result.scene, font }];
      if (dataSlide) slides.push({ scene: layoutDataSlide(toDataset(state), state.slideLocale), font });
      const pptx = buildPptx(Pptx, slides, { title: state.title });
      const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName(doc.name || state.title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setPptStatus({ busy: false });
    } catch (e) {
      setPptStatus({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className={css.layout}>
      <aside className={css.sidebar}>
        <SavePanel
          state={state}
          doc={doc}
          onSaved={setDoc}
          onNew={() => (hasUnsavedChanges(state, doc) ? setPending({ kind: 'new' }) : startNew())}
        />
        <ChartPicker state={state} onPick={(chart) => update({ chart })} />
        <Settings state={state} update={update} />
        <button type="button" className="btn" onClick={() => setState((s) => ({ ...initialState(), ...sampleFor(purposeOf(s)), chart: s.chart }))}>{t('action.reset')}</button>
      </aside>

      <main className={css.main}>
        {pending && (
          <div className={css.guard} role="alertdialog" aria-live="assertive">
            <p>{t('guard.message')}</p>
            <div className={css.buttons}>
              <button type="button" className={css.primary} onClick={() => run(pending)}>{t('guard.proceed')}</button>
              <button type="button" className="btn" onClick={() => setPending(null)}>{t('guard.stay')}</button>
            </div>
          </div>
        )}
        {openError && <p className={css.error} role="alert">{openError}</p>}

        <section className={css.slideWrap} aria-label={t('preview.title')}>
          <div className={css.slideHead}>
            <h2>{t('preview.title')}</h2>
            <div className={css.exportBar}>
              <label className={css.check}>
                <input type="checkbox" checked={dataSlide} onChange={(e) => setDataSlide(e.target.checked)} />
                {t('field.dataSlide')}
              </label>
              <button type="button" className={css.primary} disabled={!result.scene || noData || pptStatus.busy} onClick={downloadPptx}>
                {pptStatus.busy ? t('action.downloading') : t('action.downloadPptx')}
              </button>
            </div>
          </div>
          {pptStatus.error && <p className={css.error} role="alert">{t('status.pptError', { message: pptStatus.error })}</p>}
          {result.warnings.length > 0 && (
            <ul className={css.warnings}>
              {result.warnings.filter((w) => w.key !== 'warn.no_data').map((w, i) => <li key={i}>{t(w.key, w.vars)}</li>)}
            </ul>
          )}
          <div className={css.slide}>
            {svg && !noData ? (
              <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className={css.empty}>{result.error ? t('preview.error', { message: result.error }) : t('preview.empty')}</div>
            )}
          </div>
        </section>

        <section className={css.card}>
          <h2>{t('section.data')}</h2>
          <DataGrid state={state} onChange={setState} />
        </section>
      </main>
    </div>
  );
}

/** ファイル名（使えない文字を除き、長さを抑える） */
function fileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 40);
  return (base || 'chart-advisor') + '.pptx';
}
