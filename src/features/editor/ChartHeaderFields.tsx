'use client';

import { useT } from '@/i18n/ui';
import { useState } from 'react';
import { CHARTS_WITH_NOTE, autoChartTitle, autoPeriod, type ChartHeader } from './chartHeader';
import type { BuilderState } from './state';
import css from '../ui.module.css';

const MAX_TITLE = 80;

/**
 * 「スライド」欄のチャートタイトル・期間・単位。
 * 空欄のままなら自動（データやチャートを替えると追従）。書き換えたら、その文字を保存する。「初期値に戻す」で自動に戻る。
 * 古いスライド（chartHeader が無い）はオフの状態から始める（開いただけでは見た目を変えない）
 */
export function ChartHeaderFields({ state: s, update }: { state: BuilderState; update: (patch: Partial<BuilderState>) => void }) {
  const t = useT();
  const [info, setInfo] = useState(false);
  const h: ChartHeader = s.chartHeader ?? { show: false, showPeriod: false, showUnit: false };
  const set = (patch: Partial<ChartHeader>) => update({ chartHeader: { ...h, ...patch } });
  const autoTitle = autoChartTitle(s);
  const autoP = autoPeriod(s);
  const title = h.title ?? autoTitle;
  const period = h.period ?? autoP;
  const showPeriod = h.showPeriod !== false;
  const showUnit = h.showUnit !== false;
  const unit = s.dataset.unit ?? '';
  return (
    <div className={css.chartHead}>
      <div className={css.field}>
        <span className={css.headRow}>
          <label className={css.inlineCheck}>
            <input type="checkbox" checked={h.show} onChange={(e) => set({ show: e.target.checked })} />
            {t('field.chartTitle')}
          </label>
          <button type="button" className={css.infoBtn} aria-label={t('field.chartTitleInfo')} aria-expanded={info}
            aria-controls="chart-title-info" onClick={() => setInfo((v) => !v)}>i</button>
          <span className={css.headSpacer} />
          {h.show && h.title !== undefined && h.title !== autoTitle && autoTitle && (
            <button type="button" className={css.linkBtn} onClick={() => set({ title: undefined })}>{t('field.chartTitleReset')}</button>
          )}
        </span>
        {h.show && (
          <input className={css.input} value={title} maxLength={MAX_TITLE} placeholder={t('field.chartTitlePlaceholder')}
            aria-label={t('field.chartTitle')} onChange={(e) => set({ title: e.target.value === autoTitle ? undefined : e.target.value })} />
        )}
        {info && <p id="chart-title-info" className={css.infoText}>{t('field.chartTitleHint')}</p>}
        {h.show && CHARTS_WITH_NOTE.includes(s.chart) && (
          <label className={css.inlineCheck}>
            <input type="checkbox" checked={!!h.showNote} onChange={(e) => set({ showNote: e.target.checked })} />
            {t('field.chartNote')}
          </label>
        )}
      </div>
      <div className={css.row2}>
        <div className={css.field}>
          <label className={css.inlineCheck}>
            <input type="checkbox" checked={!!s.chartHeader && showPeriod} onChange={(e) => set({ showPeriod: e.target.checked })} />
            {t('field.chartPeriod')}
          </label>
          {!!s.chartHeader && showPeriod && (
            <input className={css.input} value={period} placeholder={t('field.chartPeriodPlaceholder')} aria-label={t('field.chartPeriod')}
              onChange={(e) => set({ period: e.target.value === autoP ? undefined : e.target.value })} />
          )}
        </div>
        <div className={css.field}>
          <label className={css.inlineCheck}>
            <input type="checkbox" checked={!!s.chartHeader && showUnit} onChange={(e) => set({ showUnit: e.target.checked })} />
            {t('field.unit')}
          </label>
          {!!s.chartHeader && showUnit && (
            <input className={css.input} value={unit} aria-label={t('field.unit')}
              onChange={(e) => update({ dataset: { ...s.dataset, unit: e.target.value } })} />
          )}
        </div>
      </div>
    </div>
  );
}
