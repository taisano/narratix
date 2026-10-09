'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { REUSE_KEY } from '@/lib/repo/history';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { chartAdvice, chartName, dataSuggestions } from './advice';
import { meaningIssues } from './meaning';
import { MeaningPanel } from './MeaningPanel';
import { convertChart, convertChartName } from './convert';
import { editorCoach } from './coach';
import { loadChart, saveChart } from '@/lib/repo/charts';
import { draftStore } from './drafts';
import { copyOfLibrary, getLibraryItem, libraryProject } from '@/lib/repo/library';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { useChoose, useConfirm } from '../shared/Confirm';
import { applySwitch, switchOptions, type SwitchChoice } from '../templates/switch';
import { FREE_PPT_PER_MONTH } from '@/lib/repo/beta';
import { buildProjectPptx, downloadFile } from './pptExport';
import { sendNote, useSendFile } from './useSendFile';
import { useDevice } from '@/lib/ab/useDevice';
import { track } from '@/lib/ab/track';
import { ChartPicker } from './ChartPicker';
import { AlternativesFold } from './CoachPanel';
import { Fold } from './Fold';
import { LocaleField, SourceMetadataFields } from './SlideFields';
import { TemplateEditor, TemplateLookPanel } from '../templates/TemplatePanels';
import { ensureTemplate } from '../templates/content';
import { OutputDialog, type ExecPosition } from './OutputDialog';
import { DataScope } from '../story/DataScope';
import { DataGrid, DataHead } from './DataGrid';
import { evaluate } from './preview';
import { SavePanel } from './SavePanel';
import { StoryNamePanel } from './StoryNamePanel';
import { initHistory, pushHistory, redo, undo } from './history';
import { switchChart } from './chartSwitch';
import { SlideStrip } from './SlideStrip';
import { ContextPane } from './ContextPane';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { readPlan } from '../start/plan';
import { EXEC_SUMMARY_ROLE, SLIDE_FONT_IDS, STORY_TEMPLATES, localize, registry, slideFontIdOf, slideSvgFont, type ChartTypeId } from '@/registry';
import { THEME_IDS, themeIdOf } from '@/engine/theme';
import { checkRecipeData, recipeIssueText } from '@/engine/recipes';
import {
  duplicateSlide, projectFromPlan, initialProject, moveSlide, newProject, newProjectFromPlan, removeSlide, selectSlide, viewOf, withView, type ProjectState,
  expectsTimeRows, familyOf, projectUsesBase, sharedCount, transposeProject,
} from './project';
import { isSampleData } from './fromRecipe';
import { needsText } from '../shared/needs';
import { Settings } from './Settings';
import { THEME_SWATCH } from './ThemePicker';
import { SPLIT_MAX, SPLIT_MIN, SPLIT_PRESETS, useSplit } from './useSplit';
import { checkEndpoints, initialState, isTwoMetricChart, purposeOf, sampleFor, toDataset, type BuilderState } from './state';
import { isPlaceholderTitle, sampleLeftovers } from './leftovers';
import { autoChartTitle, chartHeaderOf } from './chartHeader';
import { scopeNote } from '@/engine/layout/compose';
import { textBasisForDataset } from '../data/canonical';
import { userTextMeta } from '../data/text';
import { sourceMetaOf, sourcePatch } from '../data/source';
import { useIsAdmin } from '../library/useIsAdmin';
import { EMPTY_DOC, hasUnsavedChanges, readStored, writeStored, type DocRef } from './storage';
import css from '../ui.module.css';
import { OutputMenu } from './OutputMenu';
import { loadStory, saveStory } from '@/lib/repo/stories';
import { checkpointPptExport } from '@/lib/repo/decks';
import type { StoryState, StorySlide } from '../story/model';
import { storyDisplayTitle } from '../story/model';
import { exportOrder, mergeProject, projectOfStory, questionForView, questionPosition, sharingQuestions } from '../story/storyProject';
import { usesRoleQuestion } from '../story/questionMap';
import { storyUrl } from './storyUrl';
import { addExecSummary, groupOf, moveQuestion, renameQuestion, setCoachingOnly } from '../story/storyOps';
import { DATA_PACK_ENABLED } from '../story/dataPackFlag';
import { DataPackBuilder } from '../story/DataPackBuilder';
import { OrganizeDialog, StoryNav, type StorySaveStatus } from '../story/StoryNav';

/** マイページなどから URL で渡される「開く」「新規」の指示 */
type Intent = { kind: 'story'; id: string } | { kind: 'open'; id: string } | { kind: 'new' } | { kind: 'plan' } | { kind: 'library'; id: string } | { kind: 'libraryEdit'; id: string } | { kind: 'draft'; id: string };
const PANEL_DENSITY_KEY = 'chart-advisor:inspector-density';
const LEFT_CLOSED_KEY = 'chart-advisor:left-closed';

function readIntent(): Intent | null {
  const q = new URLSearchParams(window.location.search);
  // ストーリーを開く（② の「スライド作成を始める」・マイチャートのストーリー）
  const story = q.get('story');
  if (story) return { kind: 'story', id: story };
  const id = q.get('chart');
  if (id) return { kind: 'open', id };
  const lib = q.get('library');
  if (lib) return { kind: 'library', id: lib };
  const libEdit = q.get('libraryEdit');
  if (libEdit) return { kind: 'libraryEdit', id: libEdit };
  const draft = q.get('draft');
  if (draft) return { kind: 'draft', id: draft };
  if (q.get('new')) return { kind: 'new' };
  if (q.get('plan')) return { kind: 'plan' };
  return null;
}

/** 見ているスライドを替えただけ（current 以外は同じ）なら、元に戻すの1手に数えない */
const sameExceptView = (a: ProjectState, b: ProjectState) => a.current !== b.current && a.slides === b.slides && a.dataset === b.dataset && a.datasets === b.datasets && a.extra === b.extra && a.source === b.source && a.slideLocale === b.slideLocale;

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
  // 出力の確認（どちらのボタンから開いたか）
  const [outDialog, setOutDialog] = useState<'download' | 'send' | null>(null);
  const [pptStatus, setPptStatus] = useState<{ busy: boolean; mode?: 'download' | 'send'; error?: string; plain?: boolean; note?: string }>({ busy: false });
  const sender = useSendFile();
  const beta = useBetaAccess();
  const device = useDevice();
  useEffect(() => { if (auth.session !== undefined) track('editor_opened', { loggedIn: !!auth.session, oncePerPage: true }); }, [auth.session]);
  const confirm = useConfirm();
  const choose = useChoose();
  const admin = useIsAdmin();
  const [pending, setPending] = useState<Intent | null>(null);
  const [guardBusy, setGuardBusy] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [narrowTab, setNarrowTab] = useState<'slide' | 'data'>('slide');
  const [dataDetailTab, setDataDetailTab] = useState<'data' | 'meta'>('data');
  const [inspectorTab, setInspectorTab] = useState<'content' | 'style'>('content');
  const [editTarget, setEditTarget] = useState<'slide' | 'chart' | 'complement'>('slide');
  const [compactMenus, setCompactMenus] = useState(false);
  const [slideFullscreen, setSlideFullscreen] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ kind: 'message' | 'chartTitle' | 'source'; value: string } | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setToolbarHost(document.getElementById('editor-toolbar')); }, []);
  const scrollInspector = (fold?: string) => {
    setTimeout(() => {
      const scroller = sidebarScrollRef.current;
      if (!scroller) return;
      if (!fold) { scroller.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const target = document.getElementById(`fold-${fold}`);
      const head = scroller.querySelector(`.${css.inspectorHead}`) as HTMLElement | null;
      if (!target) { scroller.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - (head?.offsetHeight ?? 0) - 8;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 50);
  };
  const focusInspector = (target: typeof editTarget, tab: typeof inspectorTab, fold?: string) => {
    setEditTarget(target); setInspectorTab(tab); setDrawerOpen(true);
    scrollInspector(fold);
  };
  /** 左の情報欄を畳む。1001〜1100pxでは右の設定を引き出しで開く。 */
  const [leftClosed, setLeftClosed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    // 全画面を開いている時の Esc は全画面だけを閉じる（右の引き出しは開いたまま）
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !slideFullscreen) setDrawerOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [drawerOpen, slideFullscreen]);
  useEffect(() => {
    try {
      setLeftClosed(localStorage.getItem(LEFT_CLOSED_KEY) === '1');
      setCompactMenus(localStorage.getItem(PANEL_DENSITY_KEY) === 'compact');
    } catch { /* 保存がなくても動く */ }
  }, []);
  const toggleLeft = () => setLeftClosed((closed) => {
    const next = !closed;
    try { localStorage.setItem(LEFT_CLOSED_KEY, next ? '1' : '0'); } catch { /* 保存できなくても動く */ }
    return next;
  });
  const changeCompactMenus = (compact: boolean) => {
    setCompactMenus(compact);
    try { localStorage.setItem(PANEL_DENSITY_KEY, compact ? 'compact' : 'standard'); } catch { /* 保存できなくても動く */ }
  };
  useEffect(() => {
    if (!slideFullscreen) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSlideFullscreen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [slideFullscreen]);
  const [hasPlan, setHasPlan] = useState(false);
  const split = useSplit();
  // ストーリーの時：開いているストーリー（保存は自動）。言葉の問いを選んでいる時はその id。問いを整える画面
  const [storyDoc, setStoryDoc] = useState<{ id: string; name: string; story: StoryState } | null>(null);
  const router = useRouter();
  // 問いを外した直後の通知（［元に戻す］）
  const [removedNote, setRemovedNote] = useState<{ id: string; q: string } | null>(null);
  useEffect(() => {
    if (!removedNote) return;
    const h = setTimeout(() => setRemovedNote(null), 8000);
    return () => clearTimeout(h);
  }, [removedNote]);
  const [organizing, setOrganizing] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [storySave, setStorySave] = useState<StorySaveStatus>('idle');

  // ブラウザに残した作業中の控えを戻す
  useEffect(() => {
    const stored = readStored();
    if (stored.state) loadProject(stored.state);
    if (stored.doc) setDoc(stored.doc);
    setHasPlan(!!readPlan());
    setLoaded(true);
  }, []);
  // ストーリーを開いている間は、このブラウザの作業中の控え（1枚の編集）を上書きしない
  useEffect(() => { if (loaded && !storyDoc) writeStored(project, doc); }, [project, doc, loaded, storyDoc]);
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

  /** 下書きの置き場所（ログイン中はアカウント、そうでなければこのブラウザ） */
  const drafts = useMemo(() => draftStore(auth.session ? auth.client : null), [auth.session, auth.client]);

  /** 下書きを開く（下書きは一覧に残る。もう一度「下書きに残す」と同じ下書きを置き換え、「保存」するとチャートに移る） */
  const openDraft = useCallback(async (id: string) => {
    setOpenError(null);
    try {
      const d = await drafts.get(id);
      if (!d) { setOpenError(t('draft.missing')); return; }
      loadProject(d.project);
      setDoc({ ...d.doc, draftId: id, draftSnapshot: JSON.stringify(d.project) });
    } catch (e) {
      setOpenError(t('draft.loadError', { message: (e as Error).message ?? String(e) }));
    }
  }, [t, loadProject, drafts]);

  /** 今の編集を下書きに残す（同じ下書きがあれば置き換える）。残した DocRef を返す */
  const keepDraft = useCallback(async (): Promise<DocRef> => {
    const id = await drafts.put(project, doc);
    const next = { ...doc, draftId: id, draftSnapshot: JSON.stringify(project) };
    setDoc(next);
    return next;
  }, [drafts, project, doc]);

  /** チャートとして保存できたら、その下書きは消す（完成品は「チャート」、途中は「下書き」に分ける） */
  const dropDraft = useCallback((d: DocRef) => {
    if (d.draftId) void drafts.remove(d.draftId).catch(() => {});
  }, [drafts]);

  /** ストーリーを開く：ストーリーの問いを、編集画面のスライドにする（スライドの id ＝ 問いの id） */
  const openStory = useCallback(async (id: string) => {
    if (!auth.client) return;
    setOpenError(null);
    try {
      const r0 = await loadStory(auth.client, id);
      // Executive Summary が無い Story には、自動で足す（編集中は一番下。自分で外したものは足さない）
      const r = r0.story.slides.some((q) => q.routeRole === EXEC_SUMMARY_ROLE) ? r0 : { ...r0, story: addExecSummary(r0.story, locale).story };
      setStoryDoc(r);
      loadProject(projectOfStory(r.story, locale));
      setDoc(EMPTY_DOC);
    } catch (e) {
      setOpenError(t('story.error', { message: (e as Error).message ?? String(e) }));
    }
  }, [auth.client, t, loadProject, locale]);

  const run = useCallback((intent: Intent) => {
    setPending(null);
    window.history.replaceState(null, '', storyUrl(intent, window.location.pathname));
    if (intent.kind === 'story') { void openStory(intent.id); return; }
    // ほかの指示（チャートを開く・新しく作るなど）では、ストーリーの編集をやめる
    setStoryDoc(null);
    if (intent.kind === 'open') void openChart(intent.id);
    else if (intent.kind === 'draft') void openDraft(intent.id);
    else if (intent.kind === 'library') void openLibrary(intent.id);
    else if (intent.kind === 'libraryEdit') void editLibrary(intent.id);
    else if (intent.kind === 'plan') startPlan();
    else startNew();
  }, [openChart, openLibrary, editLibrary, startNew, startPlan, openDraft, openStory]);

  // URL の指示（?chart=… / ?new=1）。未保存の変更があれば確認してから
  useEffect(() => {
    if (!loaded || auth.session === undefined) return;
    const intent = readIntent();
    if (!intent) return;
    // ストーリーを開く時はURLに残す（再読込で同じストーリーを開き直す）。それ以外の指示は消す
    window.history.replaceState(null, '', storyUrl(intent, window.location.pathname));
    if (intent.kind === 'open' && intent.id === doc.id) return;
    // ストーリーは別の置き場所（stories）に自動で保存し、ブラウザの控えも上書きしないので、確認しない
    if (intent.kind !== 'story' && hasUnsavedChanges(project, doc)) setPending(intent);
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
  const recipeCheck = useMemo(() => (slide.recipe && !state.view ? checkRecipeData(registry.recipes[slide.recipe], toDataset(state), { endpoints: checkEndpoints(state) }) : null), [slide.recipe, state]);
  const svg = useMemo(() => (result.scene ? sceneToSvg(result.scene, { title: state.title, font: slideSvgFont(project.design?.font, state.slideLocale) }) : null), [result.scene, state.title, state.slideLocale, project.design?.font]);
  const update = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));
  const beginInlineEdit = (kind: 'message' | 'chartTitle' | 'source') => {
    const meta = sourceMetaOf(state.source, state.sourceMeta, locale, false);
    const value = kind === 'message' ? state.title : kind === 'chartTitle' ? (state.chartHeader?.title ?? autoChartTitle(state)) : (meta?.title ?? state.source);
    setInlineEdit({ kind, value });
    focusInspector(kind === 'chartTitle' ? 'chart' : 'slide', 'content', 'slide');
  };
  const commitInlineEdit = (edit = inlineEdit) => {
    if (!edit) return;
    if (edit.kind === 'message') {
      update({ title: edit.value, titleMeta: userTextMeta(textBasisForDataset(state.dataset, { twoMetric: isTwoMetricChart(state.chart) }), state.titleMeta) });
    } else if (edit.kind === 'chartTitle') {
      const h = state.chartHeader ?? { show: false, showPeriod: false, showUnit: false };
      const automatic = autoChartTitle(state);
      // 表示しているチャートタイトルだけを直せる（出していないものを、クリック領域から勝手に出さない）
      update({ chartHeader: { ...h, title: edit.value === automatic ? undefined : edit.value, titleMeta: edit.value === automatic ? undefined : userTextMeta(textBasisForDataset(state.dataset, { twoMetric: isTwoMetricChart(state.chart) }), h.titleMeta) } });
    } else {
      const meta = sourceMetaOf(state.source, state.sourceMeta, locale, false);
      update(sourcePatch(meta, { title: edit.value, kind: 'internal' }, locale));
    }
    setInlineEdit(null);
  };
  const noData = result.warnings.some((w) => w.key === 'warn.no_data');
  /**
   * スライド上のクリック領域は、実際に描いている文字にだけ置く（出していないチャートタイトル・出典には置かない）。
   * チャート本体の上端は、チャートのヘッダー帯の有無と、縦長データの注記行の分だけ動く（compose.ts と同じ順番）
   */
  const head = state.view ? {} : chartHeaderOf(state);
  const chartTitleShown = !!head.chartTitle;
  const chartHeadShown = !!(head.chartTitle || head.chartPeriod || head.chartUnit);
  const messageShown = !!state.title.trim();
  const sourceShown = state.chartHeader?.showSource !== false && !!state.source.trim();
  const hasScopeNote = !state.view && !!scopeNote(toDataset(state), state.slideLocale);
  const chartHotspotTop = (chartHeadShown ? 21 : 16.1) + (hasScopeNote ? 4 : 0);
  // ストーリーのグラフで、まだ見本のデータ：スライドの右上に「見本のデータ」の印（データは下の欄で入れる。PPT には出さない）
  const sampleShown = !!storyDoc && !state.view && isSampleData(state);
  const advice = useMemo(() => (state.view ? [] : chartAdvice(state)), [state]);
  // チャートの意味（金額と率を合算していないか、通貨・単位・CAGR・ウォーターフォールの整合）
  const meaning = useMemo(() => (state.view ? [] : meaningIssues(state)), [state]);
  /**
   * 重大な注意（意味のある合計にならない など）があるスライドは、保存・出力・送信・公開を止める。
   * 「理解した上で使う」にチェックした時だけ続けられる（その時の注意の中身で覚える。中身が変われば、また止める）
   */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const errorSig = (i: number) => {
    const v = viewOf(project, i);
    if (v.view) return '';
    const xs = meaningIssues(v).filter((x) => x.level === 'error');
    return xs.length ? xs.map((x) => `${x.code}:${(x.targets ?? []).join(',')}`).join('|') + ':' + viewOf(project, i).chart : '';
  };
  const blockedSlides = useMemo(() => project.slides.map((sl, i) => {
    const v = viewOf(project, i);
    // 帯に出す1件（そのスライドの最初の重大な注意）
    const issue = v.view ? undefined : meaningIssues(v).find((x) => x.level === 'error');
    return { id: sl.id, n: i + 1, sig: errorSig(i), issue };
  }).filter((x) => x.sig && overrides[x.id] !== x.sig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, overrides]);
  const blocked = blockedSlides.length > 0;
  const currentSig = errorSig(project.current);
  const [convertError, setConvertError] = useState<string | null>(null);
  useEffect(() => { setConvertError(null); }, [project.current]);
  /** 今のデータのまま、別のチャートの形に変える。できなければ理由を出して、何も変えない */
  const convertTo = (chart: ChartTypeId) => {
    const r = convertChart(project, chart);
    if (r.ok) { setConvertError(null); setProject(r.project); }
    else setConvertError(t(`convert.${r.reason}` as MessageKey, { ...r.vars, chart: convertChartName(r.vars?.chart, (x) => localize(x, locale)) }));
  };
  // 補完アドバイス：全スライドの組み合わせで、まだ見せられないことを案内する
  const coach = useMemo(() => editorCoach(project), [project]);
  const suggestions = useMemo(() => (state.view ? [] : dataSuggestions(state)), [state]);

  /** プレビューと同じ Scene から PPTX を作る。PptxGenJS は押した時に読み込む */
  const ready = results.map((r) => !!r.scene && !r.warnings.some((w) => w.key === 'warn.no_data'));
  const readyCount = ready.filter(Boolean).length;

  /** プレビューと同じ Scene から PPTX を作る（全スライドを順に、最後に元データ）。PptxGenJS は押した時に読み込む */
  async function downloadPptx(mode: 'download' | 'send' = 'download', opts: { exec?: ExecPosition | null; dataSlide?: boolean } = {}) {
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
      // ストーリー：Executive Summary を選んだ位置へ（先頭が既定）
      const story = liveStory && opts.exec ? { ...liveStory, executiveSummary: { ...liveStory.executiveSummary, position: opts.exec } } : liveStory;
      const exportProject = story ? exportOrder(project, story) : project;
      const savedDeckId = storyDoc?.id ?? doc.id;
      const r = await buildProjectPptx({ project: exportProject, name: storyDoc?.name || doc.name || '', dataSlide: opts.dataSlide ?? dataSlide, client: auth.client, count: beta.state.kind !== 'off', admin, t });
      if (!r.ok) { setPptStatus({ busy: false, error: t('ppt.limit', { n: FREE_PPT_PER_MONTH }), plain: true }); return; }
      if (auth.client && savedDeckId) {
        const checkpoint = await checkpointPptExport(auth.client, savedDeckId, exportProject, story ?? undefined);
        if (!storyDoc) setDoc((current) => current.id === savedDeckId ? { ...current, version: checkpoint.version } : current);
      }
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

  // ──────────── ストーリーの時 ────────────
  /** 今の編集内容を書き戻したストーリー（問いの並びはストーリー、グラフ・Message・データは編集画面） */
  const liveStory = useMemo(() => (storyDoc ? mergeProject(storyDoc.story, project, locale) : null), [storyDoc, project, locale]);
  // ストーリーの現在地（問い n / 全体。言葉の問いも数える）と、今のデータを共通で使う問い（「問い 1・2 と付録の問い 1件」）
  const storyPos = liveStory ? questionPosition(liveStory, project.slides[project.current]?.id ?? null) : null;
  const storyShare = useMemo(() => {
    if (!liveStory) return null;
    const s = sharingQuestions(liveStory, project);
    if (s.main.length + s.appendix <= 1) return null;
    const parts = [
      ...(s.main.length ? [t('nav.dataSharedMain', { nums: s.main.join('・') })] : []),
      ...(s.appendix ? [t('nav.dataSharedAppendix', { n: s.appendix })] : []),
    ];
    return parts.join(t('nav.dataSharedJoin'));
  }, [liveStory, project, t]);
  // 変えたら少し待って自動で保存する
  useEffect(() => {
    if (!storyDoc || !liveStory || !auth.client) return;
    const client = auth.client;
    setStorySave('saving');
    const h = setTimeout(() => {
      saveStory(client, storyDoc.id, liveStory, storyDoc.name || undefined).then(() => setStorySave('saved'), () => setStorySave('error'));
    }, 800);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStory]);
  /** 問いの並びを変える（並べ替え・整える）：ストーリーを変えて、編集画面のスライドを組み直す（データ・グラフは引き継ぐ） */
  const changeStory = (next: StoryState) => {
    if (!storyDoc) return;
    setStoryDoc({ ...storyDoc, story: next });
    setProject((p) => projectOfStory(next, locale, p));
  };
  // Executive Summary・課題→示唆→アクションの枠に関係するスライド：問いの役割（全体＝Impact、差・例外＝Mismatch、根拠＝Explanation、判断＝Decision）。メッセージは今の編集画面のもの
  const relatedRoles = liveStory ? (roles: string[]) => {
    return project.slides.map((sl, i) => ({ sl, i, q: liveStory.slides.find((q) => q.id === sl.id) }))
      .filter(({ q, sl }) => q && roles.includes(q.routeRole ?? '') && sl.id !== slide.id)
      .map(({ sl, i }) => ({ id: sl.id, n: i + 1, title: viewOf(project, i).title }));
  } : undefined;
  // 問いを選ぶ＝その問いのスライドへ（グラフ・表・言葉のどれも、編集画面のスライド）
  const selectQuestion = (q: StorySlide) => {
    const i = project.slides.findIndex((s) => s.id === q.id);
    if (i >= 0) setProject((p) => selectSlide(p, i));
  };

  return (
    <>
    {toolbarHost && createPortal(
      <div className={css.editorToolbar} aria-label={t('editor.globalStyle')}>
        <span className={css.toolbarScope}>{t('editor.allSlides')}</span>
        <label className={css.toolbarField}>
          <span className={css.toolbarLabel}>{t('editor.font')}</span>
          <select value={slideFontIdOf(project.design?.font)} onChange={(e) => setProject((p) => ({ ...p, design: { ...p.design, font: e.target.value as typeof SLIDE_FONT_IDS[number] } }))}>
            {SLIDE_FONT_IDS.map((id) => <option key={id} value={id}>{localize(registry.fonts[id].label, locale)}</option>)}
          </select>
        </label>
        <label className={css.toolbarField}>
          <span className={css.toolbarLabel}>{t('field.theme')}</span>
          <span className={css.toolbarSwatches} aria-hidden="true">{THEME_SWATCH[themeIdOf(project.design?.palette)].slice(0, 5).map((color) => <i key={color} style={{ background: color }} />)}</span>
          <select value={themeIdOf(project.design?.palette)} onChange={(e) => setProject((p) => ({ ...p, design: { ...p.design, palette: e.target.value as typeof THEME_IDS[number] } }))}>
            {THEME_IDS.map((id) => <option key={id} value={id}>{t(`field.theme.${id}`)}</option>)}
          </select>
        </label>
        <span className={css.toolbarActions}>
          {!storyDoc && <button type="button" className={`btn ${css.toolbarSave}`} onClick={() => document.getElementById('editor-save-button')?.click()}>{t('save.save')}</button>}
          <OutputMenu disabled={!readyCount || pptStatus.busy || blocked} busy={pptStatus.busy} title={blocked ? t('meaning.blocked') : undefined} onDownload={() => setOutDialog('download')} onSend={() => setOutDialog('send')} />
        </span>
      </div>, toolbarHost)}
    {/* スマホでは、かんたん修正へ案内する（パソコン・タブレットはそのまま） */}
    {device === 'phone' && (
      <p className={css.phoneBanner}>
        {doc.id ? (() => {
          const [pre, post] = t('quick.phoneBanner').split('{link}');
          return <>{pre}<Link href={`/quick?chart=${doc.id}`} className={css.linkBtn}>{t('quick.link')}</Link>{post}</>;
        })() : <>{t('quick.phoneBannerNoDoc')}{' '}<Link href="/charts" className={css.linkBtn}>{t('quick.toList')}</Link></>}
      </p>
    )}
    <div className={`${css.workspace} ${leftClosed ? css.leftClosed : ''}`}>
      {/* 左：現在地と設計意図（スライドの一覧・採用した切り口・答える問い・補完アドバイス） */}
      <ContextPane recipe={recipe} state={state} index={project.current} total={project.slides.length} hasPlan={hasPlan} consultation={project.origin ? undefined : project.recommendation?.consultation_text} origin={project.origin} advice={advice.map((a) => t(`fit.${a.code}` as MessageKey, a.vars))} suggestions={suggestions.map((a) => t(`suggest.${a.code}` as MessageKey))}
        coach={coach} project={project} setProject={setProject}
        inStory={!!storyDoc} position={storyPos ? t('slides.question', storyPos) : undefined}
        toggle={<button type="button" className={`${css.paneToggle} ${css.contextPaneToggle}`} aria-expanded={!leftClosed} aria-controls="context-pane"
          aria-label={leftClosed ? t('pane.leftOpen') : t('pane.leftClose')} title={leftClosed ? t('pane.leftOpen') : t('pane.leftClose')}
          onClick={toggleLeft}>{leftClosed ? '»' : '«'}</button>}
        onComplement={(id, on) => update({ complements: { ...state.complements, [id]: on } })}>
        <>
        {storyDoc && liveStory ? (
          <StoryNav name={storyDoc.name} story={liveStory} project={project} save={storySave}
            onSelect={selectQuestion}
            onMove={(id, dir) => changeStory(moveQuestion(liveStory, id, dir))}
            onRemove={async (id) => {
              // Story から外す（消さない）。外した直後は通知から元に戻せる
              const q = liveStory.slides.find((x) => x.id === id);
              if (!q || !(await confirm({ title: t('nav.removeTitle'), body: t('nav.removeBody'), ok: t('nav.removeOk'), danger: true }))) return;
              changeStory(setCoachingOnly(liveStory, id, true));
              setRemovedNote({ id, q: q.question });
            }}
            onRestore={(id) => { changeStory(setCoachingOnly(liveStory, id, false)); setRemovedNote(null); }}
            menu={[
              ...(DATA_PACK_ENABLED ? [{ label: t('dataPack.open'), onClick: () => setPackOpen(true) }] : []),
              ...(hasPlan ? [{ label: t('nav.rechoose'), onClick: () => router.push('/start?resume=1') }] : []),
              { label: t('nav.restart'), onClick: () => {
                // 相談の画面へ。同じ相談文を入れておく（新しい Story として作る。今の Story はマイチャートに残る）
                try { if (liveStory.consultation.trim()) sessionStorage.setItem(REUSE_KEY, liveStory.consultation); } catch { /* 文は入らないが画面は開く */ }
                router.push('/start');
              } },
            ]}
            onRename={(id, q) => changeStory(renameQuestion(liveStory, id, q))}
            suggest={(() => {
              // 自分で書き換えた問いで、見せ方を替えた時だけ「問いを〜に替える」を出す
              const q0 = storyDoc.story.slides.find((q) => q.id === slide.id);
              const v = project.slides[project.current];
              return q0?.questionEdited && v && !usesRoleQuestion(storyDoc.story.questionMapVersion, storyDoc.story.primaryRoute) ? questionForView(q0, v, locale) : null;
            })()}
            onOrganize={() => setOrganizing(true)} />
        ) : <SlideStrip
          project={project}
          results={results}
          onSelect={(i) => setProject((p) => selectSlide(p, i))}
          onDuplicate={() => setProject((p) => duplicateSlide(p))}
          onRemove={async () => {
            const n = project.current + 1;
            if (await confirm({ title: t('confirm.slideTitle', { n }), body: t('confirm.slideBody'), ok: t('confirm.delete'), danger: true })) setProject((p) => removeSlide(p));
          }}
          onMove={(dir) => setProject((p) => moveSlide(p, p.current, dir))}
        />}
        {!state.view && <AlternativesFold project={project} setProject={setProject} inStory={!!storyDoc} />}
        </>
      </ContextPane>
      {outDialog && (
        <OutputDialog mode={outDialog} slides={readyCount} dataSlide={dataSlide}
          exec={liveStory && liveStory.slides.some((q) => q.routeRole === EXEC_SUMMARY_ROLE && groupOf(q) === 'MAIN') ? liveStory.executiveSummary.position ?? 'last' : null}
          onCancel={() => setOutDialog(null)}
          onOk={({ exec, dataSlide: d }) => {
            const mode = outDialog;
            setOutDialog(null);
            setDataSlide(d);
            // 選んだ位置は Story に覚える（次の出力の初期値）
            if (exec && liveStory && exec !== (liveStory.executiveSummary.position ?? 'last')) changeStory({ ...liveStory, executiveSummary: { ...liveStory.executiveSummary, position: exec } });
            void downloadPptx(mode, { exec, dataSlide: d });
          }} />
      )}
      {removedNote && liveStory && (
        <div className={css.toast} role="status">
          <span>{t('nav.removedToast', { q: removedNote.q })}</span>
          <button type="button" className={css.linkBtn} onClick={() => { changeStory(setCoachingOnly(liveStory, removedNote.id, false)); setRemovedNote(null); }}>{t('history.undo')}</button>
        </div>
      )}
      {DATA_PACK_ENABLED && packOpen && liveStory && <DataPackBuilder story={liveStory} onChange={(next) => setStoryDoc((d) => (d ? { ...d, story: { ...d.story, ...(next.dataPackPlan ? { dataPackPlan: next.dataPackPlan } : {}) } } : d))} onClose={() => setPackOpen(false)} />}
      {organizing && liveStory && <OrganizeDialog story={liveStory} onChange={changeStory} onClose={() => setOrganizing(false)} />}

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
          <ErrorBoundary message={t('error.panel')} retryLabel={t('error.retry')} undoLabel={t('history.undo')} onUndo={hist.past.length ? doUndo : undefined} resetKey={project}>
          {pending && (
            <div className={css.guard} role="alertdialog" aria-live="assertive">
              <p>{t('guard.messageDraft', { name: doc.name || viewOf(project, 0).title || t('draft.untitled') })}</p>
              <div className={css.buttons}>
                {/* ログイン中は、マイチャートに保存してから始めるのがおすすめ。そうでなければ下書きに残す */}
                {auth.session && auth.client && !blocked && (
                  <button type="button" className={css.primary} disabled={guardBusy} onClick={async () => {
                    setGuardBusy(true); setOpenError(null);
                    try {
                      const name = doc.name || viewOf(project, 0).title || t('draft.untitled');
                      await saveChart(auth.client!, doc.library ? null : doc.id, project, doc.id && !doc.library ? null : name);
                      dropDraft(doc);
                      run(pending);
                    } catch (e) {
                      setOpenError(t('save.error', { message: (e as Error).message ?? String(e) }));
                    } finally { setGuardBusy(false); }
                  }}>{t('guard.saveAndGo')}</button>
                )}
                <button type="button" className={auth.session && !blocked ? 'btn' : css.primary} disabled={guardBusy} onClick={async () => {
                  setGuardBusy(true); setOpenError(null);
                  try { await keepDraft(); run(pending); }
                  catch (e) { setOpenError(t('draft.saveError', { message: (e as Error).message ?? String(e) })); }
                  finally { setGuardBusy(false); }
                }}>{t('guard.draftAndGo')}</button>
                <button type="button" className="btn" disabled={guardBusy} onClick={() => run(pending)}>{t('guard.discardAndGo')}</button>
                <button type="button" className="btn" disabled={guardBusy} onClick={() => setPending(null)}>{t('guard.stay')}</button>
              </div>
              <p className={css.guardNote}>{t(drafts.remote ? 'guard.draftNote' : 'guard.draftNoteLocal')}</p>
            </div>
          )}
          {openError && <p className={css.error} role="alert">{openError}</p>}
          <div className={css.slideHead}>
            <span className={css.slideHeadLeft}>
              <h2>{t('preview.slideN', { n: project.current + 1, total: project.slides.length })}</h2>
            </span>
            <span className={css.slideHeadRight}>
              <div className={css.undoBar} role="group" aria-label={t('history.label')}>
                <button type="button" className="btn" disabled={!hist.past.length} onClick={doUndo} title={t('history.undoKey')}>{t('history.undo')}</button>
                <button type="button" className="btn" disabled={!hist.future.length} onClick={doRedo} title={t('history.redoKey')}>{t('history.redo')}</button>
              </div>
              {/* 1001〜1100px：右の設定は引き出し。ボタンで開け閉めする */}
              <button type="button" className={`btn ${css.drawerToggle}`} aria-expanded={drawerOpen} aria-controls="settings-pane" onClick={() => setDrawerOpen((o) => !o)}>
                {t('pane.settings')}
              </button>
            </span>
          </div>
          <MeaningPanel issues={meaning} state={state} setState={setState} onConvert={convertTo}
            overridden={!!currentSig && overrides[slide.id] === currentSig}
            onOverride={() => setOverrides((o) => ({ ...o, [slide.id]: currentSig }))} />
          {convertError && <p className={css.error} role="alert">{convertError}</p>}
          {blocked && blockedSlides.some((b) => b.n - 1 !== project.current) && (
            <div className={css.blockedNote} role="status">
              <p className={css.blockedLead}>{t('meaning.blockedOther')}</p>
              <ul className={css.blockedList}>
                {blockedSlides.filter((b) => b.n - 1 !== project.current).map((b) => (
                  <li key={b.id}>
                    <span className={css.blockedText}>{t('meaning.blockedItem', { n: b.n, text: b.issue ? t(`meaning.short.${b.issue.code}` as MessageKey, (b.issue.vars ?? {}) as Record<string, string | number>) : '' })}</span>
                    <span className={css.blockedBtns}>
                      <button type="button" className="btn" onClick={() => {
                        setProject((p) => selectSlide(p, b.n - 1));
                        // 特定の列・行の注意なら、データの表のその場所へ（印は表の側で付く）
                        if (b.issue?.targets?.length) {
                          setNarrowTab('data');
                          setTimeout(() => document.querySelector('[data-marked="1"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }), 150);
                        }
                      }}>{t('meaning.blockedFix')}</button>
                      <button type="button" className="btn" onClick={() => setOverrides((o) => ({ ...o, [b.id]: b.sig }))}>{t('meaning.blockedKeep')}</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {advice.length > 0 && (
            <ul className={css.fitList}>
              {advice.map((a) => (
                <li key={a.code}>
                  <span>{t(`fit.${a.code}` as MessageKey, a.vars)}</span>
                  {a.suggest && <button type="button" className="btn" onClick={() => convertTo(a.suggest!)}>{t('fit.switch', { chart: chartName(a.suggest, (x) => localize(x, locale)) })}</button>}
                </li>
              ))}
            </ul>
          )}
          {suggestions.length > 0 && (
            <ul className={css.suggestList}>
              {suggestions.map((a) => (
                <li key={a.code}>
                  <span>{t(`suggest.${a.code}` as MessageKey)}</span>
                  <button type="button" className="btn" onClick={() => convertTo(a.suggest)}>{t('fit.switch', { chart: chartName(a.suggest, (x) => localize(x, locale)) })}</button>
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
              {sampleShown && svg && !noData && <span className={css.sampleBadge}>{t('story.sampleBadge')}</span>}
              {svg && !noData ? (
                <>
                  <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
                  {inlineEdit?.kind === 'message' ? (
                    <textarea autoFocus className={`${css.slideInlineEdit} ${css.inlineMessage}`} aria-label={t('editor.inline.message')} value={inlineEdit.value}
                      onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                      onBlur={(e) => { if (e.currentTarget.dataset.cancel !== '1') commitInlineEdit(); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.dataset.cancel = '1'; setInlineEdit(null); e.currentTarget.blur(); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitInlineEdit(); } }} />
                  ) : messageShown && <button type="button" className={`${css.slideHotspot} ${css.hotspotMessage}`} aria-label={t('editor.hotspot.message')} onClick={() => beginInlineEdit('message')} />}
                  {inlineEdit?.kind === 'chartTitle' ? (
                    <input autoFocus className={`${css.slideInlineEdit} ${css.inlineChartTitle}`} aria-label={t('editor.inline.chartTitle')} value={inlineEdit.value}
                      onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                      onBlur={(e) => { if (e.currentTarget.dataset.cancel !== '1') commitInlineEdit(); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.dataset.cancel = '1'; setInlineEdit(null); e.currentTarget.blur(); } else if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); } }} />
                  ) : chartTitleShown ? (
                    <button type="button" className={`${css.slideHotspot} ${css.hotspotChartTitle}`} aria-label={t('editor.hotspot.chartTitle')} onClick={() => beginInlineEdit('chartTitle')} />
                  ) : chartHeadShown && (
                    // チャートタイトルは出さず、期間・単位だけ出している時：その場で書き換えず、右の「内容」へ案内する
                    <button type="button" className={`${css.slideHotspot} ${css.hotspotChartTitle}`} aria-label={t('editor.hotspot.chartHead')} onClick={() => focusInspector('slide', 'content', 'slide')} />
                  )}
                  {!state.view && <button type="button" className={`${css.slideHotspot} ${css.hotspotChart}`} style={{ top: `${chartHotspotTop}%` }} aria-label={t('editor.hotspot.chart')} onClick={() => focusInspector('chart', 'style')} />}
                  {inlineEdit?.kind === 'source' ? (
                    <input autoFocus className={`${css.slideInlineEdit} ${css.inlineSource}`} aria-label={t('editor.inline.source')} value={inlineEdit.value}
                      onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                      onBlur={(e) => { if (e.currentTarget.dataset.cancel !== '1') commitInlineEdit(); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.dataset.cancel = '1'; setInlineEdit(null); e.currentTarget.blur(); } else if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); } }} />
                  ) : sourceShown && <button type="button" className={`${css.slideHotspot} ${css.hotspotSource}`} aria-label={t('editor.hotspot.source')} onClick={() => beginInlineEdit('source')} />}
                </>
              ) : (
                <div className={css.empty}>{result.error ? t('preview.error', { message: result.error }) : t('preview.empty')}</div>
              )}
            </div>
          </div>
          </ErrorBoundary>
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
            <button type="button" aria-pressed={slideFullscreen} onClick={() => setSlideFullscreen(true)}>{t('pane.slideFull')}</button>
          </div>
        </div>

        <section className={`${css.dataPane} ${narrowTab === 'data' ? '' : css.narrowHidden}`} aria-label={t('section.data')}>
          <ErrorBoundary message={t('error.panel')} retryLabel={t('error.retry')} undoLabel={t('history.undo')} onUndo={hist.past.length ? doUndo : undefined} resetKey={project}>
          <div className={css.dataTabs} role="tablist">
            <button type="button" role="tab" aria-selected={dataDetailTab === 'data'} onClick={() => setDataDetailTab('data')}>{t('dataMeta.data')}</button>
            <button type="button" role="tab" aria-selected={dataDetailTab === 'meta'} onClick={() => setDataDetailTab('meta')}>{t('dataMeta.meta')}</button>
          </div>
          {dataDetailTab === 'meta' ? <SourceMetadataFields state={state} update={update} /> : <>
          {state.view ? (
            <>
              <h2>{t(STORY_TEMPLATES[state.view].kind === 'table' ? 'tpl.section.table' : 'tpl.section.text')}</h2>
              <TemplateEditor state={state} update={update} refLabel={(id) => liveStory?.slides.find((q) => q.id === id)?.question} relatedRoles={relatedRoles}
                />
            </>
          ) : <>
          <DataHead title={!storyDoc && sharedCount(project) > 1 ? t('section.dataSharedN', { n: sharedCount(project) }) : t('section.data')}
            needs={needsText(t, slide.recipe ? registry.recipes[slide.recipe] : null, registry.purposes[purposeOf(state)].schema, state.chart)}
            isSample={isSampleData(state)} />
          {storyDoc && <DataScope project={project} setProject={setProject} share={storyShare} sample={isSampleData(state)} />}
          <DataGrid
            state={state} onChange={setState}
            marked={meaning.filter((x) => x.level === 'error').flatMap((x) => x.targets ?? [])}
            showBase={projectUsesBase(project)}
            wantsTimeRows={familyOf(state.chart) === 'table' && expectsTimeRows(project)}
            onTranspose={() => setProject((p) => transposeProject(p))}
          />
          </>}
          </>}
          </ErrorBoundary>
        </section>
      </main>

      {/* 右：編集操作（保存・チャート・設定・補完・見出し・出典・言語・出力） */}
      {drawerOpen && <div className={css.drawerShade} onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <aside id="settings-pane" className={`${css.sidebarPane} ${css.sidebarSplit} ${css.drawer} ${drawerOpen ? css.drawerOpen : ''}`} aria-label={t('editor.settingsLabel')}>
        <div className={css.drawerHead}>
          <span>{t('pane.settings')}</span>
          <button type="button" className={css.iconBtn} aria-label={t('pane.settingsClose')} title={t('pane.settingsClose')} onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        {/* 上：設定（ここだけスクロール）。下：出力の欄（スクロールの外。設定に重ならない） */}
        <div className={css.sidebarScroll} ref={sidebarScrollRef}>
        <div className={css.inspectorHead}>
          <div className={css.inspectorTitleRow}>
            <h2>{t('editor.edit')}</h2>
            <label className={css.compactToggle}>
              <input type="checkbox" checked={compactMenus} onChange={(e) => changeCompactMenus(e.target.checked)} />
              <span>{t('editor.panelDensity.compact')}</span>
            </label>
          </div>
          <div className={css.inspectorTabs} role="tablist">
            {(['content', 'style'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} onClick={() => { setInspectorTab(tab); scrollInspector(); }}>{t(`editor.tab.${tab}`)}</button>)}
          </div>
        </div>
        {storyDoc ? (
          // ストーリーは自動で保存（失敗した時だけ左に警告）。ここは名前の変更だけ
          <StoryNamePanel id={storyDoc.id} name={storyDoc.name} fallback={storyDisplayTitle(storyDoc.story) || t('story.untitled')}
            onRenamed={(name) => setStoryDoc((d) => (d ? { ...d, name } : d))} />
        ) : <SavePanel
          state={project}
          setProject={setProject}
          doc={doc}
          onSaved={(d, how) => {
            // チャートとして保存できたら、下書きは消す（名前を変えただけ・見本の更新は除く）
            if (how === 'saved') { dropDraft(doc); setDoc({ ...d, draftId: null, draftSnapshot: null }); }
            else setDoc(d);
          }}
          onKeepDraft={keepDraft}
          onNew={() => (hasUnsavedChanges(project, doc) ? setPending({ kind: 'new' }) : startNew())}
          blocked={blocked}
          onDiscard={async () => {
            // 下書きから開いていれば下書きに残した状態へ、保存済みなら最後に保存した状態へ、
            // どちらでもなければ新しい見本へ（元に戻すでも戻せる）
            const back = doc.draftSnapshot ?? doc.snapshot;
            const k = doc.draftSnapshot ? 'revertDraft' : 'revert';
            if (!(await confirm(back
              ? { title: t(`discard.${k}Title`), body: t(`discard.${k}Body`), ok: t('discard.revertOk'), danger: true }
              : { title: t('discard.title'), body: t('discard.body'), ok: t('discard.ok'), danger: true }))) return;
            if (back) { try { loadProject(JSON.parse(back)); } catch { /* 読めなければ何もしない */ } }
            else startNew();
          }}
        />}
        {inspectorTab === 'content' && <ChartPicker state={state} onPick={(chart) => {
          // 表・言葉からグラフへ：前のグラフの設定に戻す（同じチャートなら、そのまま）。中身は残す
          if (state.view && chart === state.chart) { setState((s) => ({ ...s, view: undefined })); return; }
          // 必ず切り替える（確認で止めない）。2指標スロープの右の指標を外した時は、その下に「外しました・元に戻す」を出す
          const r = switchChart({ ...state, view: undefined }, chart);
          setState(() => ({ ...r.state, view: undefined }));
          setPairNote(r.removedPair);
        }} onTemplate={async (id) => {
          // 表 ↔ KPI ↔ 増減付き表は、中身をどうするか選んでもらう（比較表・ヒートマップ・基本表の間や、言葉の型は聞かない）
          const opts = switchOptions(state, id);
          if (!opts) { setState((s) => ({ ...s, ...ensureTemplate(s, id, isSampleData(s)) })); return; }
          const L = (x: { en: string; ja?: string }) => localize(x, locale);
          const vars = { from: state.view ? L(STORY_TEMPLATES[state.view].label) : '', to: L(STORY_TEMPLATES[id].label) };
          const v = await choose({
            title: t('tpl.switch.title', vars), body: t('tpl.switch.body'),
            choices: opts.map((o) => ({ value: o, label: t(`tpl.switch.${o}`, vars), note: t(`tpl.switch.${o}Note`, vars) })),
          });
          if (!v) return;
          setState((s) => ({ ...s, ...applySwitch(s, id, v as SwitchChoice) }));
        }} />}
        {state.view ? (
          <>
            <TemplateLookPanel state={state} update={update} />
            {/* スライドの定型文言の言語：1項目だけなので開け閉めの欄にしない（見出しは項目名そのもの） */}
            <div className={css.viewBox}><LocaleField state={state} update={update} /></div>
          </>
        ) : <>
        {pairNote && !isTwoMetricChart(state.chart) && (
          <p className={css.pairNote} role="status">
            {t('pair.removed', { name: pairNote })}{' '}
            <button type="button" className={css.linkBtn} onClick={() => { doUndo(); setPairNote(null); }}>{t('history.undo')}</button>
          </p>
        )}
        <ErrorBoundary message={t('error.panel')} retryLabel={t('error.retry')} undoLabel={t('history.undo')} onUndo={hist.past.length ? doUndo : undefined} resetKey={project}>
          <Settings state={state} update={update} recipe={recipe} showBase={projectUsesBase(project)} mode={inspectorTab} compactMenus={compactMenus} />
        </ErrorBoundary>
        <button type="button" className="btn" onClick={async () => {
          if (await confirm({ title: t('confirm.resetTitle'), body: t('confirm.resetBody'), ok: t('confirm.reset'), danger: true })) setState((s) => ({ ...initialState(s.slideLocale), ...sampleFor(purposeOf(s), s.slideLocale), slideLocale: s.slideLocale, chart: s.chart }));
        }}>{t('action.reset')}</button>
        </>}
        </div>
        {/* 出力：右下に主要ボタンだけ。設定（Executive Summary の位置・元データのスライド）は押した時の確認でまとめて聞く */}
        <div className={css.outputBar}>
          {/* メールで送る・PPT の出力は、ヘッダーの「出力」から */}
          {project.slides.length > 1 && <span className={css.outputN}>{t('out.n', { n: readyCount })}</span>}
          {sender.pending && <button type="button" className={css.primary} onClick={async () => { const r = await sender.retry(); if (r) setPptStatus({ busy: false, note: sendNote(r, t) }); }}>{t('share.retry')}</button>}
          {pptStatus.error && <p className={css.error} role="alert">{pptStatus.plain ? pptStatus.error : t('status.pptError', { message: pptStatus.error })}</p>}
          {pptStatus.note && !pptStatus.error && <p className={css.note}>{pptStatus.note}</p>}
        </div>
      </aside>
    </div>
    {slideFullscreen && svg && !noData && (
      <div className={css.slideFullscreen} role="dialog" aria-modal="true" aria-label={t('pane.slideFull')}>
        <button type="button" className={css.fullscreenClose} aria-label={t('pane.slideFullClose')} title={t('pane.slideFullClose')} onClick={() => setSlideFullscreen(false)}>×</button>
        <div className={css.fullscreenStage}>
          <div className={css.slide} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
    )}
    </>
  );
}
