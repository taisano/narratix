'use client';

import { useT } from '@/i18n/ui';
import type { LongPivot, LongSource } from '@/registry';
import { applyLong, columnKinds, detachLong, isTimeCol, longToTsv, normalizePivot, pivotTable, valuesOf } from './long';
import type { BuilderState } from './state';
import { CopyButton } from './CopyButton';
import css from './grid.module.css';

/** 縦長の表から切り出している時の欄：行・列・値・絞り込み・計算・合計を選ぶと、下の表（とグラフ）が変わる */
export function LongPanel({ state, onChange, needsBase }: { state: BuilderState; onChange: (s: BuilderState) => void; needsBase: boolean }) {
  const t = useT();
  const L = state.dataset.long as LongSource;
  const p = L.pivot;
  const kinds = columnKinds(L);
  const dims = kinds.map((k, i) => (k === 'dim' ? i : -1)).filter((i) => i >= 0);
  const values = kinds.map((k, i) => (k === 'value' ? i : -1)).filter((i) => i >= 0);
  const h = (k: number) => L.headers[k] ?? `#${k + 1}`;
  const set = (next: Partial<LongPivot>) => onChange(applyLong(state, L, normalizePivot(L, { ...p, ...next }, p)));
  const result = pivotTable(L, p);
  const colsName = h(p.col), rowsName = h(p.row);
  const totalDefault = t('long.totalDefault');
  // 2時点に使える切り口（行・列以外）
  const compareCols = dims.filter((k) => k !== p.row && k !== p.col);
  // 2時点を比べる：時間の列があればそれ、なければ値が2つ以上ある列。前＝最初、後＝最後
  const startCompare = (k = compareCols.find((c) => isTimeCol(L, c)) ?? compareCols.find((c) => valuesOf(L, c).length >= 2) ?? compareCols[0]) => {
    if (k == null) return;
    const vs = valuesOf(L, k);
    set({ compare: { col: k, base: vs[0] ?? '', current: vs[vs.length - 1] ?? '' } });
  };
  const selfPercent = (['share_pair', 'stacked_100', 'bar_100', 'mekko'] as string[]).includes(state.chart);
  const meltedIdx = L.melted ? L.headers.indexOf(L.melted.name) : -1;

  return (
    <section className={css.longBox} aria-label={t('long.title')}>
      <p className={css.longHead}>{t('long.title')}</p>
      <p className={css.longIntro}>{t('long.intro', { n: L.rows.length })}</p>
      {L.melted && <p className={css.longIntro}>{t('long.melted', { cols: L.melted.from.join('・'), name: L.melted.name, first: L.melted.from[0] ?? '' })}</p>}
      <p className={css.longIntro}>{t('long.perSlide')}</p>
      {needsBase && !p.compare && (
        <p className={css.warn}>{t('long.needsCompare')}
          {compareCols.length > 0 && <button type="button" className={css.linkBtn} onClick={() => startCompare()}>{t('long.startCompare', { name: h(compareCols.find((c) => isTimeCol(L, c)) ?? compareCols[0]!) })}</button>}
        </p>
      )}
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
            {isTimeCol(L, f.col) && <span className={css.longNote}>{t('long.filterTimeNote', { name: h(f.col) })}<button type="button" className={css.linkBtn} onClick={() => startCompare(f.col)}>{t('long.startCompare', { name: h(f.col) })}</button></span>}
          </label>
        ))}
      </div>

      <div className={css.longCalc} role="radiogroup" aria-label={t('long.calc')}>
        <span className={css.longLabel}>{t('long.calc')}</span>
        <label className={css.longRadio}>
          <input type="radio" name="long-calc" checked={p.share == null} onChange={() => set({ share: null })} />
          <span>{t('long.calcValue')}</span>
        </label>
        {[...p.filters].filter((f) => f.value != null).sort((a, b) => Number(b.col === meltedIdx) - Number(a.col === meltedIdx)).map((f) => (
          <label key={f.col} className={css.longRadio}>
            <input type="radio" name="long-calc" checked={p.share === f.col} onChange={() => set({ share: f.col })} />
            <span>{t('long.calcShare', { name: h(f.col), value: f.value! })}{f.col === meltedIdx ? t('long.recommended') : ''}</span>
          </label>
        ))}
        <span className={css.longNote}>{p.filters.some((f) => f.value != null) ? t('long.calcNote') : t('long.calcNoFilter')}</span>
        {selfPercent && p.share != null && (
          <p className={css.warn}>{t('long.selfPercent')}
            <button type="button" className={css.linkBtn} onClick={() => set({ share: null })}>{t('long.toValue')}</button>
          </p>
        )}
      </div>

      <div className={css.longCalc}>
        <label className={css.longRadio}>
          <input type="checkbox" checked={!!p.compare} disabled={!compareCols.length} onChange={(e) => {
            if (!e.target.checked) return set({ compare: null });
            startCompare();
          }} />
          <span>{t('long.compare')}</span>
        </label>
        {p.compare && (
          <div className={css.longFields}>
            <label className={css.longField}>
              <span className={css.longLabel}>{t('long.compareCol')}</span>
              <select className={css.longSelect} value={p.compare.col} onChange={(e) => {
                const k = Number(e.target.value), vs = valuesOf(L, k);
                set({ compare: { col: k, base: vs[0] ?? '', current: vs[vs.length - 1] ?? '' } });
              }}>
                {compareCols.map((k) => <option key={k} value={k}>{h(k)}</option>)}
              </select>
            </label>
            {(['base', 'current'] as const).map((key) => (
              <label key={key} className={css.longField}>
                <span className={css.longLabel}>{t(key === 'base' ? 'long.compareBase' : 'long.compareCurrent')}</span>
                <select className={css.longSelect} value={p.compare![key]} onChange={(e) => set({ compare: { ...p.compare!, [key]: e.target.value } })}>
                  {valuesOf(L, p.compare!.col).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <span className={css.longNote}>{t('long.compareNote')}</span>
        {p.compare && !needsBase && (
          <p className={css.warn}>{t('long.compareUnused', { base: p.compare.base, current: p.compare.current })}
            <button type="button" className={css.linkBtn} onClick={() => onChange({ ...applyLong(state, L, normalizePivot(L, { ...p, share: null }, p)), chart: 'share_pair' })}>{t('long.toSharePair')}</button>
          </p>
        )}
      </div>

      <div className={css.longFields}>
        <label className={css.longRadio}>
          <input type="checkbox" checked={p.total != null} onChange={(e) => set({ total: e.target.checked ? totalDefault : null })} />
          <span>{t('long.totalAdd')}</span>
        </label>
        {p.total != null && (
          <>
            <label className={css.longField}>
              <span className={css.longLabel}>{t('long.totalOn')}</span>
              <select className={css.longSelect} value={p.totalOn ?? 'col'} onChange={(e) => set({ totalOn: e.target.value as 'row' | 'col' })}>
                <option value="col">{t('long.totalOnCol', { name: colsName })}</option>
                <option value="row">{t('long.totalOnRow', { name: rowsName })}</option>
              </select>
            </label>
            <label className={css.longField}>
              <span className={css.longLabel}>{t('long.totalName')}</span>
              <input className={css.longInput} value={p.total} onChange={(e) => set({ total: e.target.value || totalDefault })} />
            </label>
          </>
        )}
      </div>
      {p.total != null && <span className={css.longNote}>{p.share != null ? t('long.totalShareNote', { name: (p.totalOn ?? 'col') === 'col' ? colsName : rowsName }) : t('long.totalNote')}</span>}

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
