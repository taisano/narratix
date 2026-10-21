'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { localize, primaryChart, registry, type Dataset, type RecipeId } from '@/registry';
import { familyOf } from '../editor/project';
import type { ColumnRole, ColumnRoleMap, ValueKind } from '@/features/data/draft/columnRoles';
import type { ColumnProfile } from '@/features/data/draft/profile';
import { RelationAxes } from './RelationAxes';
import { KpiBasis } from './KpiBasis';
import { pastedSource, analyzeTable, exactPick, leadPick, loadDraft, manualRoles, setFor, tabsFor, type DraftSet, type DraftSource } from '@/features/data/draft/session';
import { draftWarnings } from '@/features/data/draft/warnings';
import { readingOf, type Reading } from '@/features/data/draft/readings';
import { proposalSvg } from './dishView';
import { emphasisForRecipe, setEmphasis, type Plan } from './plan';
import { emphasesFor } from './coach';
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

/** 使っていない数値の列を、役割の一覧の最後に知らせる（AI や規則が「使わない」にした列が分からないままにならないように） */
function unusedNote(map: ColumnRoleMap, cols: { col: number; kind: string }[], header: (c: number) => string, label: string): string[] {
  const used = new Set([...map.assignments.filter((x) => x.role !== 'unused').map((x) => x.col), ...(map.time?.at ?? [])]);
  const names = cols.filter((c) => !used.has(c.col) && c.kind !== 'text' && c.kind !== 'date').map((c) => header(c.col));
  return names.length ? [`${label}：${names.join('・')}`] : [];
}

/** 列の使い方を手で選ぶ（自動で決められない時、または直す時） */
export function RolePicker({ draft, onApply, onCancel }: { draft: DraftSource; onApply: (map: ColumnRoleMap) => void; onCancel?: () => void }) {
  const t = useT();
  const a = useMemo(() => analyzeTable(draft.tsv), [draft.tsv]);
  const [roles, setRoles] = useState<Record<number, ColumnRole>>(() => {
    const init: Record<number, ColumnRole> = {};
    for (const x of draft.map?.assignments ?? []) init[x.col] = x.role;
    for (const c of draft.map?.time?.orientation === 'rows' ? draft.map.time.at : []) init[c] = 'time';
    return init;
  });
  const [kinds, setKinds] = useState<Record<number, ValueKind>>(() => Object.fromEntries((draft.map?.assignments ?? []).filter((x) => x.valueKind).map((x) => [x.col, x.valueKind!])));
  const [goods, setGoods] = useState<Record<number, 'up' | 'down'>>(() => Object.fromEntries((draft.map?.assignments ?? []).filter((x) => x.good).map((x) => [x.col, x.good!])));
  const [across, setAcross] = useState(draft.map?.time?.orientation === 'columns' || (!draft.map && !!(a.ok && a.profile.timeAcrossColumns)));
  const [bad, setBad] = useState(false);
  if (!a.ok) return null;
  const p = a.profile;
  const acrossCols = new Set(across ? p.timeAcrossColumns?.cols ?? [] : []);
  const apply = () => {
    const assignments = p.columns
      .filter((c) => !acrossCols.has(c.col) && (roles[c.col] ?? 'unused') !== 'unused' && roles[c.col] !== 'time')
      .map((c) => ({ col: c.col, role: roles[c.col]!, ...(['metric', 'seriesValue'].includes(roles[c.col]!) && kinds[c.col] ? { valueKind: kinds[c.col] } : {}), ...(['metric', 'seriesValue'].includes(roles[c.col]!) && goods[c.col] ? { good: goods[c.col] } : {}) }));
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
      <h4 className={css.panelTitle}>{t(draft.map ? 'draft.manual.titleFix' : 'draft.manual.title')}</h4>
      <p className={css.panelLead}>{t(draft.map ? 'draft.manual.leadFix' : 'draft.manual.lead')}</p>
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
          {['metric', 'seriesValue'].includes(roles[c.col] ?? '') && (
            <select aria-label={t('draft.good.label')} value={goods[c.col] ?? ''} onChange={(e) => { const v = e.target.value; setGoods((g) => { const n = { ...g }; if (v === 'up' || v === 'down') n[c.col] = v; else delete n[c.col]; return n; }); }}>
              <option value="">{t('draft.good.auto')}</option>
              <option value="up">{t('draft.good.up')}</option>
              <option value="down">{t('draft.good.down')}</option>
            </select>
          )}
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
  const src = pastedSource(draft.tsv, locale);
  const header = (col: number) => profileCols[col]?.header || t('draft.col', { n: col + 1 });
  const parts = [
    ...(draft.map.time ? [`${draft.map.time.at.map((c) => header(c)).slice(0, 2).join('・')}＝${t('draft.role.time')}`] : []),
    ...draft.map.assignments.filter((x) => x.role !== 'unused').map((x) => `${header(x.col)}＝${t(`draft.role.${x.role}`)}`),
    ...unusedNote(draft.map, profileCols, header, t('draft.panel.unused')),
  ];
  const { sets } = loaded;
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
        {sets.filter((x) => x.shape !== 'time_kpi' && x.shape !== 'time_combo').map((set) => (
          <div key={set.shape}>
            {sets.length > 1 && <h4 className={css.setTitle}>{t(`draft.set.${set.shape}`)}</h4>}
            <div className={css.grid}>
              {set.candidates.candidates.map((c) => {
                const r = registry.recipes[c.recipe];
                const svg = proposalSvg({ recipe: c.recipe }, locale, set.dataset, src);
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
            {set.candidates.excluded.map((x) => <p key={x.recipe} className={css.note}>{t(`draft.excluded.${x.why}`, { name: localize(registry.recipes[x.recipe].name, locale) })}</p>)}
            {set.notes.filter((n) => true).map((n) => <p key={n.code} className={css.note}>{t(`draft.note.${n.code}`, { n: n.n ?? 0 })}</p>)}
          </div>
        ))}
      </section>
    </>
  );
}

const profileRows = (a: ReturnType<typeof analyzeTable> | null): number => (a && a.ok ? a.table.rows.length : 0);

const fmt = (v: number): string => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(Math.round(v * 100) / 100));

/** 相関係数の表示：小数2桁。丸めて ±1.00 になっても、完全な一致ではないので ±0.99 と書く */
const rText = (r: number): string => {
  const x = Math.round(r * 100) / 100;
  return (Math.abs(x) === 1 && Math.abs(r) < 1 ? Math.sign(r) * 0.99 : x).toFixed(2);
};

/** 読み取り（事実だけ）の文。計算はコード、文は翻訳済みのひな形 */
function readingLines(r: Reading, t: ReturnType<typeof useT>): string[] {
  if (r.kind === 'correlation') {
    return [
      t('draft.answer.reading.correlation', { x: r.x, y: r.y, strength: t(`draft.answer.strength.${r.strength}`), sign: t(`draft.answer.sign.${r.sign}`), r: rText(r.r), n: r.n }),
      ...(r.n < 8 ? [t('draft.answer.reading.fewNote')] : []),
      t('draft.answer.reading.correlationNote'),
    ];
  }
  if (r.kind === 'top') return [t('draft.answer.reading.top', { name: r.name, value: fmt(r.value), unit: r.unit, n: r.n })];
  const out = [t('draft.answer.reading.moves', { from: r.from, to: r.to, up: r.up, down: r.down })];
  if (r.biggestUp) out.push(t('draft.answer.reading.biggestUp', { name: r.biggestUp.name, diff: `+${fmt(r.biggestUp.diff)}`, unit: r.unit }));
  if (r.biggestDown) out.push(t('draft.answer.reading.biggestDown', { name: r.biggestDown.name, diff: fmt(r.biggestDown.diff), unit: r.unit }));
  return out;
}

/**
 * 1st View の「答え」：問い（①）と伝えたいこと（②）から決まった推奨チャートを、実データで大きく1枚だけ見せる。
 * 同じ系統の別の見せ方（散布図・バブル・象限など）は上のタブで切り替える。問いに合わない見せ方は「ほかの見せ方」に畳む。
 * 列の使い方が決まっていない時・読めない時は、この場所で選んでもらう（推測で描かない）
 */
export function DraftAnswer({ plan, setPlan, onNext, recommended, ready }: { plan: Plan; setPlan: (p: Plan) => void; onNext: (p?: Plan) => void; recommended: RecipeId | null; ready: boolean }) {
  const t = useT();
  const locale = useLocale();
  const draft = plan.draft;
  const [fixing, setFixing] = useState(false);
  const loaded = useMemo(() => (draft ? loadDraft(draft) : null), [draft]);
  const analyzed = useMemo(() => (draft ? analyzeTable(draft.tsv) : null), [draft]);
  const sets = loaded && loaded.ok ? loaded.sets : [];
  // 今見ているチャート：推奨（表から描けるなら）。無ければ最初の候補。推奨が変わったら（伝えたいことを選び直した時）推奨に戻す
  const first = sets[0]?.candidates.candidates[0]?.recipe ?? null;
  // 正確な値を聞かれた相談は、表を答えにする。それ以外は推奨（表から描けるなら）
  const exact = exactPick(sets, draft?.question ?? '');
  // 質問の言い回しで先頭に決まった候補（規模ならバブル）は、推奨より優先して最初に見せる
  const lead = leadPick(sets, recommended, draft?.question ?? '');
  const initial = exact ?? lead ?? (recommended && setFor(sets, recommended) ? recommended : first);
  const [active, setActive] = useState<RecipeId | null>(initial);
  useEffect(() => { setActive(initial); }, [initial]);
  // ② 最も強く伝えたいことも、先頭のタブに合わせる（選び直した後・自分で選んだ後は動かさない）
  useEffect(() => {
    const a = plan.angles[0];
    if (!lead || !a || a.emphasisSource === 'user' || recommended === lead || plan.angles.length !== 1) return;
    const e = emphasisForRecipe(plan, a, lead);
    if (e && e !== a.emphasis) setPlan(setEmphasis(plan, a.id, e));
  }, [lead, recommended]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const cur: RecipeId | null = active && setFor(sets, active) ? active : initial;
  const set: DraftSet | undefined = cur ? setFor(sets, cur) : undefined;
  if (!cur || !set) return null;
  const tabs = tabsFor(sets, cur, recommended ?? initial);
  // 表が答えの時は「最も伝えたいこと」を選ばなくても作れる（数値を見せるのが目的）。未選択なら Coach のおすすめ、無ければ先頭の候補を使う
  const isTable = cur === 'TABLE_BASIC' || cur === 'TABLE_DELTA' || cur === 'TABLE_HEAT' || cur === 'TABLE_KPI';
  const canMake = ready || isTable;
  const withPick = (pick: RecipeId): Plan => {
    let p = plan;
    if (!ready && isTable) {
      for (const a of plan.angles) {
        if (a.emphasis) continue;
        const e = a.coachEmphasis ?? emphasesFor(a.purpose)[0];
        if (e) p = setEmphasis(p, a.id, e);
      }
    }
    return { ...p, draft: { ...draft, pick } };
  };
  const profileCols = analyzed?.ok ? analyzed.profile.columns : [];
  const src = pastedSource(draft.tsv, locale);
  const header = (col: number) => profileCols[col]?.header || t('draft.col', { n: col + 1 });
  const parts = [
    ...(draft.map.time ? [`${draft.map.time.at.map((c) => header(c)).slice(0, 2).join('・')}＝${t('draft.role.time')}`] : []),
    ...draft.map.assignments.filter((x) => x.role !== 'unused').map((x) => `${header(x.col)}＝${t(`draft.role.${x.role}`)}`),
    ...unusedNote(draft.map, profileCols, header, t('draft.panel.unused')),
  ];
  const r = registry.recipes[cur];
  const svg = proposalSvg({ recipe: cur }, locale, set.dataset, src);
  const reading = readingOf(set.shape, cur, set.dataset);
  const warnings = analyzed?.ok ? draftWarnings(analyzed.check, draft.map, analyzed.profile) : [];
  const others = sets.filter((x) => x.shape !== 'exact_table' && x.shape !== 'time_kpi' && x.shape !== 'time_combo' && !x.candidates.candidates.some((c) => tabs.some((tb) => tb.recipe === c.recipe)));
  // ほかの見せ方の中の各形も、同じ並び（基本表は項目の大小・実績と比較先の末尾）にする
  const otherTabs = (o: DraftSet) => tabsFor(sets, o.candidates.candidates[0]!.recipe);
  // 推奨と同じ系統（同じタブの並び）を見ている間は「答え」。ほかの見せ方に切り替えたら見出しを変える
  const isRec = !!exact || (!!recommended && tabs.some((tb) => tb.recipe === recommended));
  return (
    <section className={css.answer} aria-label={t('draft.answer.title')}>
      <div className={css.answerHead}>
        <h3 className={css.answerTitle}>{isRec ? t('draft.answer.title') : t('draft.answer.titleOther')}</h3>
        {isRec && <span className={css.badge}>{t('draft.answer.recommended')}</span>}
        <span className={css.rolesShort} title={parts.join(' ／ ')}>
          {t('draft.answer.rolesShort')}：{parts.join(' ／ ')}
        </span>
        <button type="button" className={css.link} onClick={() => setFixing(true)}>{t('draft.panel.fix')}</button>
      </div>
      {tabs.length > 1 && (
        <div className={css.tabs} role="tablist" aria-label={t('draft.answer.variants')}>
          {tabs.map((c) => (
            <button key={c.recipe} type="button" role="tab" aria-selected={c.recipe === cur} className={`${css.tab} ${c.recipe === cur ? css.tabOn : ''}`} onClick={() => setActive(c.recipe)}>
              {localize(registry.recipes[c.recipe].name, locale)}
            </button>
          ))}
        </div>
      )}
      <div className={css.answerBody}>
        {svg ? <div className={css.bigChart} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className={`${css.bigChart} ${css.none}`}>{t('draft.panel.noPreview')}</div>}
        <div className={css.side}>
          <h4 className={css.sideHead}>{localize(r.name, locale)}</h4>
          <p className={css.sideText}>{localize(r.reason, locale)}</p>
          <p className={css.sideText}><b>{t('draft.answer.strength')}：</b>{localize(r.strength, locale)}</p>
          <p className={css.sideText}><b>{t('draft.answer.limit')}：</b>{localize(r.limitation, locale)}</p>
          {set.shape === 'item_compare' && set.dataset.rows.length >= 2 && ['TABLE_DELTA', 'COMP_VARIANCE', 'COMP_TWO_DELTA', 'COMP_RANK_DELTA'].includes(cur) && (
            <p className={css.sideText}>{t('draft.answer.diffIs', { cur: set.dataset.rows[set.dataset.rows.length - 1]!, base: set.dataset.rows[0]! })}</p>
          )}
          {reading && (
            <div className={css.reading}>
              <b>{t('draft.answer.reading')}</b>
              {readingLines(reading, t).map((l) => <p key={l} className={css.sideText}>{l}</p>)}
            </div>
          )}
          {cur === 'TABLE_KPI' && <KpiBasis map={draft.map} rows={profileRows(analyzed)} onApply={(map) => setPlan({ ...plan, draft: { ...draft, map } })} />}
          {set.shape === 'relation' && analyzed?.ok && (
            <RelationAxes map={draft.map} columns={analyzed.profile.columns} onApply={(map) => setPlan({ ...plan, draft: { ...draft, map } })} />
          )}
          <button type="button" className={css.make} disabled={!svg || !canMake} onClick={() => onNext(withPick(cur))}>{t('draft.answer.make')}</button>
          {!canMake && <p className={css.note}>{t('draft.answer.makeWhy')}</p>}
        </div>
      </div>
      {warnings.length > 0 && (
        <section className={css.warns} aria-label={t('draft.warn.head')}>
          <h4 className={css.warnHead}>{t('draft.warn.head')}</h4>
          <ul className={css.warnList}>
            {warnings.slice(0, 5).map((w) => (
              <li key={w.key} className={w.level === 'warn' ? css.warnItem : css.noteItem}>
                <b className={css.warnTag}>{t(w.level === 'warn' ? 'draft.warn.warnLabel' : 'draft.warn.noteLabel')}</b> {t(w.key as Parameters<typeof t>[0], w.vars)}
              </li>
            ))}
          </ul>
          {warnings.length > 5 && <p className={css.note}>{t('draft.warn.more', { n: warnings.length - 5 })}</p>}
        </section>
      )}
      {set.candidates.excluded.map((x) => <p key={x.recipe} className={css.note}>{t(`draft.excluded.${x.why}`, { name: localize(registry.recipes[x.recipe].name, locale) })}</p>)}
      {set.notes.map((n) => <p key={n.code} className={css.note}>{t(`draft.note.${n.code}`, { n: n.n ?? 0 })}</p>)}
      {others.length > 0 && (
        <details className={css.others}>
          <summary>{t('draft.answer.others', { n: others.reduce((s, x) => s + otherTabs(x).length, 0) })}</summary>
          <p className={css.note}>{t('draft.answer.othersHint')}</p>
          {others.map((o) => (
            <div key={o.shape}>
              <h4 className={css.setTitle}>{t(`draft.set.${o.shape}`)}</h4>
              <div className={css.smallGrid}>
                {otherTabs(o).map((c) => {
                  const sv = proposalSvg({ recipe: c.recipe }, locale, (setFor(sets, c.recipe) ?? o).dataset, src);
                  return (
                    <button key={c.recipe} type="button" className={css.mini} onClick={() => setActive(c.recipe)} disabled={!sv} aria-label={`${localize(registry.recipes[c.recipe].name, locale)}：${t('draft.answer.use')}`}>
                      {sv ? <span className={css.thumb} aria-hidden="true" dangerouslySetInnerHTML={{ __html: sv }} /> : null}
                      <span className={css.miniName}>{localize(registry.recipes[c.recipe].name, locale)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

/** プランの下書きから作った実データ（作れなければ null） */
export function useDraftDataset(plan: Plan): Dataset | null {
  const draft = plan.draft;
  return useMemo(() => {
    if (!draft) return null;
    const l = loadDraft(draft);
    // ② の既存カードのプレビューは「行＝期間・比較先、列＝系列・項目」の表（関係の表では描けない）
    return l.ok ? l.sets.find((x) => x.dataset.schema === 'MATRIX_TIME_SERIES')?.dataset ?? null : null;
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
