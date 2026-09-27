'use client';

import { axisNumber, isRateName, resolveComboSeries, type ComboSeries, type ComboSeriesConfig } from '@/engine/layout/charts/combo-config';
import { ACCENT_COLORS, chartPalette, themeIdOf } from '@/engine/theme';
import { useT, type MessageKey } from '@/i18n/ui';
import type { ControlId } from '@/registry';
import { viewAxes, type BuilderState } from './state';
import css from '../ui.module.css';

/** 系列数の目安（仕様：推奨6以下、7〜8は注意、上限10。線は4以下） */
export const COMBO_LIMITS = { recommended: 6, soft: 8, max: 10, lines: 4 } as const;

type Warn = { key: MessageKey; vars?: Record<string, string | number>; fix?: () => void; fixKey?: MessageKey };

/** 系列の設定の注意（入力の状態から。AI は使わない） */
export function comboWarnings(s: BuilderState, series: ComboSeries[]): Omit<Warn, 'fix'>[] {
  const shown = series.filter((x) => !x.hidden);
  const out: Omit<Warn, 'fix'>[] = [];
  if (!shown.some((x) => x.as === 'column')) out.push({ key: 'combo.warn.noColumns' });
  if (!shown.some((x) => x.as === 'line')) out.push({ key: 'combo.warn.noLines' });
  if (shown.length > COMBO_LIMITS.soft) out.push({ key: 'combo.warn.tooMany', vars: { n: shown.length } });
  else if (shown.length > COMBO_LIMITS.recommended) out.push({ key: 'combo.warn.many', vars: { n: shown.length } });
  if (shown.filter((x) => x.as === 'line').length > COMBO_LIMITS.lines) out.push({ key: 'combo.warn.manyLines' });
  for (const a of ['left', 'right'] as const) {
    const on = shown.filter((x) => x.axis === a);
    if (on.some((x) => x.rate) && on.some((x) => !x.rate)) out.push({ key: 'combo.warn.mixedAxis', vars: { axis: a } });
  }
  const { rows } = viewAxes(s);
  if (new Set(rows).size !== rows.length) out.push({ key: 'combo.warn.dupRows' });
  if (s.controls.combo_bar_mode === 'stacked') {
    const neg = shown.filter((x) => x.as === 'column').some((x) => s.dataset.periods.current.values.some((r) => (r[x.col] ?? 0) < 0));
    if (neg) out.push({ key: 'combo.warn.negStack' });
  }
  const flat = shown.filter((x) => { const v = s.dataset.periods.current.values.map((r) => r[x.col]).filter((y): y is number => y != null); return v.length > 1 && v.every((y) => y === v[0]); });
  if (flat.length) out.push({ key: 'combo.warn.flat', vars: { names: flat.map((x) => x.name).join('、') } });
  const manual = (['combo_left_min', 'combo_left_max', 'combo_right_min', 'combo_right_max'] as const).some((k) => axisNumber(s.controls[k]) != null)
    || s.controls.combo_left_zero === false || s.controls.combo_right_zero === false;
  if (manual) out.push({ key: 'combo.warn.axisRange' });
  return out;
}

/**
 * 縦棒＋折れ線の「系列の設定」と「軸」。系列ごとに表示・縦棒／折れ線・左軸／右軸・色・値ラベル・線種・マーカー・並び順。
 * 保存するのは controls.combo_series（名前と、変えた項目だけ。色も ID）
 */
export function ComboPanel({ state: s, update }: { state: BuilderState; update: (patch: Partial<BuilderState>) => void }) {
  const t = useT();
  const cols = viewAxes(s).cols;
  const pal = chartPalette(themeIdOf(s.controls.palette), cols.length);
  const config = (Array.isArray(s.controls.combo_series) ? s.controls.combo_series : []) as ComboSeriesConfig[];
  const series = resolveComboSeries(cols, config, pal);
  const setControls = (patch: Partial<Record<ControlId, unknown>>) => {
    const next = { ...s.controls };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '') delete next[k as ControlId]; else next[k as ControlId] = v; }
    update({ controls: next });
  };
  /** 今の並びで、1つの系列の設定を変える（ほかの系列は今の設定のまま） */
  const write = (list: { name: string }[], name?: string, patch?: Partial<ComboSeriesConfig>) => {
    const byName = new Map(config.map((c) => [c.name, c]));
    const next = list.map(({ name: n }) => {
      const c: ComboSeriesConfig = { ...(byName.get(n) ?? { name: n }) };
      if (n === name && patch) Object.assign(c, patch);
      for (const k of Object.keys(c) as (keyof ComboSeriesConfig)[]) if (c[k] === undefined) delete c[k];
      return c;
    });
    setControls({ combo_series: next });
  };
  const set = (name: string, patch: Partial<ComboSeriesConfig>) => write(series, name, patch);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= series.length) return;
    const list = [...series];
    [list[i], list[j]] = [list[j]!, list[i]!];
    write(list);
  };
  const warns: Warn[] = comboWarnings(s, series).map((w) => {
    if (w.key === 'combo.warn.mixedAxis') {
      const a = w.vars!.axis as 'left' | 'right';
      return { ...w, vars: { axis: t(a === 'left' ? 'combo.axis.left' : 'combo.axis.right') }, fixKey: 'combo.fix.rateRight' as MessageKey, fix: () => {
        const list = series.map((x) => ({ name: x.name }));
        const byName = new Map(config.map((c) => [c.name, c]));
        setControls({ combo_series: list.map(({ name }) => ({ ...(byName.get(name) ?? { name }), ...(isRateName(name) ? { axis: 'right' as const } : { axis: 'left' as const }) })) });
      } };
    }
    return w;
  });
  const colorOptions = [...Array.from({ length: 8 }, (_, i) => `p${i}`), ...Object.keys(ACCENT_COLORS)];
  const colorLabel = (id: string) => (id === 'auto' ? t('combo.color.auto') : id.startsWith('p') ? t('combo.color.theme', { n: +id.slice(1) + 1 }) : t(`combo.color.${id}` as MessageKey));

  return (
    <div className={css.combo}>
      <p className={css.comboHead}>{t('combo.series')}</p>
      <ul className={css.comboList}>
        {series.map((x, i) => (
          <li key={x.name} className={css.comboRow} data-hidden={x.hidden}>
            <div className={css.comboTop}>
              <label className={css.inlineCheck}>
                <input type="checkbox" checked={!x.hidden} onChange={(e) => set(x.name, { hidden: e.target.checked ? undefined : true })} />
                <span className={css.comboSwatch} style={{ background: x.color }} aria-hidden="true" data-line={x.as === 'line'} />
                <span className={css.comboName}>{x.name}</span>
              </label>
              <span className={css.comboMove}>
                <button type="button" aria-label={t('combo.up', { name: x.name })} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={t('combo.down', { name: x.name })} disabled={i === series.length - 1} onClick={() => move(i, 1)}>↓</button>
              </span>
            </div>
            <div className={css.comboGrid}>
              <select className={css.select} aria-label={t('combo.type')} value={x.as} onChange={(e) => set(x.name, { as: e.target.value as 'column' | 'line' })}>
                <option value="column">{t('combo.type.column')}</option>
                <option value="line">{t('combo.type.line')}</option>
              </select>
              <select className={css.select} aria-label={t('combo.axis')} value={x.axis} onChange={(e) => set(x.name, { axis: e.target.value as 'left' | 'right' })}>
                <option value="left">{t('combo.axis.left')}</option>
                <option value="right">{t('combo.axis.right')}</option>
              </select>
              <select className={css.select} aria-label={t('combo.color')} value={x.colorId} onChange={(e) => set(x.name, { color: e.target.value === 'auto' ? undefined : e.target.value })}>
                <option value="auto">{colorLabel('auto')}</option>
                {colorOptions.map((id) => <option key={id} value={id}>{colorLabel(id)}</option>)}
              </select>
              <select className={css.select} aria-label={t('combo.label')} value={x.label} onChange={(e) => set(x.name, { label: e.target.value as ComboSeries['label'] })}>
                {(['none', 'all', 'ends', 'last'] as const).map((v) => <option key={v} value={v}>{t(`combo.label.${v}`)}</option>)}
              </select>
              {x.as === 'line' && (
                <>
                  <select className={css.select} aria-label={t('combo.line')} value={x.line} onChange={(e) => set(x.name, { line: e.target.value as ComboSeries['line'] })}>
                    {(['solid', 'dash', 'dot'] as const).map((v) => <option key={v} value={v}>{t(`combo.line.${v}`)}</option>)}
                  </select>
                  <select className={css.select} aria-label={t('combo.marker')} value={x.marker} onChange={(e) => set(x.name, { marker: e.target.value as ComboSeries['marker'] })}>
                    {(['none', 'circle', 'square', 'diamond'] as const).map((v) => <option key={v} value={v}>{t(`combo.marker.${v}`)}</option>)}
                  </select>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {warns.length > 0 && (
        <ul className={css.comboWarns} role="status">
          {warns.map((w, i) => (
            <li key={i}>{t(w.key, w.vars)}{w.fix && <> <button type="button" className={css.linkBtn} onClick={w.fix}>{t(w.fixKey!)}</button></>}</li>
          ))}
        </ul>
      )}

      <p className={css.comboHead}>{t('combo.axes')}</p>
      <div className={css.row2}>
        {(['left', 'right'] as const).map((a) => (
          <div key={a} className={css.comboAxis}>
            <span className={css.comboAxisName}>{t(`combo.axis.${a}`)}</span>
            <input className={css.input} aria-label={t('combo.axisTitle', { axis: t(`combo.axis.${a}`) })} placeholder={t('combo.axisTitlePh')}
              value={String(s.controls[`combo_${a}_title`] ?? '')} onChange={(e) => setControls({ [`combo_${a}_title`]: e.target.value })} />
            <div className={css.row2}>
              <input className={css.input} inputMode="decimal" aria-label={t('combo.min', { axis: t(`combo.axis.${a}`) })} placeholder={t('combo.minPh')}
                value={String(s.controls[`combo_${a}_min`] ?? '')} onChange={(e) => setControls({ [`combo_${a}_min`]: e.target.value })} />
              <input className={css.input} inputMode="decimal" aria-label={t('combo.max', { axis: t(`combo.axis.${a}`) })} placeholder={t('combo.maxPh')}
                value={String(s.controls[`combo_${a}_max`] ?? '')} onChange={(e) => setControls({ [`combo_${a}_max`]: e.target.value })} />
            </div>
            <label className={css.inlineCheck}>
              <input type="checkbox" checked={s.controls[`combo_${a}_zero`] !== false} onChange={(e) => setControls({ [`combo_${a}_zero`]: e.target.checked ? undefined : false })} />
              {t('combo.zero')}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
