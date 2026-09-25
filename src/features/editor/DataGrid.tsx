'use client';

import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { rowSum } from '@/engine/transform/matrix';
import { registry } from '@/registry';
import { addCol, addRow, deleteCol, deleteRow, isTabular, parseNumber, parseTable, pasteTsv, renameCol, renameRow, replaceWithTable, setCell, setGroup, type Tab } from './edit';
import { yearsInColumns } from './project';
import { applyLong, defaultPivot, detectLong, swapLong, tableToTsv } from './long';
import { LongPanel } from './LongPanel';
import { CopyButton } from './CopyButton';
import { hasBase, type BuilderState } from './state';
import css from './grid.module.css';

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
  /** 今のスライドに必要なデータの一文 */
  needs: string;
  /** データが見本のまま */
  isSample: boolean;
  /** 推移のスライドがある（年が列に並んでいたら行と列を入れ替える） */
  wantsTimeRows: boolean;
  onTranspose: () => void;
};

export function DataGrid({ state, onChange, showBase, needs, isSample, wantsTimeRows, onTranspose }: Props) {
  const t = useT();
  const locale = useLocale();
  const [tabRaw, setTab] = useState<Tab>('current');
  const [baseOpen, setBaseOpen] = useState(false);
  const [notice, setNotice] = useState<'transposed' | null>(null);
  const baseVisible = showBase || baseOpen;
  const tab: Tab = baseVisible ? tabRaw : 'current';
  const [pasting, setPasting] = useState<string | null>(null);
  const parsed = pasting ? parseTable(pasting) : null;
  const d = state.dataset;
  const long = d.long;
  const period = d.periods[tab];
  const yearsAcross = wantsTimeRows && yearsInColumns(d);
  // 要因は行に「始点・要因・終点」、関係は列に「X・Y・大きさ」の役割がある。合計は意味がないので出さない
  const purpose = registry.charts[state.chart].purpose;
  const rowRole = (i: number) => (purpose !== 'contribution' ? null : i === 0 ? t('grid.roleStart') : i === d.rows.length - 1 ? t('grid.roleEnd') : t('grid.roleDriver'));
  const xySwap = state.controls.xy_swap === 'swapped';
  const colRole = (k: number) => (purpose !== 'relationship' ? null : [xySwap ? t('grid.roleY') : t('grid.roleX'), xySwap ? t('grid.roleX') : t('grid.roleY'), state.chart === 'bubble' ? t('grid.roleSize') : t('grid.roleUnused')][k] ?? t('grid.roleUnused'));
  const showGroup = purpose === 'relationship';
  const showTotal = purpose !== 'contribution' && purpose !== 'relationship' && d.unit !== '%';
  // 縦長の表は、推移・比較・構成の表（行×列）でだけ読む
  const longPaste = pasting && purpose !== 'contribution' && purpose !== 'relationship' ? detectLong(pasting, { melt: t('long.meltName'), value: t('long.valueName') }) : null;
  const transpose = () => (long ? onChange(swapLong(state)) : onTranspose());
  const tabName = (k: Tab) => t(k === 'current' ? 'grid.tabCurrent' : 'grid.tabBase', { label: d.periods[k].label });
  const fmt = (n: number) => n.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
  const names = { row: (n: number) => t('grid.newRow', { n }), col: (n: number) => t('grid.newCol', { n }) };

  const onPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLElement;
    if (el.dataset.r == null || el.dataset.c == null || long) return;
    const text = e.clipboardData.getData('text');
    if (!isTabular(text)) return;
    e.preventDefault();
    onChange(pasteTsv(state, tab, Number(el.dataset.r), Number(el.dataset.c), text, names));
  };

  return (
    <div>
      <p className={css.needs}>{t('grid.needs', { needs })}</p>
      {isSample && <p className={css.sample}>{t('grid.sample')}</p>}
      {notice === 'transposed' && (
        <p className={css.notice}>{t('grid.transposed')}<button type="button" className={css.linkBtn} onClick={() => { transpose(); setNotice(null); }}>{t('grid.undo')}</button></p>
      )}
      {long && <LongPanel state={state} onChange={onChange} needsBase={showBase} />}
      {yearsAcross && !long && notice == null && (
        <p className={css.warn}>{t('grid.yearsAcross')}<button type="button" className={css.linkBtn} onClick={() => { onTranspose(); setNotice('transposed'); }}>{t('grid.transpose')}</button></p>
      )}
      <div className={css.tabs} role={baseVisible ? 'tablist' : undefined}>
        {baseVisible && (['current', 'base'] as const).map((k) => (
          <button key={k} type="button" role="tab" className={css.tab} aria-selected={tab === k} onClick={() => setTab(k)}>{tabName(k)}</button>
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
          {parsed && !longPaste ? (
            <p className={css.hint}>
              {t('grid.pasteRead', { rows: parsed.rows.length, cols: parsed.cols.length })}
              {parsed.hasColNames ? t('grid.pasteColNames') : ''}{parsed.hasRowNames ? t('grid.pasteRowNames') : ''}
            </p>
          ) : pasting.trim() && !parsed ? <p className={css.hint}>{t('grid.pasteNone')}</p> : null}
          <div className={css.actions}>
            {longPaste && (
              <button type="button" className={css.pasteGo} onClick={() => {
                onChange(applyLong(state, longPaste, defaultPivot(longPaste)));
                setPasting(null);
                setNotice(null);
              }}>{t('grid.longRead')}</button>
            )}
            <button type="button" className={longPaste ? 'btn' : css.pasteGo} disabled={!parsed} onClick={() => {
              if (!parsed) return;
              const next = replaceWithTable(state, tab, parsed, { groupsFromText: purpose === 'relationship' });
              onChange(next);
              setPasting(null);
              // 年が列に並んでいたら、推移のグラフに合わせて行と列を入れ替える（元に戻せる）
              if (wantsTimeRows && yearsInColumns(next.dataset)) { onTranspose(); setNotice('transposed'); } else setNotice(null);
            }}>
              {longPaste ? t('grid.longAsWide') : baseVisible ? t('grid.pasteReplace', { tab: tabName(tab) }) : t('grid.pasteReplaceOne')}
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
                <th scope="col" key={k}>
                  <div className={css.cellwrap}>
                    {colRole(k) && <span className={css.role}>{colRole(k)}</span>}
                    <input className={css.cell} aria-label={t('grid.colName', { n: k + 1 })} data-r={-1} data-c={k} value={name} readOnly={!!long} onKeyDown={moveOnEnter} onChange={(e) => onChange(renameCol(state, k, e.target.value))} />
                    {d.cols.length > 2 && !long && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={() => onChange(deleteCol(state, k))}>×</button>
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
                <td>
                  <div className={css.cellwrap}>
                    {d.rows.length > 2 && !long && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={() => onChange(deleteRow(state, i))}>×</button>
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
        <button type="button" className="btn" onClick={() => { transpose(); setNotice(null); }}>{t('grid.transpose')}</button>
        <CopyButton text={() => tableToTsv(d, tab)} label={t('grid.copy')} />
      </div>
      <p className={css.hint}>{long ? t('grid.longHint') : t('grid.pasteHint')}</p>
    </div>
  );
}
