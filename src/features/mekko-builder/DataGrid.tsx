'use client';

import { useState, type ClipboardEvent } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { rowSum } from '@/engine/transform/matrix';
import { addCol, addRow, deleteCol, deleteRow, isTabular, parseNumber, pasteTsv, renameCol, renameRow, setCell, type Tab } from './edit';
import type { BuilderState } from './state';
import css from './grid.module.css';

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
      onFocus={() => setDraft(value == null ? '' : String(value))}
      onChange={(e) => { setDraft(e.target.value); onCommit(parseNumber(e.target.value)); }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function DataGrid({ state, onChange }: { state: BuilderState; onChange: (s: BuilderState) => void }) {
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('current');
  const d = state.dataset;
  const period = d.periods[tab];
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
      <div className={css.tabs} role="tablist">
        {(['current', 'base'] as const).map((k) => (
          <button key={k} type="button" role="tab" className={css.tab} aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(k === 'current' ? 'grid.tabCurrent' : 'grid.tabBase', { label: d.periods[k].label })}
          </button>
        ))}
      </div>
      <div className={css.scroll}>
        <table className={css.grid} onPaste={onPaste}>
          <thead>
            <tr>
              <th scope="col" className={css.corner}>{d.dimensions?.rows ?? ''}</th>
              {d.cols.map((name, k) => (
                <th scope="col" key={k}>
                  <div className={css.cellwrap}>
                    <input className={css.cell} aria-label={t('grid.colName', { n: k + 1 })} value={name} onChange={(e) => onChange(renameCol(state, k, e.target.value))} />
                    {d.cols.length > 2 && (
                      <button type="button" className={css.del} aria-label={t('grid.delete', { name })} onClick={() => onChange(deleteCol(state, k))}>×</button>
                    )}
                  </div>
                </th>
              ))}
              <th scope="col" className={css.total}>{t('grid.total')}</th>
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
                    <input className={`${css.cell} ${css.name}`} aria-label={t('grid.rowName', { n: i + 1 })} data-r={i} data-c={-1} value={name} onChange={(e) => onChange(renameRow(state, i, e.target.value))} />
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
                <td className={css.total}>{fmt(rowSum(period.values[i]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={css.actions}>
        <button type="button" className="btn" onClick={() => onChange(addRow(state, names.row(d.rows.length + 1)))}>{t('grid.addRow')}</button>
        <button type="button" className="btn" onClick={() => onChange(addCol(state, names.col(d.cols.length + 1)))}>{t('grid.addCol')}</button>
      </div>
      <p className={css.hint}>{t('grid.pasteHint')}</p>
    </div>
  );
}
