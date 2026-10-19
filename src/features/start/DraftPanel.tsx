'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { localize, primaryChart, registry, type Dataset, type RecipeId } from '@/registry';
import { familyOf } from '../editor/project';
import type { ColumnRole, ColumnRoleMap, ValueKind } from '@/features/data/draft/columnRoles';
import type { ColumnProfile } from '@/features/data/draft/profile';
import { analyzeTable, loadDraft, manualRoles, type DraftSource } from '@/features/data/draft/session';
import { proposalSvg } from './dishView';
import type { Plan } from './plan';
import css from './draft.module.css';

/** 実データの Dataset（あれば、② のプレビューを見本ではなくこのデータで描く） */
export const DraftDataContext = createContext<Dataset | null>(null);

const ROLES_BY_KIND: Record<ColumnProfile['kind'], ColumnRole[]> = {
  text: ['item', 'series', 'group', 'unused'],
  date: ['time', 'item', 'unused'],
  number: ['metric', 'seriesValue', 'unused'],
  percent: ['metric', 'seriesValue', 'unused'],
  currency: ['metric', 'seriesValue', 'unused'],
};
const VALUE_KINDS: ValueKind[] = ['level', 'deltaAbsolute', 'deltaPoint', 'growthRate'];

/** 列の使い方を手で選ぶ（自動で決められない時、または直す時） */
function RolePicker({ draft, onApply, onCancel }: { draft: DraftSource; onApply: (map: ColumnRoleMap) => void; onCancel?: () => void }) {
  const t = useT();
  const a = useMemo(() => analyzeTable(draft.tsv), [draft.tsv]);
  const [roles, setRoles] = useState<Record<number, ColumnRole>>(() => {
    const init: Record<number, ColumnRole> = {};
    for (const x of draft.map?.assignments ?? []) init[x.col] = x.role;
    for (const c of draft.map?.time?.orientation === 'rows' ? draft.map.time.at : []) init[c] = 'time';
    return init;
  });
  const [kinds, setKinds] = useState<Record<number, ValueKind>>(() => Object.fromEntries((draft.map?.assignments ?? []).filter((x) => x.valueKind).map((x) => [x.col, x.valueKind!])));
  const [across, setAcross] = useState(draft.map?.time?.orientation === 'columns' || (!draft.map && !!(a.ok && a.profile.timeAcrossColumns)));
  const [bad, setBad] = useState(false);
  if (!a.ok) return null;
  const p = a.profile;
  const acrossCols = new Set(across ? p.timeAcrossColumns?.cols ?? [] : []);
  const apply = () => {
    const assignments = p.columns
      .filter((c) => !acrossCols.has(c.col) && (roles[c.col] ?? 'unused') !== 'unused' && roles[c.col] !== 'time')
      .map((c) => ({ col: c.col, role: roles[c.col]!, ...(['metric', 'seriesValue'].includes(roles[c.col]!) && kinds[c.col] ? { valueKind: kinds[c.col] } : {}) }));
    const timeCol = p.columns.find((c) => roles[c.col] === 'time');
    const time = across && p.timeAcrossColumns ? { orientation: 'columns' as const, at: p.timeAcrossColumns.cols, periodKind: p.timeAcrossColumns.periodKind }
      : timeCol ? { orientation: 'rows' as const, at: [timeCol.col], periodKind: timeCol.periodKind ?? ('unknown' as const) } : undefined;
    const r = manualRoles(p, { version: 1, ...(time ? { time } : {}), assignments });
    if (r.status !== 'ready') { setBad(true); return; }
    setBad(false);
    onApply(r.map);
  };
  return (
    <div className={css.picker}>
      <h4 className={css.panelTitle}>{t('draft.manual.title')}</h4>
      <p className={css.panelLead}>{t('draft.manual.lead')}</p>
      {p.timeAcrossColumns && (
        <label className={css.note}><input type="checkbox" checked={across} onChange={(e) => setAcross(e.target.checked)} /> {t('draft.manual.timeAcross')}</label>
      )}
      {p.columns.filter((c) => !acrossCols.has(c.col)).map((c) => (
        <div key={c.col} className={css.pickRow}>
          <span className={css.colName}>{c.header || t('draft.col', { n: c.col + 1 })}</span>
          <select aria-label={c.header || t('draft.col', { n: c.col + 1 })} value={roles[c.col] ?? 'unused'} onChange={(e) => setRoles({ ...roles, [c.col]: e.target.value as ColumnRole })}>
            {ROLES_BY_KIND[c.kind].map((r) => <option key={r} value={r}>{t(`draft.role.${r}`)}</option>)}
          </select>
          {['metric', 'seriesValue'].includes(roles[c.col] ?? '') ? (
            <select aria-label={t('draft.kind.level')} value={kinds[c.col] ?? 'level'} onChange={(e) => setKinds({ ...kinds, [c.col]: e.target.value as ValueKind })}>
              {VALUE_KINDS.map((k) => <option key={k} value={k}>{t(`draft.kind.${k}`)}</option>)}
            </select>
          ) : <span />}
        </div>
      ))}
      {bad && <p className={css.err} role="alert">{t('draft.manual.bad')}</p>}
      <div>
        <button type="button" className={css.make} onClick={apply}>{t('draft.manual.apply')}</button>
        {onCancel && <> <button type="button" className={css.link} onClick={onCancel}>{t('grid.pasteCancel')}</button></>}
      </div>
    </div>
  );
}

/** ② の上に出す：貼った表のデータで描いた候補。切り替えても AI は呼ばない */
export function DraftPanel({ plan, setPlan, onNext }: { plan: Plan; setPlan: (p: Plan) => void; onNext: (p?: Plan) => void }) {
  const t = useT();
  const locale = useLocale();
  const draft = plan.draft;
  const [fixing, setFixing] = useState(false);
  const loaded = useMemo(() => (draft ? loadDraft(draft) : null), [draft]);
  const analyzed = useMemo(() => (draft ? analyzeTable(draft.tsv) : null), [draft]);
  if (!draft) return null;
  const apply = (map: ColumnRoleMap) => { setPlan({ ...plan, draft: { ...draft, map, manual: undefined, shape: null, pick: undefined } }); setFixing(false); };

  if (!draft.map || fixing || !loaded || !loaded.ok) {
    const fail = loaded && !loaded.ok && loaded.reason !== 'no_map' ? (loaded.reason === 'duplicate_keys' || loaded.reason === 'too_few_rows' || loaded.reason === 'no_shape' ? loaded.reason : 'other') : null;
    return (
      <section className={css.panel} aria-label={t('draft.panel.title')}>
        {fail && !fixing && <p className={css.err} role="alert">{t(`draft.fail.${fail}`)}</p>}
        {analyzed?.ok ? <RolePicker draft={draft} onApply={apply} onCancel={draft.map ? () => setFixing(false) : undefined} /> : <p className={css.err}>{t('draft.err.unreadable')}</p>}
      </section>
    );
  }

  const profileCols = analyzed?.ok ? analyzed.profile.columns : [];
  const header = (col: number) => profileCols[col]?.header || t('draft.col', { n: col + 1 });
  const parts = [
    ...(draft.map.time ? [`${draft.map.time.at.map((c) => header(c)).slice(0, 2).join('・')}＝${t('draft.role.time')}`] : []),
    ...draft.map.assignments.filter((x) => x.role !== 'unused').map((x) => `${header(x.col)}＝${t(`draft.role.${x.role}`)}`),
  ];
  const { dataset, candidates, notes } = loaded;
  return (
    <>
      <section className={css.panel} aria-label={t('draft.panel.title')}>
        <h3 className={css.panelTitle}>{t('draft.panel.title')}</h3>
        <p className={css.panelLead}>{t('draft.panel.lead')}</p>
        <p className={css.roles}>
          <b>{t('draft.panel.roles')}</b>
          <span className={css.badge}>{t(`draft.panel.src.${draft.map.source}`)}</span><br />
          {parts.join(' ／ ')}
          {' '}<button type="button" className={css.link} onClick={() => setFixing(true)}>{t('draft.panel.fix')}</button>
        </p>
        <div className={css.grid}>
          {candidates.candidates.map((c) => {
            const r = registry.recipes[c.recipe];
            const svg = proposalSvg({ recipe: c.recipe }, locale, dataset);
            return (
              <div key={c.recipe} className={css.card}>
                <h4>{localize(r.name, locale)}</h4>
                <p className={css.reason}>{t(`draft.reason.${c.reason}`)}</p>
                {svg ? <div className={css.thumb} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className={`${css.thumb} ${css.none}`}>{t('draft.panel.noPreview')}</div>}
                <button type="button" className={css.make} disabled={!svg} onClick={() => onNext({ ...plan, draft: { ...draft, pick: c.recipe } })}>{t('draft.panel.make')}</button>
              </div>
            );
          })}
        </div>
        {candidates.excluded.map((x) => <p key={x.recipe} className={css.note}>{t(`draft.excluded.${x.why}`, { name: localize(registry.recipes[x.recipe].name, locale) })}</p>)}
        {notes.filter((n) => n.code === 'blank_values').map((n) => <p key={n.code} className={css.note}>{t('draft.note.blank_values', { n: n.n ?? 0 })}</p>)}
      </section>
    </>
  );
}

/** プランの下書きから作った実データ（作れなければ null） */
export function useDraftDataset(plan: Plan): Dataset | null {
  const draft = plan.draft;
  return useMemo(() => {
    if (!draft) return null;
    const l = loadDraft(draft);
    return l.ok ? l.dataset : null;
  }, [draft]);
}

/** この実データ（時系列・比較の表）で描けるレシピか。描けないレシピは見本のまま見せる */
export const draftCompatible = (id: RecipeId): boolean => {
  const r = registry.recipes[id];
  return r.schema === 'MATRIX_TIME_SERIES' && familyOf(primaryChart(r)) === 'table';
};

/** ② のカードのプレビュー用：実データがあり、描けるレシピなら、そのデータ */
export function useDraftFor(id: RecipeId): Dataset | null {
  const d = useContext(DraftDataContext);
  return d && draftCompatible(id) ? d : null;
}
