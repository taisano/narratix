'use client';

import { useEffect, useState } from 'react';
import { chartsForPurpose, localize, PURPOSE_IDS, registry, type ChartTypeId, type PurposeId } from '@/registry';
import { IMPLEMENTED_CHARTS } from '@/engine';
import { useLocale, useT } from '@/i18n/ui';
import type { BuilderState } from './state';
import css from '../ui.module.css';

const implemented = (id: ChartTypeId) => IMPLEMENTED_CHARTS.includes(id);

/** 「Trend（推移）」→「推移」。英語はそのまま */
const shortPurpose = (label: string) => /（(.+)）/.exec(label)?.[1] ?? label;

/** 目的 → チャートの順に選ぶ。描画が未実装のチャートは「準備中」で選べない */
export function ChartPicker({ state, onPick }: { state: BuilderState; onPick: (chart: ChartTypeId) => void }) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const chartPurpose = registry.charts[state.chart].purpose;
  const [purpose, setPurpose] = useState<PurposeId>(chartPurpose);
  // 保存したチャートを開いた時などは、選んでいるチャートの目的に合わせる
  useEffect(() => { setPurpose(chartPurpose); }, [chartPurpose]);
  const charts = chartsForPurpose(purpose);

  function pickPurpose(p: PurposeId) {
    setPurpose(p);
    const first = chartsForPurpose(p).find((c) => implemented(c.id));
    if (first && registry.charts[state.chart].purpose !== p) onPick(first.id);
  }

  return (
    <section className={css.card}>
      <h2>{t('section.chart')}</h2>
      <div className={css.purposeGrid} role="tablist" aria-label={t('section.chart')}>
        {PURPOSE_IDS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={purpose === p} className={css.purposeBtn} onClick={() => pickPurpose(p)}>
            {shortPurpose(L(registry.purposes[p].label))}
          </button>
        ))}
      </div>
      <p className={css.note}>{L(registry.purposes[purpose].question)}</p>
      <div className={css.chartGrid}>
        {charts.map((c) => {
          const ok = implemented(c.id);
          return (
            <button key={c.id} type="button" className={css.chartBtn} aria-pressed={state.chart === c.id} disabled={!ok} onClick={() => onPick(c.id)}>
              <span>{L(c.label)}</span>
              {!ok && <small>{t('chart.soon')}</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
