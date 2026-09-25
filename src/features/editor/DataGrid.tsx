'use client';

import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { rowSum } from '@/engine/transform/matrix';
import { registry } from '@/registry';
import { addCol, addRow, deleteCol, deleteRow, isTabular, parseNumber, parseTable, pasteTsv, renameCol, renameRow, replaceWithTable, setCell, type Tab } from './edit';
import { yearsInColumns } from './project';
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

function NumberCell({ value, label, onCommit, r, c }: { value: number | null; label: string; onCommit: (v: number | null) => void; r: number; c: number }) {
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
  const period = d.periods[tab];
  const yearsAcross = wantsTimeRows && yearsInColumns(d);
  // 要因は行に「始点・要因・終点」、関係は列に「X・Y・大きさ」の役割がある。合計は意味がないので出さない
  const purpose = registry.charts[state.chart].purpose;
  const rowRole = (i: number) => (purpose !== 'contribution' ? null : i === 0 ? t('grid.roleStart') : i === d.rows.length - 1 ? t('grid.roleEnd') : t('grid.roleDriver'));
  const colRole = (k: number) => (purpose !== 'relationship' ? null : [t('grid.roleX'), t('grid.roleY'), t('grid.roleSize')][k] ?? null);
  const showTotal = purpose !== 'contribution' && purpose !== 'relationship';
  const tabName = (k: Tab) => t(k === 'current' ? 'grid.tabCurrent' : 'grid.tabBase', { label: d.periods[k].label });
  const fmt = (n: number) => n.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
  const names = { row: (n: number) => t('grid.newRow', { n }), col: (n: number) => t('grid.newCol', { n }) };

  const onPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLElement;
    if (el.dataset.r == null || el.dataset.c == null) return;
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
        <p className={css.notice}>{t('grid.transposed')}<button type="button" className={css.linkBtn} onClick={() => { onTranspose(); setNotice(null); }}>{t('grid.undo')}</button></p>
      )}
      {yearsAcross && notice == null && (
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
          <textarea id="paste-area" className={css.pasteArea} autoFocus value={pasting} placeholder={t('grid.pastePlaceholder')} onChange={(e) => setPasting(e.target.value)} />
          {parsed ? (
            <p className={css.hint}>
              {t('grid.pasteRead', { rows: parsed.rows.length, cols: parsed.cols.length })}
              {parsed.hasColNames ? t('grid.pasteColNames') : ''}{parsed.hasRowNames ? t('grid.pasteRowNames') : ''}
            </p>
          ) : pasting.trim() ? <p className={css.hint}>{t('grid.pasteNone')}</p> : null}
          <div className={css.actions}>
            <button type="button" className={css.pasteGo} disabled={!parsed} onClick={() => {
              if (!parsed) return;
              const next = replaceWithTable(state, tab, parsed);
              onChange(next);
              setPasting(null);
              // 年が列に並んでいたら、推移のグラフに合わせて行と列を入れ替える（元に戻せる）
              if (wantsTimeRows && yearsInColumns(next.dataset)) { onTranspose(); setNotice('transposed'); } else setNotice(null);
            }}>
              {baseVisible ? t('grid.pasteReplace', { tab: tabName(tab) }) : t('grid.pasteReplaceOne')}
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
                    <input className={css.cell} aria-label={t('grid.colName', { n: k + 1 })} data-r={-1} data-c={k} value={name} onKeyDown={moveOnEnter} onChange={(e) => onChange(renameCol(state, k, e.target.value))} />
                    {d.cols.length > 2 && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={() => onChange(deleteCol(state, k))}>×</button>
                    )}
                  </div>
                </th>
              ))}
              {showTotal && <th scope="col" className={css.total}>{t('grid.total')}</th>}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((name, i) => (
              <tr key={i}>
                <td>
                  <div className={css.cellwrap}>
                    {d.rows.length > 2 && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={() => onChange(deleteRow(state, i))}>×</button>
                    )}
                    {rowRole(i) && <span className={css.role}>{rowRole(i)}</span>}
                    <input className={`${css.cell} ${css.name}`} aria-label={t('grid.rowName', { n: i + 1 })} data-r={i} data-c={-1} value={name} onKeyDown={moveOnEnter} onChange={(e) => onChange(renameRow(state, i, e.target.value))} />
                  </div>
                </td>
                {d.cols.map((col, k) => (
                  <td key={k}>
                    <NumberCell
                      r={i} c={k}
                      value={period.values[i]?.[k] ?? null}
                      label={t('grid.cellLabel', { row: name, col })}
                      onCommit={(v) => onChange(setCell(state, tab, i, k, v))}
                    />
                  </td>
                ))}
                {showTotal && <td className={css.total}>{fmt(rowSum(period.values[i]))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={css.actions}>
        <button type="button" className="btn" onClick={() => onChange(addRow(state, names.row(d.rows.length + 1)))}>{t('grid.addRow')}</button>
        <button type="button" className="btn" onClick={() => onChange(addCol(state, names.col(d.cols.length + 1)))}>{t('grid.addCol')}</button>
        <button type="button" className="btn" onClick={() => { onTranspose(); setNotice(null); }}>{t('grid.transpose')}</button>
      </div>
      <p className={css.hint}>{t('grid.pasteHint')}</p>
    </div>
  );
}
