'use client';

import { useEffect, useMemo, useState } from 'react';
import { composeSlide, type Scene } from '@/engine';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { I18nProvider, translate, type MessageKey } from '@/i18n/ui';
import { LOCALES, type Locale } from '@/registry';
import { SLIDE_FONTS } from '@/i18n/slide';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import { buildPptx } from '@/export/pptx/scene-to-pptx';
import { useSession } from '@/lib/supabase/useSession';
import { AccountMenu } from './AccountMenu';
import { DataGrid } from './DataGrid';
import { EMPTY_DOC, SavePanel, type DocRef } from './SavePanel';
import { Settings } from './Settings';
import { initialState, isBuilderState, toDataset, validateState, type BuilderState } from './state';
import css from './builder.module.css';

const STORAGE_KEY = 'chart-advisor:mekko-builder:v1';
const UI_LOCALE_KEY = 'chart-advisor:ui-locale';
const DOC_KEY = 'chart-advisor:mekko-builder:doc';

type Result = { scene?: Scene; warnings: { key: MessageKey; vars?: Record<string, string | number> }[]; error?: string };

function evaluate(s: BuilderState): Result {
  const v = validateState(s);
  const warnings: Result['warnings'] = [];
  if (v.issues.some((i) => i.code === 'requires_base')) warnings.push({ key: 'warn.requires_base' });
  if (!v.ok) return { warnings, error: v.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / ') };
  try {
    const scene = composeSlide(v.spec, toDataset(s));
    for (const w of scene.warnings) warnings.push({ key: `warn.${w.code}` as MessageKey, vars: w.params });
    return { scene, warnings };
  } catch (e) {
    return { warnings, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function Builder() {
  const [state, setState] = useState<BuilderState>(initialState);
  const [uiLocale, setUiLocale] = useState<Locale>('ja');
  const [loaded, setLoaded] = useState(false);
  const [dataSlide, setDataSlide] = useState(true);
  const [doc, setDoc] = useState<DocRef>(EMPTY_DOC);
  const auth = useSession();
  const [pptStatus, setPptStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });

  // ブラウザ保存（ログイン・保存は Supabase で後から。ここは作業途中の控え）
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (isBuilderState(saved)) setState(saved);
      const l = localStorage.getItem(UI_LOCALE_KEY);
      if (l && (LOCALES as readonly string[]).includes(l)) setUiLocale(l as Locale);
      const d = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null') as DocRef | null;
      if (d && typeof d === 'object' && 'id' in d) setDoc(d);
    } catch { /* 保存がなくても動く */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(UI_LOCALE_KEY, uiLocale);
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    } catch { /* 保存できない環境では何もしない */ }
  }, [state, uiLocale, doc, loaded]);
  useEffect(() => { document.documentElement.lang = uiLocale; }, [uiLocale]);

  const result = useMemo(() => evaluate(state), [state]);
  const svg = useMemo(() => (result.scene ? sceneToSvg(result.scene, { title: state.title }) : null), [result.scene, state.title]);
  const update = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(uiLocale, key, vars);
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
      a.download = fileName(state.title);
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
    <I18nProvider locale={uiLocale}>
      <div className={css.page}>
        <header className={css.header}>
          <div className={css.brand}>
            <h1>{t('app.title')}</h1>
            <span>{t('app.subtitle')}</span>
          </div>
          <div className={css.headRight}>
          <div className={css.langSwitch}>
            <span>{t('app.uiLanguage')}</span>
            <div className={css.seg} role="group" aria-label={t('app.uiLanguage')}>
              {LOCALES.map((l) => (
                <button key={l} type="button" aria-pressed={uiLocale === l} onClick={() => setUiLocale(l)}>{t(`locale.${l}`)}</button>
              ))}
            </div>
          </div>
          <AccountMenu auth={auth} />
          </div>
        </header>

        <div className={css.layout}>
          <aside className={css.sidebar}>
            <SavePanel
              auth={auth}
              state={state}
              doc={doc}
              onLoaded={(s, d) => { setState(s); setDoc(d); }}
              onSaved={setDoc}
              onNew={() => { setState(initialState()); setDoc(EMPTY_DOC); }}
            />
            <Settings state={state} update={update} />
            <button type="button" className="btn" onClick={() => setState(initialState())}>{t('action.reset')}</button>
          </aside>

          <main className={css.main}>
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
      </div>
    </I18nProvider>
  );
}

/** タイトルからファイル名を作る（使えない文字を除き、長さを抑える） */
function fileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 40);
  return (base || 'chart-advisor') + '.pptx';
}
