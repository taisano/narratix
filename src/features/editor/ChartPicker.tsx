'use client';

import { useEffect, useState } from 'react';
import { STORY_TEMPLATES, TEMPLATE_OF_KIND, chartsForPurpose, localize, PURPOSE_IDS, registry, type ChartTypeId, type PurposeId, type StoryTemplateKind } from '@/registry';
import { IMPLEMENTED_CHARTS } from '@/engine';
import { useLocale, useT } from '@/i18n/ui';
import type { BuilderState } from './state';
import css from '../ui.module.css';
import { Fold } from './Fold';

const implemented = (id: ChartTypeId) => IMPLEMENTED_CHARTS.includes(id);

/** 「Trend（推移）」→「推移」。英語はそのまま */
const shortPurpose = (label: string) => /（(.+)）/.exec(label)?.[1] ?? label;

/**
 * 「見せ方を選ぶ」：グラフで伝える（目的 → チャート）／表・言葉で伝える（表で整理・言葉でまとめる）。
 * 描画が未実装のチャートは「準備中」で選べない。
 * 初めは閉じて「今の見せ方：〇〇　変更」の1行だけ。選んだら閉じ、下にその見せ方の設定が出る（サイドバーを長くしない）
 */
export function ChartPicker({ state, onPick, onTemplate }: {
  state: BuilderState; onPick: (chart: ChartTypeId) => void;
  /** 表・言葉の型を選ぶ（無ければ出さない） */
  onTemplate?: (kind: StoryTemplateKind) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const chartPurpose = registry.charts[state.chart].purpose;
  const [purpose, setPurpose] = useState<PurposeId>(chartPurpose);
  // 保存したチャートを開いた時などは、選んでいるチャートの目的に合わせる
  useEffect(() => { setPurpose(chartPurpose); }, [chartPurpose]);
  const charts = chartsForPurpose(purpose);

  // 目的のタブは、下に出すチャートの候補を替えるだけ（チャートはボタンを押すまで替えない。データや見本も変わらない）
  const pickPurpose = (p: PurposeId) => setPurpose(p);
  // 使えるチャートが1つもない目的（評価など）は選べない
  const available = (p: PurposeId) => chartsForPurpose(p).some((c) => implemented(c.id));

  return (
    <Fold id="chartPick" defaultOpen={false} closeSignal={`${state.view ?? ''}:${state.chart}`} title={<>
      {t('view.current', { name: state.view ? L(STORY_TEMPLATES[state.view].label) : L(registry.charts[state.chart].label) })}
      <span className={css.foldHint}>{t('chart.change')}</span>
    </>}>
      <p className={css.pickGroup}>{t('view.graph')}</p>
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
              <span>{L(c.label)}</span>
              {!ok && <small>{t('chart.soon')}</small>}
            </button>
          );
        })}
      </div>
      {onTemplate && (
        <>
          <p className={css.pickGroup}>{t('view.tableText')}</p>
          <div className={css.chartGrid}>
            {(['table', 'text'] as const).map((k) => (
              <button key={k} type="button" className={css.chartBtn} aria-pressed={!!state.view && STORY_TEMPLATES[state.view].kind === k} onClick={() => onTemplate(k)}>
                <span>{t(`view.kind.${k}`)}</span>
                <small>{L(STORY_TEMPLATES[TEMPLATE_OF_KIND[k]].label)}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </Fold>
  );
}
