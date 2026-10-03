'use client';

import { LOCALES, localize, registry, type Locale } from '@/registry';
import { useLocale, useT } from '@/i18n/ui';
import { isPlaceholderTitle, isSampleSource } from './leftovers';
import { switchSlideLocale } from './localeSwitch';
import { useTip } from './Tip';
import { sameTextBasis, userTextMeta } from '../data/text';
import { textBasisForDataset } from '../data/canonical';
import { isTwoMetricChart } from './state';
import type { BuilderState } from './state';
import css from '../ui.module.css';

type Up = (patch: Partial<BuilderState>) => void;

/**
 * メッセージタイトル。見本（仮）のままなら「C 見本のまま」。
 * 書いた後にデータを変えたら「C データが変わりました」（見出しの主張が今の数字と合っているか）。押すと直し方
 */
export function TitleField({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const locale = useLocale();
  const sampleTip = useTip('coach', t('leftover.titleHint'), t('coach.sample'));
  const staleTip = useTip('coach', t('title.staleText'), t('title.stale'));
  const sample = isPlaceholderTitle(s.title);
  const basis = textBasisForDataset(s.dataset, { twoMetric: isTwoMetricChart(s.chart) });
  const stale = !sample && !!s.titleMeta?.basis && !sameTextBasis(s.titleMeta.basis, basis);
  return (
    <div className={css.field}>
      <span className={css.labelRow}>{localize(registry.controls.title.label, locale)}{sample && sampleTip.button}{stale && staleTip.button}</span>
      <textarea className={css.textarea} aria-label={localize(registry.controls.title.label, locale)} value={s.title} onChange={(e) => update({ title: e.target.value, titleMeta: userTextMeta(basis, s.titleMeta) })} />
      {sample && sampleTip.panel(t('leftover.titleHint'))}
      {stale && staleTip.panel(<>{t('title.staleText')} <button type="button" className={css.linkBtn} onClick={() => update({ titleMeta: { ...s.titleMeta!, basis } })}>{t('title.staleOk')}</button></>)}
    </div>
  );
}

/**
 * 出典：チャートタイトルと同じく、チェックで出す・出さないを選べる（スライドごと）。
 * 見本のままなら「C 見本のまま」。押すと直し方と［出典を消す］
 */
export function SourceField({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const locale = useLocale();
  const tip = useTip('coach', t('leftover.sourceHint'), t('coach.sample'));
  const h = s.chartHeader ?? { show: false, showPeriod: false, showUnit: false };
  const on = h.showSource !== false;
  const sample = on && isSampleSource(s.source);
  const label = localize(registry.controls.source.label, locale);
  return (
    <div className={css.field}>
      <span className={css.labelRow}>
        <label className={css.inlineCheck}>
          <input type="checkbox" checked={on} onChange={(e) => update({ chartHeader: { ...h, showSource: e.target.checked ? undefined : false } })} />
          {label}
        </label>
        {sample && tip.button}
      </span>
      {on && <input className={css.input} aria-label={label} value={s.source} placeholder={t('leftover.sourcePlaceholder')} onChange={(e) => update({ source: e.target.value })} />}
      {sample && tip.panel(<>{t('leftover.sourceHint')} <button type="button" className={css.linkBtn} onClick={() => update({ source: '' })}>{t('leftover.clearSource')}</button></>)}
    </div>
  );
}

/** スライドの定型文言の言語（説明は i） */
export function LocaleField({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const tip = useTip('info', t('field.slideLocaleInfo'));
  return (
    <div className={css.field}>
      <span className={css.labelRow}>{t('field.slideLocale')}{tip.button}</span>
      <div className={css.seg} role="group" aria-label={t('field.slideLocale')}>
        {LOCALES.map((l: Locale) => (
          <button key={l} type="button" aria-pressed={s.slideLocale === l} onClick={() => update(switchSlideLocale(s, l))}>{t(`locale.${l}`)}</button>
        ))}
      </div>
      {tip.panel(t('field.slideLocaleNote'))}
    </div>
  );
}

/** 2指標スロープの左右の指標名（例は i に） */
export function MetricNames({ left, right, onChange }: { left: string; right: string; onChange: (k: 'current' | 'base', v: string) => void }) {
  const t = useT();
  const tip = useTip('info', t('field.metricInfo'));
  return (
    <div className={css.field}>
      <span className={css.labelRow}>{t('field.metricNames')}{tip.button}</span>
      {tip.panel(t('field.metricInfoText'))}
      <div className={css.row2}>
        <label className={css.field}>
          <span>{t('field.leftMetric')}</span>
          <input className={css.input} value={left} onChange={(e) => onChange('current', e.target.value)} />
        </label>
        <label className={css.field}>
          <span>{t('field.rightMetric')}</span>
          <input className={css.input} value={right} onChange={(e) => onChange('base', e.target.value)} />
        </label>
      </div>
    </div>
  );
}

/** 行・列が表すもの（使われ方は i に） */
export function DimensionFields({ rows, cols, onChange }: { rows: string; cols: string; onChange: (k: 'rows' | 'cols', v: string) => void }) {
  const t = useT();
  const tip = useTip('info', t('field.dimensionsInfo'));
  return (
    <div className={css.field}>
      <span className={css.labelRow}>{t('field.dimensions')}{tip.button}</span>
      {tip.panel(t('field.dimensionsHint'))}
      <div className={css.row2}>
        <label className={css.field}>
          <span>{t('field.rowsLabel')}</span>
          <input className={css.input} value={rows} placeholder={t('field.rowsPh')} onChange={(e) => onChange('rows', e.target.value)} />
        </label>
        <label className={css.field}>
          <span>{t('field.colsLabel')}</span>
          <input className={css.input} value={cols} placeholder={t('field.colsPh')} onChange={(e) => onChange('cols', e.target.value)} />
        </label>
      </div>
    </div>
  );
}
