'use client';

import { useT } from '@/i18n/ui';
import type { LongPivot, LongSource } from '@/registry';
import { applyLong, columnKinds, detachLong, longToTsv, normalizePivot, pivotTable, valuesOf } from './long';
import type { BuilderState } from './state';
import { CopyButton } from './CopyButton';
import css from './grid.module.css';

/** 縦長の表から切り出している時の欄：行・列・値・絞り込み・計算・合計を選ぶと、下の表（とグラフ）が変わる */
export function LongPanel({ state, onChange }: { state: BuilderState; onChange: (s: BuilderState) => void }) {
  const t = useT();
  const L = state.dataset.long as LongSource;
  const p = L.pivot;
  const kinds = columnKinds(L);
  const dims = kinds.map((k, i) => (k === 'dim' ? i : -1)).filter((i) => i >= 0);
  const values = kinds.map((k, i) => (k === 'value' ? i : -1)).filter((i) => i >= 0);
  const h = (k: number) => L.headers[k] ?? `#${k + 1}`;
  const set = (next: Partial<LongPivot>) => onChange(applyLong(state, L, normalizePivot(L, { ...p, ...next }, p)));
  const result = pivotTable(L, p);
  const colsName = h(p.col);
  const totalDefault = t('long.totalDefault');

  return (
    <section className={css.longBox} aria-label={t('long.title')}>
      <p className={css.longHead}>{t('long.title')}</p>
      <p className={css.longIntro}>{t('long.intro', { n: L.rows.length })}</p>
      <p className={css.longIntro}>{t('long.perSlide')}</p>
      <div className={css.longFields}>
        <label className={css.longField}>
          <span className={css.longLabel}>{t('long.row')}</span>
          <select className={css.longSelect} value={p.row} onChange={(e) => set({ row: Number(e.target.value) })}>
            {dims.map((k) => <option key={k} value={k}>{h(k)}</option>)}
          </select>
          <span className={css.longNote}>{t('long.rowNote')}</span>
        </label>
        <label className={css.longField}>
          <span className={css.longLabel}>{t('long.col')}</span>
          <select className={css.longSelect} value={p.col} onChange={(e) => set({ col: Number(e.target.value) })}>
            {dims.map((k) => <option key={k} value={k}>{h(k)}</option>)}
          </select>
          <span className={css.longNote}>{t('long.colNote')}</span>
        </label>
        {values.length > 1 && (
          <label className={css.longField}>
            <span className={css.longLabel}>{t('long.value')}</span>
            <select className={css.longSelect} value={p.value} onChange={(e) => set({ value: Number(e.target.value) })}>
              {values.map((k) => <option key={k} value={k}>{h(k)}</option>)}
            </select>
          </label>
        )}
        {p.filters.map((f) => (
          <label key={f.col} className={css.longField}>
            <span className={css.longLabel}>{t('long.filter', { name: h(f.col) })}</span>
            <select className={css.longSelect} value={f.value ?? '\u0000all'} onChange={(e) => {
              const v = e.target.value === '\u0000all' ? null : e.target.value;
              set({ filters: p.filters.map((x) => (x.col === f.col ? { ...x, value: v } : x)) });
            }}>
              {valuesOf(L, f.col).map((v) => <option key={v} value={v}>{v}</option>)}
              <option value={'\u0000all'}>{t('long.filterAll')}</option>
            </select>
            <span className={css.longNote}>{f.value == null ? t('long.filterAllNote', { name: h(f.col) }) : t('long.filterNote', { name: h(f.col), value: f.value })}</span>
          </label>
        ))}
      </div>

      <div className={css.longCalc} role="radiogroup" aria-label={t('long.calc')}>
        <span className={css.longLabel}>{t('long.calc')}</span>
        <label className={css.longRadio}>
          <input type="radio" name="long-calc" checked={p.share == null} onChange={() => set({ share: null })} />
          <span>{t('long.calcValue')}</span>
        </label>
        {p.filters.filter((f) => f.value != null).map((f) => (
          <label key={f.col} className={css.longRadio}>
            <input type="radio" name="long-calc" checked={p.share === f.col} onChange={() => set({ share: f.col })} />
            <span>{t('long.calcShare', { name: h(f.col), value: f.value! })}</span>
          </label>
        ))}
        <span className={css.longNote}>{p.filters.some((f) => f.value != null) ? t('long.calcNote') : t('long.calcNoFilter')}</span>
      </div>

      <div className={css.longFields}>
        <label className={css.longRadio}>
          <input type="checkbox" checked={p.total != null} onChange={(e) => set({ total: e.target.checked ? totalDefault : null })} />
          <span>{t('long.total', { name: colsName })}</span>
        </label>
        {p.total != null && (
          <label className={css.longField}>
            <span className={css.longLabel}>{t('long.totalName')}</span>
            <input className={css.longInput} value={p.total} onChange={(e) => set({ total: e.target.value || totalDefault })} />
          </label>
        )}
      </div>
      {p.total != null && <span className={css.longNote}>{p.share != null ? t('long.totalShareNote', { name: colsName }) : t('long.totalNote')}</span>}

      {result.merged > 0 && <p className={css.warn}>{t('long.merged', { n: result.merged })}</p>}
      {result.empty > 0 && <p className={css.warn}>{t('long.empty', { n: result.empty })}</p>}

      <div className={css.actions}>
        <CopyButton text={() => longToTsv(L)} label={t('long.copySource')} />
        <button type="button" className="btn" onClick={() => onChange(detachLong(state))}>{t('long.detach')}</button>
        <span className={css.longNote}>{t('long.detachNote')}</span>
      </div>
    </section>
  );
}
