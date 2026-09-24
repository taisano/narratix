'use client';

import { complementsFor, controlsFor, localize, lostWhenRemoved, registry, standardComplements, LOCALES, type ComplementDef, type ControlId, type Locale, type RecipeDef } from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { timeRange } from '@/engine/transform/cagr';
import { useLocale, useT } from '@/i18n/ui';
import { ControlField } from './ControlField';
import { hasBase, isSwapped, viewAxes, type BuilderState } from './state';
import css from '../ui.module.css';
import { Fold } from './Fold';

type Props = { state: BuilderState; update: (patch: Partial<BuilderState>) => void; recipe?: RecipeDef | null };

/** 設定の欄のうち、専用の場所で扱うもの（ここでは並べない） */
const HANDLED_ELSEWHERE: ControlId[] = ['title', 'subtitle', 'source', 'unit', 'palette', 'items', 'series', 'axis_swap'];

export function Settings({ state: s, update, recipe = null }: Props) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const C = registry.controls;
  const d = s.dataset;
  const axes = viewAxes(s);
  const swapped = isSwapped(s);
  const rowsName = d.dimensions?.rows || t('field.rowsLabel');
  const colsName = d.dimensions?.cols || t('field.colsLabel');

  const setData = (patch: Partial<BuilderState['dataset']>) => update({ dataset: { ...d, ...patch } });
  const setPeriodLabel = (k: 'current' | 'base', label: string) => setData({ periods: { ...d.periods, [k]: { ...d.periods[k], label } } });
  const setControl = (id: ControlId, v: unknown) => {
    const next = { ...s.controls };
    if (v === undefined) delete next[id]; else next[id] = v;
    update({ controls: next });
  };

  /** 行・列の表示の切り替え（全部選ばれたら絞り込みを外す） */
  const toggleShown = (id: 'items' | 'series', all: string[], name: string, on: boolean) => {
    const cur = Array.isArray(s.controls[id]) ? (s.controls[id] as string[]) : all;
    const next = all.filter((n) => (n === name ? on : cur.includes(n)));
    setControl(id, next.length === all.length ? undefined : next);
  };
  const shown = (id: 'items' | 'series', name: string) => !Array.isArray(s.controls[id]) || (s.controls[id] as string[]).includes(name);

  const controls = controlsFor(s.chart).filter((c) => !HANDLED_ELSEWHERE.includes(c.id));
  const canSwap = C.axis_swap.appliesTo.includes(s.chart);
  const emptyLabel = (id: ControlId) => {
    if (id === 'compare_target' || id === 'compare_target2') return t('field.defaultLast', { value: axes.rows[axes.rows.length - 1] ?? '' });
    if (id === 'base_target') return t('field.defaultFirst', { value: axes.rows[0] ?? '' });
    return t('field.highlightNone');
  };

  const implemented = IMPLEMENTED_COMPLEMENTS[s.chart] ?? [];
  const complements = complementsFor(s.chart).filter((c) => implemented.includes(c.def.id));
  const years = timeRange(axes.rows);
  const growthKeys = ['market', ...axes.cols.map((c) => `series:${c}`)];
  const toggleGrowthRow = (key: string, on: boolean) =>
    update({ mekko: { ...s.mekko, growthRows: growthKeys.filter((k) => (k === key ? on : s.mekko.growthRows.includes(k))) } });

  const renderComplement = ({ def, recommended }: { def: ComplementDef; recommended: boolean }, kind: 'std' | 'opt' | 'other' | 'all') => {
      const needsBase = def.requiresBase === 'always' && !hasBase(s);
      const needsYears = def.id === 'cagr_note' && !years;
      return (
        <div key={def.id}>
          <label className={css.check}>
            <input type="checkbox" disabled={needsBase} checked={!!s.complements[def.id] && !needsBase}
              onChange={(e) => update({ complements: { ...s.complements, [def.id]: e.target.checked } })} />
            <span>{L(def.label)}{kind === 'std' ? <span className={css.badge}>{t('complement.standardBadge')}</span> : (kind === 'all' || kind === 'other') && recommended && <span className={css.badge}>{t('complement.recommended')}</span>}</span>
          </label>
          {kind === 'opt' && optReason(def.id) && <p className={css.hint}>{optReason(def.id)}</p>}
          {kind === 'std' && !s.complements[def.id] && <p className={css.hintWarn}>{stdOffText(def)}</p>}
          {needsBase && <p className={css.hint}>{t('complement.needsBase')}</p>}
          {!needsBase && needsYears && s.complements[def.id] && <p className={css.hint}>{t('complement.needsYears')}</p>}
          {def.id === 'aligned_table' && s.complements.aligned_table && s.chart === 'mekko' && (
            <div className={css.sub}>
              <div className={css.field}>
                <span>{t('field.growthMode')}</span>
                <div className={css.seg} role="group" aria-label={t('field.growthMode')}>
                  {(['cagr', 'period'] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={s.mekko.growthMode === m} onClick={() => update({ mekko: { ...s.mekko, growthMode: m } })}>{t(`field.growthMode.${m}`)}</button>
                  ))}
                </div>
              </div>
              <div className={css.field}>
                <span>{t('field.growthRows')}</span>
                <div className={css.chips}>
                  {growthKeys.map((k) => (
                    <label key={k} className={css.check}>
                      <input type="checkbox" checked={s.mekko.growthRows.includes(k)} onChange={(e) => toggleGrowthRow(k, e.target.checked)} />
                      {k === 'market' ? t('field.market') : k.slice(7)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
  };

  // 補完：レシピから作ったスライドは「標準構成」「おすすめの補完」「ほかにも付けられる」に分ける（レシピの定義から。AI は使わない）
  const std = recipe ? standardComplements(recipe) : [];
  const optIds = (recipe?.optional ?? []).map((o) => o.complement);
  const optReason = (id: string) => { const o = recipe?.optional?.find((x) => x.complement === id); return o ? L(o.reason) : ''; };
  const stdOffText = (def: ComplementDef) => {
    const lost = recipe ? lostWhenRemoved(recipe, def.id) : [];
    return lost.length
      ? t('complement.stdOff', { name: L(def.label), lost: lost.map((x) => L(registry.aspects[x].label)).join('・') })
      : t('complement.stdOffGeneric', { name: L(def.label) });
  };
  type Group = { key: 'std' | 'opt' | 'other' | 'all'; title: string | null; note?: string; items: typeof complements };
  const groups: Group[] = recipe
    ? [
        { key: 'std', title: t('complement.standard'), note: t('complement.standardNote'), items: complements.filter((c) => std.includes(c.def.id)) },
        { key: 'opt', title: t('complement.optional'), items: complements.filter((c) => optIds.includes(c.def.id) && !std.includes(c.def.id)) },
        { key: 'other', title: t('complement.others'), items: complements.filter((c) => !std.includes(c.def.id) && !optIds.includes(c.def.id)) },
      ]
    : [{ key: 'all', title: null, items: complements }];

  return (
    <>
      <Fold id="slide" title={t('section.slide')}>
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
      </Fold>

      <Fold id="view" title={t('section.view')}>
        {canSwap && (
          <div className={css.field}>
            <ControlField def={C.axis_swap} value={s.controls.axis_swap} onChange={(v) => setControl('axis_swap', v)} />
            <p className={css.axisNow}>{t('field.axisNow', { axis: swapped ? colsName : rowsName, series: swapped ? rowsName : colsName })}</p>
          </div>
        )}
        {controls.map((def) => (
          <ControlField
            key={def.id} def={def} value={s.controls[def.id]} onChange={(v) => setControl(def.id, v)}
            candidates={def.dataSource === 'rows' ? axes.rows : axes.cols} emptyLabel={emptyLabel(def.id)}
          />
        ))}
      </Fold>

      <Fold id="complements" title={t('section.complements')}>
        {s.chart === 'mekko' && (
          <label className={css.check}>
            <input type="checkbox" checked={s.mekko.showTotal} onChange={(e) => update({ mekko: { ...s.mekko, showTotal: e.target.checked } })} />
            {t('field.showTotal')}
          </label>
        )}
        {groups.map((g) => g.items.length > 0 && (
          <div key={g.key} className={css.compGroup}>
            {g.title && <h3 className={css.compHead}>{g.title}</h3>}
            {g.note && <p className={css.hint}>{g.note}</p>}
            {g.items.map((c) => renderComplement(c, g.key))}
          </div>
        ))}
      </Fold>

      <Fold id="rowsCols" title={t('section.rowsCols')} defaultOpen={false}>
        <div className={css.field}>
          <span>{t('field.rowsToShow', { name: rowsName })}</span>
          <div className={css.chipList}>
            {d.rows.map((r) => (
              <label key={r} className={css.check}>
                <input type="checkbox" checked={shown('items', r)} onChange={(e) => toggleShown('items', d.rows, r, e.target.checked)} />{r}
              </label>
            ))}
          </div>
        </div>
        <div className={css.field}>
          <span>{t('field.colsToShow', { name: colsName })}</span>
          <div className={css.chipList}>
            {d.cols.map((c) => (
              <label key={c} className={css.check}>
                <input type="checkbox" checked={shown('series', c)} onChange={(e) => toggleShown('series', d.cols, c, e.target.checked)} />{c}
              </label>
            ))}
          </div>
        </div>
      </Fold>

      <Fold id="dataOpts" title={t('section.data')}>
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
      </Fold>
    </>
  );
}
