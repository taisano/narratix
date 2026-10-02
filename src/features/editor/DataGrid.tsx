'use client';

import { usesTwoMetrics } from './sides';
import { vwColumns } from '@/engine/layout/charts/vwidth';
import { useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { rowSum } from '@/engine/transform/matrix';
import { localize, registry } from '@/registry';
import { addCol, addRow, deleteCol, deleteMany, deleteRow, isTabular, parseNumber, pasteTsv, renameCol, renameRow, replaceWithTable, setCell, setGroup, type Tab } from './edit';
import { yearsInColumns } from './project';
import { applyLong, defaultPivot, pairPivot, detectLong, swapLong, tableToTsv } from './long';
import { LongPanel } from './LongPanel';
import { DataCheckPanel } from './DataCheckPanel';
import { checkPaste, DEFAULT_OPTIONS, readCell, splitTsv, type CheckOptions, type PasteContext } from './dataCheck';
import { ADDITIVE, metricOf, sumGroups } from './meaning';
import { isSampleSource } from './leftovers';
import { CopyButton } from './CopyButton';
import { useConfirm } from '../shared/Confirm';
import { hasBase, isTwoMetricChart, type BuilderState } from './state';
import css from './grid.module.css';
import ui from '../ui.module.css';
import Link from 'next/link';
import { useTip } from './Tip';

/** Enter で下のセル、Shift+Enter で上のセルへ（表計算ソフトと同じ） */
function moveOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
  const el = e.currentTarget;
  const r = Number(el.dataset.r);
  const c = el.dataset.c;
  if (Number.isNaN(r) || c == null) return;
  e.preventDefault();
  const next = el.closest('table')?.querySelector<HTMLInputElement>(`input[data-r="${r + (e.shiftKey ? -1 : 1)}"][data-c="${c}"]`);
  if (next) { next.focus(); next.select(); }
}

function NumberCell({ value, label, onCommit, r, c, readOnly }: { value: number | null; label: string; onCommit: (v: number | null) => void; r: number; c: number; readOnly?: boolean }) {
  const locale = useLocale();
  const shown = value == null ? '' : value.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`${css.cell} ${css.num}`}
      inputMode="decimal"
      aria-label={label}
      data-r={r}
      data-c={c}
      readOnly={readOnly}
      value={draft ?? shown}
      onFocus={(e) => { setDraft(value == null ? '' : String(value)); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
      onChange={(e) => { setDraft(e.target.value); onCommit(parseNumber(e.target.value)); }}
      onBlur={() => setDraft(null)}
      onKeyDown={moveOnEnter}
    />
  );
}

type Props = {
  state: BuilderState;
  onChange: (s: BuilderState) => void;
  /** どれかのスライドが比較期間を使う（使わなければ表は1つだけ） */
  showBase: boolean;
  /** 推移のスライドがある（年が列に並んでいたら行と列を入れ替える） */
  wantsTimeRows: boolean;
  onTranspose: () => void;
  /** 数字の意味の注意（重大）が指す列・行の名前。表で印を付ける */
  marked?: readonly string[];
};

export function DataGrid({ state, onChange, showBase, wantsTimeRows, onTranspose, marked = [] }: Props) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const [tabRaw, setTab] = useState<Tab>('current');
  const [baseOpen, setBaseOpen] = useState(false);
  const [notice, setNotice] = useState<'transposed' | null>(null);
  // まとめて削除：行・列にチェックを付けて、確認は1回だけ（1つずつの × はそのまま）
  const [picking, setPicking] = useState<{ rows: number[]; cols: number[] } | null>(null);
  const toggle = (axis: 'rows' | 'cols', i: number) => setPicking((p) => p && { ...p, [axis]: p[axis].includes(i) ? p[axis].filter((x) => x !== i) : [...p[axis], i] });
  const [cellNote, setCellNote] = useState<string | null>(null);
  const baseVisible = showBase || baseOpen;
  const tab: Tab = baseVisible ? tabRaw : 'current';
  const [pasting, setPasting] = useState<string | null>(null);
  // 貼り付けの健康診断。読み方の選択（合計を外す・単位をそろえるなど）は、既定はおすすめの方
  const [checkOpts, setCheckOpts] = useState<CheckOptions>(DEFAULT_OPTIONS);
  const d = state.dataset;
  // 貼り付け先のスライド（足し合わせるチャートか・今の単位・出典・期間）と照らし合わせる
  const pasteCtx = useMemo<PasteContext>(() => ({
    additive: ADDITIVE.includes(state.chart), chartName: localize(registry.charts[state.chart].label, locale),
    unit: d.unit ?? '', source: isSampleSource(state.source) ? '' : state.source, period: state.chartHeader?.period ?? '',
    prevRows: d.rows, prevCols: d.cols,
  }), [state.chart, state.source, state.chartHeader?.period, d.unit, d.rows, d.cols, locale]);
  const check = useMemo(() => (pasting && pasting.trim() ? checkPaste(pasting, checkOpts, pasteCtx) : null), [pasting, checkOpts, pasteCtx]);
  const hasError = !!check?.issues.some((i) => i.level === 'error');
  const parsed = check && !hasError ? check.table : null;
  const long = d.long;
  const period = d.periods[tab];
  const yearsAcross = wantsTimeRows && yearsInColumns(d);
  // 要因は行に「始点・要因・終点」、関係は列に「X・Y・大きさ」の役割がある。合計は意味がないので出さない
  const purpose = registry.charts[state.chart].purpose;
  const rowRole = (i: number) => (purpose !== 'contribution' ? null : i === 0 ? t('grid.roleStart') : i === d.rows.length - 1 ? t('grid.roleEnd') : t('grid.roleDriver'));
  const xySwap = state.controls.xy_swap === 'swapped';
  const vw = state.chart === 'variable_width' ? vwColumns(d.cols, state.controls.vw_width as string | undefined, state.controls.vw_height as string | undefined) : null;
  const colRole = (k: number) => (purpose !== 'relationship' ? null
    : vw ? (k === vw.w ? t('grid.roleWidth') : k === vw.h ? t('grid.roleHeight') : t('grid.roleUnused'))
    : [xySwap ? t('grid.roleY') : t('grid.roleX'), xySwap ? t('grid.roleX') : t('grid.roleY'), state.chart === 'bubble' ? t('grid.roleSize') : t('grid.roleUnused')][k] ?? t('grid.roleUnused'));
  const showGroup = purpose === 'relationship';
  // 縦棒＋折れ線は量と率が並ぶので、行の合計に意味がない
  // 種類の違う列（金額と率など）が混ざる時も、合計に意味がないので出さない
  const showTotal = purpose !== 'contribution' && purpose !== 'relationship' && d.unit !== '%' && state.chart !== 'combo' && sumGroups(d.cols.map((c) => metricOf(c, d.unit))).length <= 1;
  // 縦長の表は、推移・比較・構成の表（行×列）でだけ読む
  const longPaste = pasting && purpose !== 'contribution' && purpose !== 'relationship' ? detectLong(pasting, { melt: t('long.meltName'), value: t('long.valueName') }) : null;
  const transpose = () => (long ? onChange(swapLong(state)) : onTranspose());
  // 2指標スロープでは、2つの表は「左の指標」「右の指標」
  const pair = usesTwoMetrics(state);
  const tabName = (k: Tab) => t(k === 'current' ? (pair ? 'grid.tabLeft' : 'grid.tabCurrent') : (pair ? 'grid.tabRight' : 'grid.tabBase'), { label: d.periods[k].label });
  const fmt = (n: number) => n.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
  const names = { row: (n: number) => t('grid.newRow', { n }), col: (n: number) => t('grid.newCol', { n }) };

  const onPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLElement;
    if (el.dataset.r == null || el.dataset.c == null || long) return;
    const text = e.clipboardData.getData('text');
    if (!isTabular(text)) return;
    e.preventDefault();
    onChange(pasteTsv(state, tab, Number(el.dataset.r), Number(el.dataset.c), text, names));
    // 表の中への貼り付けでも、読めなかったセルは黙って空欄にしない（何個・どれかを伝える）
    const c0 = Number(el.dataset.c);
    const bad = splitTsv(text).grid.flatMap((row) => row.filter((v, j) => c0 + j >= 0 && ['text', 'error'].includes(readCell(v).kind)));
    setCellNote(bad.length ? t('check.gridUnreadable', { n: bad.length, sample: bad[0]!.slice(0, 20) }) : null);
  };

  return (
    <div>
      {cellNote && (
        <p className={css.warn}><b className={css.checkBadge} aria-hidden="true">C</b>{cellNote}<button type="button" className={css.linkBtn} onClick={() => setCellNote(null)}>{t('check.ok')}</button></p>
      )}
      {notice === 'transposed' && (
        <p className={css.notice}>{t('grid.transposed')}<button type="button" className={css.linkBtn} onClick={() => { transpose(); setNotice(null); }}>{t('grid.undo')}</button></p>
      )}
      {long && <LongPanel state={state} onChange={onChange} needsBase={showBase} />}
      {yearsAcross && !long && notice == null && (
        <p className={css.warn}>{t('grid.yearsAcross')}<button type="button" className={css.linkBtn} onClick={() => { onTranspose(); setNotice('transposed'); }}>{t('grid.transpose')}</button></p>
      )}
      <div className={css.tabs} role={baseVisible ? 'tablist' : undefined}>
        {baseVisible && (['current', 'base'] as const).map((k) => (
          <button key={k} type="button" role="tab" className={css.tab} aria-selected={tab === k} onClick={() => setTab(k)}>
            {tabName(k)}
            {/* 使う表が空なら、タブにも印を出す（プレビューを見なくても気づけるように） */}
            {k === 'base' && showBase && !d.periods.base.values.some((r) => r.some((v) => v != null)) && <span className={css.tabEmpty}>{t('grid.tabEmpty')}</span>}
          </button>
        ))}
        {!baseVisible && hasBase(state) && <button type="button" className={css.linkBtn} onClick={() => setBaseOpen(true)}>{t('grid.baseHidden')}</button>}
        <button type="button" className={css.pasteBtn} aria-expanded={pasting != null} onClick={() => setPasting(pasting == null ? '' : null)}>{t('grid.pasteOpen')}</button>
      </div>
      {pasting != null && (
        <div className={css.pasteBox}>
          <label htmlFor="paste-area" className={css.pasteLabel}>{t('grid.pasteLabel')}</label>
          <p className={css.longNote}>{t('grid.pasteKinds')}</p>
          <textarea id="paste-area" className={css.pasteArea} autoFocus value={pasting} placeholder={t('grid.pastePlaceholder')} onChange={(e) => setPasting(e.target.value)} />
          {longPaste && (
            <div className={css.notice}>
              <span>{t('grid.longDetected', { cols: longPaste.headers.join('・'), n: longPaste.rows.length })}</span>
            </div>
          )}
          {check && !longPaste && <DataCheckPanel check={check} opts={checkOpts} setOpts={setCheckOpts} />}
          <div className={css.actions}>
            {longPaste && (
              <button type="button" className={css.pasteGo} onClick={() => {
                // 2指標スロープなら、1つ目と2つ目の指標を左右に
                const p0 = defaultPivot(longPaste);
                onChange(applyLong(state, longPaste, isTwoMetricChart(state.chart) ? pairPivot(longPaste, p0) : p0));
                setPasting(null);
                setNotice(null);
              }}>{t('grid.longRead')}</button>
            )}
            <button type="button" className={longPaste ? 'btn' : css.pasteGo} disabled={!parsed} onClick={() => {
              if (!parsed) return;
              let next = replaceWithTable(state, tab, parsed, { groupsFromText: purpose === 'relationship' });
              // 読み取った単位（例：億円、%）はチャートの単位に入れる（診断で「入れます」と伝えている）
              if (check?.summary.unit) next = { ...next, dataset: { ...next.dataset, unit: check.summary.unit } };
              onChange(next);
              setPasting(null);
              setCheckOpts(DEFAULT_OPTIONS);
              // 年が列に並んでいたら、推移のグラフに合わせて行と列を入れ替える（元に戻せる）
              if (wantsTimeRows && yearsInColumns(next.dataset)) { onTranspose(); setNotice('transposed'); } else setNotice(null);
            }}>
              {longPaste ? t('grid.longAsWide') : baseVisible ? t('grid.pasteReplace', { tab: tabName(tab) }) : t('grid.pasteGo')}
            </button>
            <button type="button" className="btn" onClick={() => setPasting(null)}>{t('grid.pasteCancel')}</button>
          </div>
        </div>
      )}
      <div className={css.scroll}>
        <table className={css.grid} onPaste={onPaste}>
          <thead>
            <tr>
              <th scope="col" className={css.corner}>{d.dimensions?.rows ?? ''}</th>
              {d.cols.map((name, k) => (
                <th scope="col" key={k} className={marked.includes(name) ? css.marked : undefined} data-marked={marked.includes(name) ? '1' : undefined}>
                  <div className={css.cellwrap}>
                    {colRole(k) && <span className={css.role}>{colRole(k)}</span>}
                    <input className={css.cell} aria-label={t('grid.colName', { n: k + 1 })} data-r={-1} data-c={k} value={name} readOnly={!!long} onKeyDown={moveOnEnter} onChange={(e) => onChange(renameCol(state, k, e.target.value))} />
                    {picking && d.cols.length > 2 && <input type="checkbox" className={css.pick} aria-label={t('grid.pickCol', { name })} checked={picking.cols.includes(k)} onChange={() => toggle('cols', k)} />}
                    {!picking && d.cols.length > 2 && !long && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={async () => { if (await confirm({ title: t('confirm.colTitle', { name }), body: t('confirm.rowColBody'), ok: t('confirm.delete'), danger: true })) onChange(deleteCol(state, k)); }}>×</button>
                    )}
                  </div>
                </th>
              ))}
              {showGroup && <th scope="col"><div className={css.cellwrap}><span className={css.role}>{t('grid.roleGroup')}</span><input className={css.cell} aria-label={t('grid.groupName')} value={d.dimensions?.group ?? ''} placeholder={t('grid.groupHead')} onChange={(e) => onChange({ ...state, dataset: { ...d, dimensions: { ...d.dimensions, group: e.target.value } } })} /></div></th>}
              {showTotal && <th scope="col" className={css.total}>{t('grid.total')}</th>}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((name, i) => (
              <tr key={i}>
                <td className={marked.includes(name) ? css.marked : undefined} data-marked={marked.includes(name) ? '1' : undefined}>
                  <div className={css.cellwrap}>
                    {picking && d.rows.length > 2 && <input type="checkbox" className={css.pick} aria-label={t('grid.pickRow', { name })} checked={picking.rows.includes(i)} onChange={() => toggle('rows', i)} />}
                    {!picking && d.rows.length > 2 && !long && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={async () => { if (await confirm({ title: t('confirm.rowTitle', { name }), body: t('confirm.rowColBody'), ok: t('confirm.delete'), danger: true })) onChange(deleteRow(state, i)); }}>×</button>
                    )}
                    {rowRole(i) && <span className={css.role}>{rowRole(i)}</span>}
                    <input className={`${css.cell} ${css.name}`} aria-label={t('grid.rowName', { n: i + 1 })} data-r={i} data-c={-1} value={name} readOnly={!!long} onKeyDown={moveOnEnter} onChange={(e) => onChange(renameRow(state, i, e.target.value))} />
                  </div>
                </td>
                {d.cols.map((col, k) => (
                  <td key={k}>
                    <NumberCell
                      r={i} c={k}
                      readOnly={!!long}
                      value={period.values[i]?.[k] ?? null}
                      label={t('grid.cellLabel', { row: name, col })}
                      onCommit={(v) => onChange(setCell(state, tab, i, k, v))}
                    />
                  </td>
                ))}
                {showGroup && <td><input className={css.cell} aria-label={t('grid.groupCell', { row: name })} value={d.groups?.[i] ?? ''} placeholder={t('grid.groupPlaceholder')} onChange={(e) => onChange(setGroup(state, i, e.target.value))} /></td>}
                {showTotal && <td className={css.total}>{fmt(rowSum(period.values[i]))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={css.actions}>
        {!long && <button type="button" className="btn" onClick={() => onChange(addRow(state, names.row(d.rows.length + 1)))}>{t('grid.addRow')}</button>}
        {!long && <button type="button" className="btn" onClick={() => onChange(addCol(state, names.col(d.cols.length + 1)))}>{t('grid.addCol')}</button>}
        {!long && !picking && (d.rows.length > 2 || d.cols.length > 2) && <button type="button" className="btn" onClick={() => setPicking({ rows: [], cols: [] })}>{t('grid.pickStart')}</button>}
        <button type="button" className="btn" onClick={() => { transpose(); setNotice(null); }}>{t('grid.transpose')}</button>
        <CopyButton text={() => tableToTsv(d, tab)} label={t('grid.copy')} />
      </div>
      {picking && (() => {
        const nr = Math.min(picking.rows.length, d.rows.length - 2), nc = Math.min(picking.cols.length, d.cols.length - 2);
        const over = picking.rows.length > nr || picking.cols.length > nc;
        return (
          <div className={css.pickBar} role="region" aria-label={t('grid.pickStart')}>
            <span>{t('grid.pickNote')}</span>
            {over && <span className={css.pickWarn}>{t('grid.pickKeep')}</span>}
            <button type="button" className={ui.dangerBtn} disabled={!nr && !nc} onClick={async () => {
              const names = [...picking.cols.map((k) => d.cols[k]), ...picking.rows.map((i) => d.rows[i])].filter(Boolean).join('、');
              if (await confirm({ title: t('confirm.manyTitle', { n: nr + nc }), body: `${names}\n\n${t('confirm.rowColBody')}`, ok: t('confirm.delete'), danger: true })) {
                onChange(deleteMany(state, picking.rows, picking.cols));
                setPicking(null);
              }
            }}>{t('grid.pickDelete', { rows: nr, cols: nc })}</button>
            <button type="button" className="btn" onClick={() => setPicking(null)}>{t('grid.pasteCancel')}</button>
          </div>
        );
      })()}
      {long && <p className={css.hint}>{t('grid.longHint')}</p>}
    </div>
  );
}

/**
 * データ欄の見出し。説明（必要なデータの形・取り扱い・貼り付け方）は i、見本のままなら「C 見本のまま」（押すと直し方）
 */
export function DataHead({ title, needs, isSample }: { title: string; needs: string; isSample: boolean }) {
  const t = useT();
  const info = useTip('info', t('data.info'));
  const coach = useTip('coach', t('grid.sample'), t('coach.sample'));
  return (
    <>
      <h2 className={ui.headRow}>{title}{info.button}{isSample && coach.button}</h2>
      {info.panel(<>
        <p className={css.tipLine}>{t('grid.needs', { needs })}</p>
        <p className={css.tipLine}>{t('grid.pasteHint')}</p>
        <p className={css.tipLine}>{t('privacy.dataNote')} <Link href="/privacy" className={ui.linkBtn} target="_blank">{t('privacy.link')}</Link></p>
      </>)}
      {isSample && coach.panel(t('grid.sample'))}
    </>
  );
}
