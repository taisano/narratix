'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { chartAdvice, chartName, dataSuggestions } from './advice';
import { SLIDE_FONTS } from '@/i18n/slide';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import { buildPptx } from '@/export/pptx/scene-to-pptx';
import { loadChart } from '@/lib/repo/charts';
import { useAuth } from '../shell/AppShell';
import { ChartPicker } from './ChartPicker';
import { DataGrid } from './DataGrid';
import { evaluate } from './preview';
import { SavePanel } from './SavePanel';
import { initHistory, pushHistory, redo, undo } from './history';
import { SlideStrip } from './SlideStrip';
import { ContextPane } from './ContextPane';
import { readPlan } from '../start/plan';
import { localize, registry } from '@/registry';
import { checkRecipeData, recipeIssueText } from '@/engine/recipes';
import {
  duplicateSlide, initialProject, moveSlide, projectFromPlan, removeSlide, selectSlide, viewOf, withView, type ProjectState,
  expectsTimeRows, familyOf, projectUsesBase, sharedCount, transposeProject,
} from './project';
import { isSampleData } from './fromRecipe';
import { needsText } from '../shared/needs';
import { Settings } from './Settings';
import { SPLIT_MAX, SPLIT_MIN, SPLIT_PRESETS, useSplit } from './useSplit';
import { SCHEMA_SAMPLE, checkEndpoints, initialState, purposeOf, sampleFor, toDataset, type BuilderState } from './state';
import { EMPTY_DOC, hasUnsavedChanges, readStored, writeStored, type DocRef } from './storage';
import css from '../ui.module.css';

/** マイページなどから URL で渡される「開く」「新規」の指示 */
type Intent = { kind: 'open'; id: string } | { kind: 'new' } | { kind: 'plan' };

function readIntent(): Intent | null {
  const q = new URLSearchParams(window.location.search);
  const id = q.get('chart');
  if (id) return { kind: 'open', id };
  if (q.get('new')) return { kind: 'new' };
  if (q.get('plan')) return { kind: 'plan' };
  return null;
}

/** 見ているスライドを替えただけ（current 以外は同じ）なら、元に戻すの1手に数えない */
const sameExceptView = (a: ProjectState, b: ProjectState) => a.current !== b.current && a.slides === b.slides && a.dataset === b.dataset && a.datasets === b.datasets && a.source === b.source && a.slideLocale === b.slideLocale;

export default function Builder() {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  // プロジェクト＝データ1つ＋スライド N 枚。画面の部品には編集中の1枚分（state）を渡す
  // 元に戻す・やり直すのため、プロジェクトは履歴ごと持つ（history.ts）
  const [hist, setHist] = useState(() => initHistory<ProjectState>(initialProject()));
  const project = hist.present;
  const setProject = useCallback((u: ProjectState | ((p: ProjectState) => ProjectState)) => {
    setHist((h) => pushHistory(h, typeof u === 'function' ? u(h.present) : u, Date.now(), sameExceptView));
  }, []);
  /** 読み込み（ブラウザの控え・保存したチャートを開く）は履歴を消して始める */
  const loadProject = useCallback((p: ProjectState) => setHist(initHistory(p)), []);
  const doUndo = useCallback(() => setHist((h) => undo(h)), []);
  const doRedo = useCallback(() => setHist((h) => redo(h)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      // 入力欄の中では、ブラウザの元に戻す（文字の取り消し）に任せる
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);
  const state = viewOf(project);
  const setState = useCallback((u: BuilderState | ((s: BuilderState) => BuilderState)) => {
    setProject((p) => withView(p, p.current, typeof u === 'function' ? u(viewOf(p)) : u));
  }, []);
  const [doc, setDoc] = useState<DocRef>(EMPTY_DOC);
  const [loaded, setLoaded] = useState(false);
  const [dataSlide, setDataSlide] = useState(true);
  const [pptStatus, setPptStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [pending, setPending] = useState<Intent | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [narrowTab, setNarrowTab] = useState<'slide' | 'data'>('slide');
  const [hasPlan, setHasPlan] = useState(false);
  const split = useSplit();

  // ブラウザに残した作業中の控えを戻す
  useEffect(() => {
    const stored = readStored();
    if (stored.state) loadProject(stored.state);
    if (stored.doc) setDoc(stored.doc);
    setHasPlan(!!readPlan());
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) writeStored(project, doc); }, [project, doc, loaded]);

  const openChart = useCallback(async (id: string) => {
    if (!auth.client) return;
    setOpenError(null);
    try {
      const r = await loadChart(auth.client, id);
      loadProject(r.state);
      setDoc({ id, version: r.version, name: r.name, snapshot: JSON.stringify(r.state) });
    } catch (e) {
      setOpenError(t('save.loadError', { message: (e as Error).message ?? String(e) }));
    }
  }, [auth.client, t, loadProject]);

  const startNew = useCallback(() => { setProject(initialProject()); setDoc(EMPTY_DOC); }, []);

  /** ② で選んだ案から始める：選んだ案を1枚ずつスライドにした、新しいプロジェクト（データは今のものを使う） */
  const startPlan = useCallback(() => {
    const plan = readPlan();
    if (!plan) return;
    setProject((cur) => projectFromPlan(plan, viewOf(cur), locale) ?? cur);
    setDoc(EMPTY_DOC);
    setHasPlan(true);
  }, [locale]);

  const run = useCallback((intent: Intent) => {
    setPending(null);
    if (intent.kind === 'open') void openChart(intent.id);
    else if (intent.kind === 'plan') startPlan();
    else startNew();
  }, [openChart, startNew, startPlan]);

  // URL の指示（?chart=… / ?new=1）。未保存の変更があれば確認してから
  useEffect(() => {
    if (!loaded || auth.session === undefined) return;
    const intent = readIntent();
    if (!intent) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (intent.kind === 'open' && intent.id === doc.id) return;
    if (hasUnsavedChanges(project, doc)) setPending(intent);
    else run(intent);
    // 読み込み完了とログイン状態の確定時に1回だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, auth.session === undefined]);

  // 全スライドを配置する（一覧の縮小表示と、PPT に全枚数を出すため）
  const results = useMemo(() => project.slides.map((_, i) => evaluate(viewOf(project, i))), [project]);
  const result = results[project.current] ?? results[0]!;
  const slide = project.slides[project.current]!;
  const recipeCheck = useMemo(() => (slide.recipe ? checkRecipeData(registry.recipes[slide.recipe], toDataset(state), { endpoints: checkEndpoints(state) }) : null), [slide.recipe, state]);
  const svg = useMemo(() => (result.scene ? sceneToSvg(result.scene, { title: state.title }) : null), [result.scene, state.title]);
  const update = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));
  const noData = result.warnings.some((w) => w.key === 'warn.no_data');
  const advice = useMemo(() => chartAdvice(state), [state]);
  const suggestions = useMemo(() => dataSuggestions(state), [state]);

  /** プレビューと同じ Scene から PPTX を作る。PptxGenJS は押した時に読み込む */
  const ready = results.map((r) => !!r.scene && !r.warnings.some((w) => w.key === 'warn.no_data'));
  const readyCount = ready.filter(Boolean).length;

  /** プレビューと同じ Scene から PPTX を作る（全スライドを順に、最後に元データ）。PptxGenJS は押した時に読み込む */
  async function downloadPptx() {
    if (!readyCount) return;
    setPptStatus({ busy: true });
    try {
      const { default: Pptx } = await import('pptxgenjs');
      const font = SLIDE_FONTS[state.slideLocale];
      const slides = results.filter((_, i) => ready[i]).map((r) => ({ scene: r.scene!, font }));
      if (dataSlide) slides.push({ scene: layoutDataSlide(toDataset(state), state.slideLocale), font });
      const pptx = buildPptx(Pptx, slides, { title: viewOf(project, 0).title });
      const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName(doc.name || viewOf(project, 0).title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setPptStatus({ busy: false });
    } catch (e) {
      setPptStatus({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const recipe = slide.recipe ? registry.recipes[slide.recipe] : null;

  return (
    <div className={css.workspace}>
      {/* 左：現在地と設計意図（スライドの一覧・採用した切り口・答える問い・補完アドバイス） */}
      <ContextPane recipe={recipe} state={state} index={project.current} total={project.slides.length} hasPlan={hasPlan} advice={advice.map((a) => t(`fit.${a.code}` as MessageKey, a.vars))} suggestions={suggestions.map((a) => t(`suggest.${a.code}` as MessageKey))}>
        <SlideStrip
          project={project}
          results={results}
          onSelect={(i) => setProject((p) => selectSlide(p, i))}
          onDuplicate={() => setProject((p) => duplicateSlide(p))}
          onRemove={() => setProject((p) => removeSlide(p))}
          onMove={(dir) => setProject((p) => moveSlide(p, p.current, dir))}
        />
      </ContextPane>

      {/* 中央：成果物（スライドのプレビューとデータ） */}
      <main className={css.mainPane} ref={split.ref} style={split.style}>
        <div className={css.narrowTabs} role="tablist" aria-label={t('pane.tabs')}>
          {(['slide', 'data'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={narrowTab === k} onClick={() => setNarrowTab(k)}>
              {t(k === 'slide' ? 'pane.tabSlide' : 'pane.tabData')}
            </button>
          ))}
        </div>

        <section className={`${css.slidePane} ${narrowTab === 'slide' ? '' : css.narrowHidden}`} aria-label={t('preview.title')}>
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
          <div className={css.slideHead}>
            <h2>{t('preview.slideN', { n: project.current + 1, total: project.slides.length })}</h2>
            <div className={css.undoBar} role="group" aria-label={t('history.label')}>
              <button type="button" className="btn" disabled={!hist.past.length} onClick={doUndo} title={t('history.undoKey')}>{t('history.undo')}</button>
              <button type="button" className="btn" disabled={!hist.future.length} onClick={doRedo} title={t('history.redoKey')}>{t('history.redo')}</button>
            </div>
          </div>
          {advice.length > 0 && (
            <ul className={css.fitList}>
              {advice.map((a) => (
                <li key={a.code}>
                  <span>{t(`fit.${a.code}` as MessageKey, a.vars)}</span>
                  {a.suggest && <button type="button" className="btn" onClick={() => update({ chart: a.suggest! })}>{t('fit.switch', { chart: chartName(a.suggest, (x) => localize(x, locale)) })}</button>}
                </li>
              ))}
            </ul>
          )}
          {suggestions.length > 0 && (
            <ul className={css.suggestList}>
              {suggestions.map((a) => (
                <li key={a.code}>
                  <span>{t(`suggest.${a.code}` as MessageKey)}</span>
                  <button type="button" className="btn" onClick={() => update({ chart: a.suggest })}>{t('fit.switch', { chart: chartName(a.suggest, (x) => localize(x, locale)) })}</button>
                </li>
              ))}
            </ul>
          )}
          {(result.warnings.some((w) => w.key !== 'warn.no_data') || !!recipeCheck?.issues.length) && (
            <ul className={css.warnings}>
              {recipeCheck?.issues.map((i, k) => <li key={`r${k}`}>{recipeIssueText(i, locale)}</li>)}
              {result.warnings.filter((w) => w.key !== 'warn.no_data').map((w, i) => <li key={i}>{t(w.key, w.vars)}</li>)}
            </ul>
          )}
          <div className={css.slideFit}>
            <div className={css.slide}>
              {svg && !noData ? (
                <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <div className={css.empty}>{result.error ? t('preview.error', { message: result.error }) : t('preview.empty')}</div>
              )}
            </div>
          </div>
        </section>

        <div className={css.splitter}>
          <div
            className={css.splitHandle}
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('pane.resize')}
            aria-valuemin={Math.round(SPLIT_MIN * 100)}
            aria-valuemax={Math.round(SPLIT_MAX * 100)}
            aria-valuenow={Math.round(split.value * 100)}
            tabIndex={0}
            {...split.handleProps}
          >
            <span className={css.grip} aria-hidden="true" />
          </div>
          <div className={css.seg} role="group" aria-label={t('pane.size')}>
            {SPLIT_PRESETS.map((p) => (
              <button key={p.key} type="button" aria-pressed={Math.abs(split.value - p.value) < 0.01} onClick={() => split.set(p.value)}>{t(p.key)}</button>
            ))}
          </div>
        </div>

        <section className={`${css.dataPane} ${narrowTab === 'data' ? '' : css.narrowHidden}`} aria-label={t('section.data')}>
          <h2>{sharedCount(project) > 1 ? t('section.dataSharedN', { n: sharedCount(project) }) : t('section.data')}</h2>
          <DataGrid
            state={state} onChange={setState}
            showBase={projectUsesBase(project)}
            needs={needsText(t, slide.recipe ? registry.recipes[slide.recipe] : null, registry.purposes[purposeOf(state)].schema)}
            isSample={isSampleData(state)}
            wantsTimeRows={familyOf(state.chart) === 'table' && expectsTimeRows(project)}
            onTranspose={() => setProject((p) => transposeProject(p))}
          />
        </section>
      </main>

      {/* 右：編集操作（保存・チャート・設定・補完・見出し・出典・言語・出力） */}
      <aside className={css.sidebarPane} aria-label={t('editor.settingsLabel')}>
        <SavePanel
          state={project}
          doc={doc}
          onSaved={setDoc}
          onNew={() => (hasUnsavedChanges(project, doc) ? setPending({ kind: 'new' }) : startNew())}
        />
        <ChartPicker state={state} onPick={(chart) => setState((s) => {
          // 見本のデータのまま、データの形が違う目的のチャートに替えたら、その目的の見本に替える
          const want = registry.purposes[registry.charts[chart].purpose].schema;
          const have = registry.purposes[purposeOf(s)].schema;
          if (isSampleData(s) && want !== have && SCHEMA_SAMPLE[want] !== SCHEMA_SAMPLE[have]) return { ...s, chart, ...sampleFor(SCHEMA_SAMPLE[want] ?? 'trend') };
          return { ...s, chart };
        })} />
        <Settings state={state} update={update} recipe={recipe} showBase={projectUsesBase(project)} />
        <button type="button" className="btn" onClick={() => setState((s) => ({ ...initialState(), ...sampleFor(purposeOf(s)), chart: s.chart }))}>{t('action.reset')}</button>
        <div className={css.outputBox}>
          <h2>{t('section.output')}</h2>
          <label className={css.check}>
            <input type="checkbox" checked={dataSlide} onChange={(e) => setDataSlide(e.target.checked)} />
            {t('field.dataSlide')}
          </label>
          <button type="button" className={css.primary} disabled={!readyCount || pptStatus.busy} onClick={downloadPptx}>
            {pptStatus.busy ? t('action.downloading') : project.slides.length > 1 ? t('action.downloadPptxN', { n: readyCount }) : t('action.downloadPptx')}
          </button>
          {pptStatus.error && <p className={css.error} role="alert">{t('status.pptError', { message: pptStatus.error })}</p>}
        </div>
      </aside>
    </div>
  );
}

/** ファイル名（使えない文字を除き、長さを抑える） */
function fileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 40);
  return (base || 'chart-advisor') + '.pptx';
}
