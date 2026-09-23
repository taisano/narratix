'use client';

import { localize, registry, LOCALES, type Locale } from '@/registry';
import { useLocale, useT } from '@/i18n/ui';
import type { MekkoLabelMode } from '@/engine/layout/charts/mekko';
import type { BuilderState } from './state';
import css from '../ui.module.css';

type Props = { state: BuilderState; update: (patch: Partial<BuilderState>) => void };

export function Settings({ state: s, update }: Props) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const C = registry.controls;
  const P = registry.complements;
  const d = s.dataset;
  const setData = (patch: Partial<BuilderState['dataset']>) => update({ dataset: { ...d, ...patch } });
  const setPeriodLabel = (k: 'current' | 'base', label: string) =>
    setData({ periods: { ...d.periods, [k]: { ...d.periods[k], label } } });
  const growthKeys = ['market', ...d.cols.map((c) => `series:${c}`)];
  // 表の行は、選んだ順ではなく「市場全体 → 列の順」に並べる
  const toggleGrowthRow = (key: string, on: boolean) =>
    update({ growthRows: growthKeys.filter((k) => (k === key ? on : s.growthRows.includes(k))) });

  return (
    <>
      <section className={css.card}>
        <h2>{t('section.slide')}</h2>
        <label className={css.field}>
          <span>{L(C.title.label)}</span>
          <textarea className={css.textarea} value={s.title} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label className={css.field}>
          <span>{L(C.source.label)}</span>
          <input className={css.input} value={s.source} onChange={(e) => update({ source: e.target.value })} />
        </label>
        <div className={css.field}>
          <span>{t('field.slideLocale')}</span>
          <div className={css.seg} role="group" aria-label={t('field.slideLocale')}>
            {LOCALES.map((l: Locale) => (
              <button key={l} type="button" aria-pressed={s.slideLocale === l} onClick={() => update({ slideLocale: l })}>{t(`locale.${l}`)}</button>
            ))}
          </div>
        </div>
      </section>

      <section className={css.card}>
        <h2>{t('section.data')}</h2>
        <div className={css.row2}>
          <label className={css.field}>
            <span>{t('field.baseLabel')}</span>
            <input className={css.input} value={d.periods.base.label} onChange={(e) => setPeriodLabel('base', e.target.value)} />
          </label>
          <label className={css.field}>
            <span>{t('field.currentLabel')}</span>
            <input className={css.input} value={d.periods.current.label} onChange={(e) => setPeriodLabel('current', e.target.value)} />
          </label>
        </div>
        <label className={css.field}>
          <span>{L(C.unit.label)}</span>
          <input className={css.input} value={d.unit ?? ''} onChange={(e) => setData({ unit: e.target.value })} />
        </label>
        <div className={css.row2}>
          <label className={css.field}>
            <span>{t('field.rowsLabel')}</span>
            <input className={css.input} value={d.dimensions?.rows ?? ''} onChange={(e) => setData({ dimensions: { ...d.dimensions, rows: e.target.value } })} />
          </label>
          <label className={css.field}>
            <span>{t('field.colsLabel')}</span>
            <input className={css.input} value={d.dimensions?.cols ?? ''} onChange={(e) => setData({ dimensions: { ...d.dimensions, cols: e.target.value } })} />
          </label>
        </div>
      </section>

      <section className={css.card}>
        <h2>{t('section.view')}</h2>
        <label className={css.field}>
          <span>{L(C.mekko_labels.label)}</span>
          <select className={css.select} value={s.labels} onChange={(e) => update({ labels: e.target.value as MekkoLabelMode })}>
            {C.mekko_labels.options!.map((o) => <option key={o.value} value={o.value}>{L(o.label)}</option>)}
          </select>
        </label>
        <label className={css.field}>
          <span>{L(C.highlight.label)}</span>
          <select className={css.select} value={s.highlight ?? ''} onChange={(e) => update({ highlight: e.target.value || null })}>
            <option value="">{t('field.highlightNone')}</option>
            {d.cols.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={css.check}>
          <input type="checkbox" checked={s.sortBySize} onChange={(e) => update({ sortBySize: e.target.checked })} />
          {L(C.sort_by_size.label)}
        </label>
      </section>

      <section className={css.card}>
        <h2>{t('section.complements')}</h2>
        <label className={css.check}>
          <input type="checkbox" checked={s.showTotal} onChange={(e) => update({ showTotal: e.target.checked })} />
          {t('field.showTotal')}
        </label>
        <label className={css.check}>
          <input type="checkbox" checked={s.deltaLabels} onChange={(e) => update({ deltaLabels: e.target.checked })} />
          {L(P.delta_labels.label)}
        </label>
        <label className={css.check}>
          <input type="checkbox" checked={s.alignedTable} onChange={(e) => update({ alignedTable: e.target.checked })} />
          {L(P.aligned_table.label)}
        </label>
        {s.alignedTable && (
          <div className={css.sub}>
            <div className={css.field}>
              <span>{t('field.growthMode')}</span>
              <div className={css.seg} role="group" aria-label={t('field.growthMode')}>
                {(['cagr', 'period'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={s.growthMode === m} onClick={() => update({ growthMode: m })}>{t(`field.growthMode.${m}`)}</button>
                ))}
              </div>
            </div>
            <div className={css.field}>
              <span>{t('field.growthRows')}</span>
              <div className={css.chips}>
                {growthKeys.map((k) => (
                  <label key={k} className={css.check}>
                    <input type="checkbox" checked={s.growthRows.includes(k)} onChange={(e) => toggleGrowthRow(k, e.target.checked)} />
                    {k === 'market' ? t('field.market') : k.slice(7)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
