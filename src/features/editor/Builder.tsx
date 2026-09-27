'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { chartAdvice, chartName, dataSuggestions } from './advice';
import { editorCoach } from './coach';
import { loadChart } from '@/lib/repo/charts';
import { copyOfLibrary, getLibraryItem, libraryProject } from '@/lib/repo/library';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { useConfirm } from '../shared/Confirm';
import { FREE_PPT_PER_MONTH } from '@/lib/repo/beta';
import { buildProjectPptx, downloadFile } from './pptExport';
import { sendNote, useSendFile } from './useSendFile';
import { useDevice } from '@/lib/ab/useDevice';
import { track } from '@/lib/ab/track';
import { ChartPicker } from './ChartPicker';
import { DataGrid } from './DataGrid';
import { evaluate } from './preview';
import { SavePanel } from './SavePanel';
import { initHistory, pushHistory, redo, undo } from './history';
import { switchChart } from './chartSwitch';
import { SlideStrip } from './SlideStrip';
import { ContextPane } from './ContextPane';
import { readPlan } from '../start/plan';
import { localize, registry } from '@/registry';
import { checkRecipeData, recipeIssueText } from '@/engine/recipes';
import {
  duplicateSlide, projectFromPlan, initialProject, moveSlide, newProject, newProjectFromPlan, removeSlide, selectSlide, viewOf, withView, type ProjectState,
  expectsTimeRows, familyOf, projectUsesBase, sharedCount, transposeProject,
} from './project';
import { isSampleData } from './fromRecipe';
import { needsText } from '../shared/needs';
import { Settings } from './Settings';
import { SPLIT_MAX, SPLIT_MIN, SPLIT_PRESETS, useSplit } from './useSplit';
import { checkEndpoints, initialState, purposeOf, sampleFor, toDataset, type BuilderState } from './state';
import { sampleLeftovers } from './leftovers';
import { useIsAdmin } from '../library/useIsAdmin';
import { EMPTY_DOC, hasUnsavedChanges, readStored, writeStored, type DocRef } from './storage';
import css from '../ui.module.css';

/** マイページなどから URL で渡される「開く」「新規」の指示 */
type Intent = { kind: 'open'; id: string } | { kind: 'new' } | { kind: 'plan' } | { kind: 'library'; id: string } | { kind: 'libraryEdit'; id: string };

function readIntent(): Intent | null {
  const q = new URLSearchParams(window.location.search);
  const id = q.get('chart');
  if (id) return { kind: 'open', id };
  const lib = q.get('library');
  if (lib) return { kind: 'library', id: lib };
  const libEdit = q.get('libraryEdit');
  if (libEdit) return { kind: 'libraryEdit', id: libEdit };
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
  // 2指標スロープから出た時に外した右の指標の名前（「元に戻す」の案内）
  const [pairNote, setPairNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dataSlide, setDataSlide] = useState(true);
  const [pptStatus, setPptStatus] = useState<{ busy: boolean; mode?: 'download' | 'send'; error?: string; plain?: boolean; note?: string }>({ busy: false });
  const sender = useSendFile();
  const beta = useBetaAccess();
  const device = useDevice();
  useEffect(() => { if (auth.session !== undefined) track('editor_opened', { loggedIn: !!auth.session, oncePerPage: true }); }, [auth.session]);
  const confirm = useConfirm();
  const admin = useIsAdmin();
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
  // まだ何も触っていない見本のままなら、スライドの言語を画面の言語に合わせる（日本語の画面で英語のスライドから始まらないように）
  useEffect(() => {
    if (!loaded || doc.id || project.slideLocale === locale) return;
    const untouched = [initialProject(), newProject('en')].some((p) => JSON.stringify(p) === JSON.stringify(project));
    if (untouched) loadProject(newProject(locale));
    // 画面の言語が変わった時と、読み込みが終わった時だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, loaded]);

  const openChart = useCallback(async (id: string) => {
    if (!auth.client) return;
    setOpenError(null);
    try {
      const r = await loadChart(auth.client, id);
      loadProject(r.state);
      setDoc({ id, version: r.version, name: r.name, snapshot: JSON.stringify(r.state), tags: r.tags });
    } catch (e) {
      setOpenError(t('save.loadError', { message: (e as Error).message ?? String(e) }));
    }
  }, [auth.client, t, loadProject]);

  const startNew = useCallback(() => { setProject(newProject(locale)); setDoc(EMPTY_DOC); }, [locale]);

  /** Library の見本を複製して始める（保存前の新しい作業。名前は「〜（見本から）」） */
  const openLibrary = useCallback(async (id: string) => {
    if (!auth.client) return;
    setOpenError(null);
    try {
      const item = await getLibraryItem(auth.client, id);
      loadProject(copyOfLibrary(item));
      setDoc({ ...EMPTY_DOC, name: t('library.copyName', { title: item.title }) });
    } catch (e) {
      setOpenError(t('library.loadError', { message: (e as Error).message ?? String(e) }));
    }
  }, [auth.client, t, loadProject]);

  /** 管理者：見本そのものを開いて直す（複製ではない。保存の欄の「見本を更新」で書き戻す） */
  const editLibrary = useCallback(async (id: string) => {
    if (!auth.client) return;
    setOpenError(null);
    try {
      const item = await getLibraryItem(auth.client, id);
      const p = libraryProject(item.project);
      loadProject(p);
      setDoc({ ...EMPTY_DOC, name: item.title, snapshot: JSON.stringify(p), library: { id: item.id, title: item.title, tags: item.tags } });
    } catch (e) {
      setOpenError(t('library.loadError', { message: (e as Error).message ?? String(e) }));
    }
  }, [auth.client, t, loadProject]);

  /**
   * ② で選んだ案から始める：選んだ案を1枚ずつスライドにした、新しいプロジェクト。
   * 前に編集していたデータ（縦長の表の切り出しなど）は持ち込まず、案に合う見本から始める（③でデータを入れる）
   */
  const startPlan = useCallback(() => {
    const plan = readPlan();
    if (!plan) return;
    // 「② に戻る」から来た時はデータを保つ。「新しく作る」からは見本で始める（前のデータを持ち込まない）
    setProject((cur) => (plan.keepData ? projectFromPlan(plan, viewOf(cur), locale) : newProjectFromPlan(plan, locale)) ?? cur);
    setDoc(EMPTY_DOC);
    setHasPlan(true);
  }, [locale]);

  const run = useCallback((intent: Intent) => {
    setPending(null);
    if (intent.kind === 'open') void openChart(intent.id);
    else if (intent.kind === 'library') void openLibrary(intent.id);
    else if (intent.kind === 'libraryEdit') void editLibrary(intent.id);
    else if (intent.kind === 'plan') startPlan();
    else startNew();
  }, [openChart, openLibrary, editLibrary, startNew, startPlan]);

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
  // 別のスライド・別のチャートに移ったら「右の指標を外しました」の案内は消す
  useEffect(() => { setPairNote(null); }, [project.current]);
  const recipeCheck = useMemo(() => (slide.recipe ? checkRecipeData(registry.recipes[slide.recipe], toDataset(state), { endpoints: checkEndpoints(state) }) : null), [slide.recipe, state]);
  const svg = useMemo(() => (result.scene ? sceneToSvg(result.scene, { title: state.title }) : null), [result.scene, state.title]);
  const update = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));
  const noData = result.warnings.some((w) => w.key === 'warn.no_data');
  const advice = useMemo(() => chartAdvice(state), [state]);
  // 補完アドバイス：全スライドの組み合わせで、まだ見せられないことを案内する
  const coach = useMemo(() => editorCoach(project), [project]);
  const suggestions = useMemo(() => dataSuggestions(state), [state]);

  /** プレビューと同じ Scene から PPTX を作る。PptxGenJS は押した時に読み込む */
  const ready = results.map((r) => !!r.scene && !r.warnings.some((w) => w.key === 'warn.no_data'));
  const readyCount = ready.filter(Boolean).length;

  /** プレビューと同じ Scene から PPTX を作る（全スライドを順に、最後に元データ）。PptxGenJS は押した時に読み込む */
  async function downloadPptx(mode: 'download' | 'send' = 'download') {
    if (!readyCount) return;
    // 見本のタイトル・出典・データのまま出力しないよう、残っていれば確かめる（出力の回数は数えない）
    const left0 = sampleLeftovers(project);
    if (left0.length && !(await confirm({
      title: t('leftover.confirmTitle'),
      body: [t('leftover.confirmLead'), ...left0.map((k) => '・' + t(`leftover.item.${k}`)), '', t('leftover.confirmTail')].join('\n'),
      ok: t('leftover.exportAnyway'),
    }))) return;
    setPptStatus({ busy: true, mode });
    try {
      const r = await buildProjectPptx({ project, name: doc.name ?? '', dataSlide, client: auth.client, count: beta.state.kind !== 'off', admin, t });
      if (!r.ok) { setPptStatus({ busy: false, error: t('ppt.limit', { n: FREE_PPT_PER_MONTH }), plain: true }); return; }
      const remain = r.left != null ? t('ppt.remaining', { n: r.left }) : '';
      let sent = '';
      if (mode === 'download') downloadFile(r.file);
      else {
        const title = viewOf(project, 0).title;
        sent = sendNote(await sender.send(r.file, doc.name || title, t('share.body', { title })), t);
      }
      const note = [sent, remain].filter(Boolean).join(' ');
      setPptStatus({ busy: false, ...(note ? { note } : {}) });
    } catch (e) {
      setPptStatus({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const recipe = slide.recipe ? registry.recipes[slide.recipe] : null;

  return (
    <>
    {/* スマホでは、かんたん修正へ案内する（パソコン・タブレットはそのまま） */}
    {device === 'phone' && (
      <p className={css.phoneBanner}>
        {doc.id ? t('quick.phoneBanner') : t('quick.phoneBannerNoDoc')}{' '}
        <Link href={doc.id ? `/quick?chart=${doc.id}` : '/charts'} className={css.linkBtn}>{doc.id ? t('quick.link') : t('quick.toList')}</Link>
      </p>
    )}
    <div className={css.workspace}>
      {/* 左：現在地と設計意図（スライドの一覧・採用した切り口・答える問い・補完アドバイス） */}
      <ContextPane recipe={recipe} state={state} index={project.current} total={project.slides.length} hasPlan={hasPlan} consultation={project.origin ? undefined : project.recommendation?.consultation_text} origin={project.origin} advice={advice.map((a) => t(`fit.${a.code}` as MessageKey, a.vars))} suggestions={suggestions.map((a) => t(`suggest.${a.code}` as MessageKey))}
        coach={coach} project={project} setProject={setProject}
        onComplement={(id, on) => update({ complements: { ...state.complements, [id]: on } })}>
        <SlideStrip
          project={project}
          results={results}
          onSelect={(i) => setProject((p) => selectSlide(p, i))}
          onDuplicate={() => setProject((p) => duplicateSlide(p))}
          onRemove={async () => {
            const n = project.current + 1;
            if (await confirm({ title: t('confirm.slideTitle', { n }), body: t('confirm.slideBody'), ok: t('confirm.delete'), danger: true })) setProject((p) => removeSlide(p));
          }}
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
          <p className={css.privacyNote}>{t('privacy.dataNote')} <Link href="/privacy" className={css.linkBtn} target="_blank">{t('privacy.link')}</Link></p>
          <DataGrid
            state={state} onChange={setState}
            showBase={projectUsesBase(project)}
            needs={needsText(t, slide.recipe ? registry.recipes[slide.recipe] : null, registry.purposes[purposeOf(state)].schema, state.chart)}
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
        <ChartPicker state={state} onPick={(chart) => {
          // 必ず切り替える（確認で止めない）。2指標スロープの右の指標を外した時は、その下に「外しました・元に戻す」を出す
          const r = switchChart(state, chart);
          setState(() => r.state);
          setPairNote(r.removedPair);
        }} />
        {pairNote && state.chart !== 'slope_pair' && (
          <p className={css.pairNote} role="status">
            {t('pair.removed', { name: pairNote })}{' '}
            <button type="button" className={css.linkBtn} onClick={() => { doUndo(); setPairNote(null); }}>{t('history.undo')}</button>
          </p>
        )}
        <Settings state={state} update={update} recipe={recipe} showBase={projectUsesBase(project)} />
        <button type="button" className="btn" onClick={async () => {
          if (await confirm({ title: t('confirm.resetTitle'), body: t('confirm.resetBody'), ok: t('confirm.reset'), danger: true })) setState((s) => ({ ...initialState(s.slideLocale), ...sampleFor(purposeOf(s), s.slideLocale), slideLocale: s.slideLocale, chart: s.chart }));
        }}>{t('action.reset')}</button>
        <div className={css.outputBox}>
          <h2>{t('section.output')}</h2>
          <label className={css.check}>
            <input type="checkbox" checked={dataSlide} onChange={(e) => setDataSlide(e.target.checked)} />
            {t('field.dataSlide')}
          </label>
          <button type="button" className={css.primary} disabled={!readyCount || pptStatus.busy} onClick={() => downloadPptx('download')}>
            {pptStatus.busy && pptStatus.mode !== 'send' ? t('action.downloading') : project.slides.length > 1 ? t('action.downloadPptxN', { n: readyCount }) : t('action.downloadPptx')}
          </button>
          {/* メールで送る：共有の画面（添付したまま）か、いつものメールソフト */}
          <button type="button" className="btn" disabled={!readyCount || pptStatus.busy} onClick={() => downloadPptx('send')}>
            {pptStatus.busy && pptStatus.mode === 'send' ? t('share.preparing') : t('share.button')}
          </button>
          {sender.pending && <button type="button" className={css.primary} onClick={async () => { const r = await sender.retry(); if (r) setPptStatus({ busy: false, note: sendNote(r, t) }); }}>{t('share.retry')}</button>}
          {pptStatus.error && <p className={css.error} role="alert">{pptStatus.plain ? pptStatus.error : t('status.pptError', { message: pptStatus.error })}</p>}
          {pptStatus.note && !pptStatus.error && <p className={css.note}>{pptStatus.note}</p>}
        </div>
      </aside>
    </div>
    </>
  );
}
