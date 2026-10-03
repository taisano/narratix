'use client';

import { useEffect, useRef, useState } from 'react';
import { STORY_TEMPLATES, STORY_TEMPLATE_IDS, chartsForPurpose, localize, PURPOSE_IDS, registry, type ChartTypeId, type PurposeId, type StoryTemplateId } from '@/registry';
import { IMPLEMENTED_CHARTS } from '@/engine';
import { useLocale, useT } from '@/i18n/ui';
import type { BuilderState } from './state';
import { ChartGlyph } from './ChartGlyph';
import css from '../ui.module.css';

const implemented = (id: ChartTypeId) => IMPLEMENTED_CHARTS.includes(id);

/** 「Trend（推移）」→「推移」。英語はそのまま */
const shortPurpose = (label: string) => /（(.+)）/.exec(label)?.[1] ?? label;

/**
 * 「見せ方を選ぶ」：上のタブで［グラフ］と［表・言葉］を切り替え、選んだ方の分類と型（Variation）だけを出す
 * （グラフの候補で長くなり、表・言葉が見えなくならないように）。
 * グラフ：目的 → チャート。表・言葉：表で整理／言葉でまとめる → その型（比較表・結論＋3つの根拠 など）。
 * 描画が未実装のチャートは「準備中」で選べない。
 * 「見せ方を変更」の欄：今の見せ方（〇〇（今））と、いつも見える［グラフ］［表・言葉］。種類の一覧は押した方だけ開く
 * （小さな「変更」の中に隠すと見つけにくかった。一覧を全部出すとサイドバーが長くなる）。
 * 選んでも一覧は開いたまま（名前だけで分からない時に、続けて別のものを試せる）。欄の外を押す・もう一度押す・閉じる・Esc で閉じる。
 * ボタンには形の線画を付ける（ChartGlyph）
 */
export function ChartPicker({ state, onPick, onTemplate }: {
  state: BuilderState; onPick: (chart: ChartTypeId) => void;
  /** 表・言葉の型を選ぶ（無ければタブを出さない） */
  onTemplate?: (id: StoryTemplateId) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const chartPurpose = registry.charts[state.chart].purpose;
  const [purpose, setPurpose] = useState<PurposeId>(chartPurpose);
  // 保存したチャートを開いた時などは、選んでいるチャートの目的に合わせる
  useEffect(() => { setPurpose(chartPurpose); }, [chartPurpose]);
  // ［グラフ］［表・言葉］はいつも見せ、種類の一覧は押した方だけ開く（もう一度押すと閉じる）。選んでも閉じない
  const [tab, setTab] = useState<'graph' | 'tableText' | null>(null);
  const [info, setInfo] = useState(false);
  const box = useRef<HTMLElement>(null);
  // 欄の外を押した時（下の設定を触り始めた時など）と Esc で閉じる
  useEffect(() => {
    if (!tab) return;
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setTab(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTab(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [tab]);
  const charts = chartsForPurpose(purpose);

  // 目的のタブは、下に出すチャートの候補を替えるだけ（チャートはボタンを押すまで替えない。データや見本も変わらない）
  const pickPurpose = (p: PurposeId) => setPurpose(p);
  // 使えるチャートが1つもない目的（評価など）は選べない
  const available = (p: PurposeId) => chartsForPurpose(p).some((c) => implemented(c.id));
  const current = state.view ? L(STORY_TEMPLATES[state.view].label) : L(registry.charts[state.chart].label);

  const tabs = onTemplate ? (['graph', 'tableText'] as const) : (['graph'] as const);
  const nowTab = state.view ? 'tableText' : 'graph';
  return (
    <section ref={box} className={css.viewBox} aria-labelledby="view-change-title">
      <h2 id="view-change-title" className={css.viewBoxTitle}>
        {t('view.changeTitle')}
        <span className={css.viewTag}>{t('view.currentTag', { name: current })}</span>
        <button type="button" className={css.infoBtn} aria-label={t('view.infoLabel')} aria-expanded={info} onClick={() => setInfo((v) => !v)}>i</button>
      </h2>
      {info && <p className={css.note}>{t('view.info')}</p>}
      <div className={css.viewToggles}>
        {tabs.map((k) => (
          <button key={k} type="button" aria-expanded={tab === k} aria-controls={`view-list-${k}`} data-now={nowTab === k} onClick={() => setTab(tab === k ? null : k)}>
            {t(`view.tab.${k}`)}<span aria-hidden="true" className={css.viewChevron} />
          </button>
        ))}
      </div>
      {tab === 'graph' && (
        <div id="view-list-graph">
          <div className={css.purposeGrid} role="tablist" aria-label={t('section.chart')}>
            {PURPOSE_IDS.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={!state.view && purpose === p} className={css.purposeBtn} disabled={!available(p)} title={available(p) ? undefined : t('chart.soon')} onClick={() => pickPurpose(p)}>
                {shortPurpose(L(registry.purposes[p].label))}
              </button>
            ))}
          </div>
          <p className={css.note}>{L(registry.purposes[purpose].question)}</p>
          <div className={css.chartGrid}>
            {charts.map((c) => {
              const ok = implemented(c.id);
              return (
                <button key={c.id} type="button" className={css.chartBtn} aria-pressed={!state.view && state.chart === c.id} disabled={!ok} onClick={() => onPick(c.id)}>
                  <span className={css.chartBtnRow}><ChartGlyph chart={c.id} className={css.glyph} /><span>{L(c.label)}</span></span>
                  {!ok && <small>{t('chart.soon')}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {onTemplate && tab === 'tableText' && <div id="view-list-tableText">{(['table', 'text'] as const).map((k) => (
        <div key={k}>
          <p className={css.pickGroup}>{t(`view.kind.${k}`)}</p>
          <div className={css.chartGrid}>
            {STORY_TEMPLATE_IDS.filter((id) => STORY_TEMPLATES[id].kind === k).map((id) => (
              <button key={id} type="button" className={css.chartBtn} aria-pressed={state.view === id} title={L(STORY_TEMPLATES[id].purpose)} onClick={() => onTemplate(id)}>
                <span className={css.chartBtnRow}><ChartGlyph template={id} className={css.glyph} /><span>{L(STORY_TEMPLATES[id].label)}</span></span>
              </button>
            ))}
          </div>
        </div>
      ))}</div>}
      {tab && <button type="button" className={css.viewClose} onClick={() => setTab(null)}>{t('view.close')}</button>}
    </section>
  );
}
