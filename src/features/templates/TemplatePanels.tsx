'use client';

import { useState, type ClipboardEvent } from 'react';
import { CONCLUSION_LIMITS, EXEC_BLOCKS, EXEC_LIMITS, IIA_COLS, IIA_LIMITS, KPI_LIMITS, NEXT_LIMITS, NEXT_STATUS, NEXT_STATUS_IDS, NUM_LIMITS, BULLET_LIMITS, TWO_COL_LIMITS, type TwoColId, localize, type NextStatus, type ExecBlockId, type IiaColId } from '@/registry';
import type { ComparisonContent, ComparisonLook, ConclusionContent, ConclusionLook, DeltaContent, DeltaLook, Emphasis, HeatLook, IiaContent, IiaLook, NumbersContent, NumbersLook, NextContent, NextLook, BasicLook, BulletsContent, BulletsLook, TwoColContent, TwoColLook, ExecContent, ExecLook, GoodDirection, KpiContent, KpiLook, NumberKind, TextAlign } from '@/engine/layout/templates';
import { activeFormat, deltaText, heatColor, kpiDelta, lineDir, lineLabel, rowDelta, usesDirs } from '@/engine/layout/templates';
import { useLocale, useT } from '@/i18n/ui';
import { TitleField } from '../editor/SlideFields';
import { Fold } from '../editor/Fold';
import type { BuilderState } from '../editor/state';
import {
  addCol, addReason, addRow, defaultComparisonLook, defaultConclusionLook, emptyConclusion, moveCol, moveReason, moveRow, pasteCells,
  removeCol, removeReason, removeRow, sampleComparison, setCell, setFormat, updateReason,
  KPI_FIELDS, addKpi, defaultKpiLook, moveKpi, pasteKpis, removeKpi, sampleKpi, updateKpi, type KpiField,
  DELTA_FIELDS, addDeltaRow, defaultDeltaLook, moveDeltaRow, pasteDeltaRows, removeDeltaRow, sampleDelta, updateDeltaRow, type DeltaField,
  addTwoItem, defaultTwoColLook, emptyTwoCol, moveTwoItem, removeTwoItem, swapTwoCols, updateTwoCol, updateTwoItem,
  addBullet, defaultBulletsLook, emptyBullets, moveBullet, removeBullet, updateBullet, defaultBasicLook,
  addAction, defaultNextLook, emptyNext, importActions, moveAction, removeAction, updateAction,
  addNumber, defaultNumbersLook, emptyNumbers, moveNumber, removeNumber, updateNumber,
  defaultHeatLook, addIiaItem, defaultIiaLook, emptyIia, insertIiaMessages, moveIiaItem, removeIiaItem, updateIiaCol, updateIiaItem,
  editSharedTable, type Table, defaultExecLook, draftExtras, draftFromMessages, emptyExec, insertFreeMessages, insertMessages, setExecMode, updateBlock, updateFree, type RelatedSlide,
} from './content';
import { isPlaceholderTitle } from '../editor/leftovers';
import css from '../ui.module.css';
import tp from './templates.module.css';

type Up = (patch: Partial<BuilderState>) => void;

const len = (s: string) => [...s.trim()].length;

/** 文字数（目安を超えたら色を変える。切りはしない） */
function Count({ text, max }: { text: string; max: number }) {
  const n = len(text);
  return <span className={`${tp.count} ${n > max ? tp.over : ''}`}>{n} / {max}</span>;
}

/** 文字の揃え（左・中央・右。表は「自動」も） */
function AlignField<A extends string>({ value, options, onChange, note }: { value: A; options: A[]; onChange: (v: A) => void; note?: string }) {
  const t = useT();
  return (
    <div className={css.field}>
      <span>{t('tpl.align')}</span>
      <div className={css.seg} role="group" aria-label={t('tpl.align')}>
        {options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>{t(`tpl.align.${o}` as 'tpl.align.left')}</button>)}
      </div>
      {note && value === 'auto' && <p className={css.note}>{note}</p>}
    </div>
  );
}

/** 相談文から読み取って入れた中身の知らせ（読み違いがあり得るので、確かめてもらう）。スライドには出さない */
function FromConsultation({ onDone }: { onDone: () => void }) {
  const t = useT();
  return (
    <p className={tp.fromConsult} role="note">
      <span>{t('tpl.fromConsultation')}</span>
      <button type="button" className={css.linkBtn} onClick={onDone}>{t('tpl.fromConsultationOk')}</button>
    </p>
  );
}

// ──────────── 比較表 ────────────

/** 表の文字の揃え：左・中央・右（初めは中央。前に「自動」で保存したものも中央） */
const tableAlign = (a: TextAlign | 'auto' | undefined): TextAlign => (a && a !== 'auto' ? a : 'center');

/** 記号の評価（空 → ◎ → ○ → △ → × → 空） */
const RATING_CYCLE = ['', '◎', '○', '△', '×'];
const nextRating = (v: string) => RATING_CYCLE[(RATING_CYCLE.indexOf(v.trim()) + 1) % RATING_CYCLE.length]!;

const tableOf = (s: BuilderState) => ({
  content: s.content?.comparison ?? sampleComparison(s.slideLocale),
  look: s.look?.comparison ?? defaultComparisonLook(),
});
const putTable = (s: BuilderState, t: { content: ComparisonContent; look: ComparisonLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, comparison: t.content }, look: { ...s.look, comparison: t.look } });

/** 中央の下：比較表の中身（貼り付け・セルの編集・行と列の追加・削除・並べ替え） */
function ComparisonEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const tb = tableOf(s);
  const c = tb.content;
  const w = Math.max(1, ...c.cells.map((r) => r.length));
  const h = c.cells.length;
  // 中身は比較表・ヒートマップ・基本表で共有。行・列の操作は、基本表の数の形の位置も一緒に動かす
  const edit = (op: (x: Table) => Table) => update(editSharedTable(s.content ?? {}, s.look ?? {}, tb, op));
  const setContent = (patch: Partial<ComparisonContent>) => edit((x) => ({ ...x, content: { ...x.content, ...patch } }));
  const onPaste = (r: number, k: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    edit((x) => pasteCells(x, r, k, text));
  };
  const basic = s.view === 'STORY_TABLE_BASIC';
  const [rating, setRating] = useState(false);
  const head = (r: number, k: number) => (c.headerRow && r === 0) || (c.headerCol && k === 0);
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <label className={css.field}>
        <span>{t('tpl.table.lead')}</span>
        <input className={css.input} value={c.lead} placeholder={t('tpl.table.leadPlaceholder')} onChange={(e) => setContent({ lead: e.target.value })} />
      </label>
      <p className={tp.lead}>{t(basic ? 'tpl.basic.pasteHint' : 'tpl.table.pasteHint')}</p>
      {c.fromConsultation && <FromConsultation onDone={() => setContent({ fromConsultation: false })} />}
      <div className={tp.toggles}>
        <label><input type="checkbox" checked={c.headerRow} onChange={(e) => setContent({ headerRow: e.target.checked })} />{t(basic ? 'tpl.basic.headerRow' : 'tpl.table.headerRow')}</label>
        <label><input type="checkbox" checked={c.headerCol} onChange={(e) => setContent({ headerCol: e.target.checked })} />{t(basic ? 'tpl.basic.headerCol' : 'tpl.table.headerCol')}</label>
      </div>
      <div className={tp.gridWrap}>
        <table className={tp.grid}>
          <thead>
            <tr>
              <td className={tp.corner} />
              {Array.from({ length: w }, (_, k) => (
                <td key={k} className={tp.ctl}>
                  <button type="button" aria-label={t('tpl.table.colLeft', { n: k + 1 })} disabled={k === 0} onClick={() => edit((x) => moveCol(x, k, -1))}>←</button>
                  <button type="button" aria-label={t('tpl.table.colRight', { n: k + 1 })} disabled={k === w - 1} onClick={() => edit((x) => moveCol(x, k, 1))}>→</button>
                  <button type="button" aria-label={t('tpl.table.colRemove', { n: k + 1 })} disabled={w <= 1} onClick={() => edit((x) => removeCol(x, k))}>×</button>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.cells.map((row, r) => (
              <tr key={r}>
                <td className={tp.ctl}>
                  <button type="button" aria-label={t('tpl.table.rowUp', { n: r + 1 })} disabled={r === 0} onClick={() => edit((x) => moveRow(x, r, -1))}>↑</button>
                  <button type="button" aria-label={t('tpl.table.rowDown', { n: r + 1 })} disabled={r === h - 1} onClick={() => edit((x) => moveRow(x, r, 1))}>↓</button>
                  <button type="button" aria-label={t('tpl.table.rowRemove', { n: r + 1 })} disabled={h <= 1} onClick={() => edit((x) => removeRow(x, r))}>×</button>
                </td>
                {Array.from({ length: w }, (_, k) => (
                  <td key={k} className={head(r, k) ? tp.headCell : undefined}>
                    {rating && !head(r, k) && RATING_CYCLE.includes((row[k] ?? '').trim()) ? (
                      // 記号で評価：押すたびに ◎ → ○ → △ → × → 空（推測では埋めない。入力の手間だけ減らす）
                      <button type="button" className={tp.rateCell} aria-label={t('tpl.table.rateCell', { r: r + 1, c: k + 1, v: (row[k] ?? '').trim() || t('tpl.table.rateEmpty') })}
                        onClick={() => edit((x) => setCell(x, r, k, nextRating(row[k] ?? '')))}>{(row[k] ?? '').trim() || '·'}</button>
                    ) : (
                      <input aria-label={t('tpl.table.cell', { r: r + 1, c: k + 1 })} value={row[k] ?? ''} onChange={(e) => edit((x) => setCell(x, r, k, e.target.value))} onPaste={onPaste(r, k)} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={tp.actions}>
        {!basic && (
          <label className={tp.rateToggle}><input type="checkbox" checked={rating} onChange={(e) => setRating(e.target.checked)} />{t('tpl.table.rateMode')}</label>
        )}
        <button type="button" className="btn" onClick={() => edit((x) => addRow(x))}>{t('tpl.table.addRow')}</button>
        <button type="button" className="btn" onClick={() => edit((x) => addCol(x))}>{t('tpl.table.addCol')}</button>
      </div>
      <label className={css.field}>
        <span>{t('tpl.table.note')}</span>
        <input className={css.input} value={c.note} placeholder={t('tpl.table.notePlaceholder')} onChange={(e) => setContent({ note: e.target.value })} />
      </label>
      <label className={css.field}>
        <span>{t('tpl.source')}</span>
        <input className={css.input} value={s.source} placeholder={t('leftover.sourcePlaceholder')} onChange={(e) => update({ source: e.target.value })} />
      </label>
    </div>
  );
}

/** 右：比較表の見せ方（強調・表示・数の形） */
function ComparisonLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const tb = tableOf(s);
  const { content: c, look } = tb;
  const setLook = (patch: Partial<ComparisonLook>) => update(putTable(s, { ...tb, look: { ...look, ...patch } }));
  const w = Math.max(1, ...c.cells.map((r) => r.length));
  const rows = c.cells.map((_, i) => i).filter((i) => !(c.headerRow && i === 0));
  const cols = Array.from({ length: w }, (_, j) => j).filter((j) => !(c.headerCol && j === 0));
  const rowName = (i: number) => (c.headerCol ? c.cells[i]?.[0]?.trim() : '') || t('tpl.table.rowN', { n: i + 1 });
  const colName = (j: number) => (c.headerRow ? c.cells[0]?.[j]?.trim() : '') || t('tpl.table.colN', { n: j + 1 });
  const e = look.emphasis;
  const setEmphasis = (kind: Emphasis['kind']) => setLook({
    emphasis: kind === 'none' ? { kind } : kind === 'col' ? { kind, index: cols[0] ?? 0 } : kind === 'row' ? { kind, index: rows[0] ?? 0 } : { kind, row: rows[0] ?? 0, col: cols[0] ?? 0 },
  });
  const check = (key: 'showLead' | 'showSource' | 'rowLines' | 'headerFill') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.table.${key}`)}</label>
  );
  return (
    <>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <div className={css.field}>
          <select className={css.select} aria-label={t('tpl.emphasis')} value={e.kind} onChange={(ev) => setEmphasis(ev.target.value as Emphasis['kind'])}>
            {(['none', 'col', 'row', 'cell'] as const).map((k) => <option key={k} value={k}>{t(`tpl.table.emphasis.${k}`)}</option>)}
          </select>
        </div>
        {e.kind === 'col' && (
          <select className={css.select} aria-label={t('tpl.table.emphasis.col')} value={e.index} onChange={(ev) => setLook({ emphasis: { kind: 'col', index: Number(ev.target.value) } })}>
            {cols.map((j) => <option key={j} value={j}>{colName(j)}</option>)}
          </select>
        )}
        {e.kind === 'row' && (
          <select className={css.select} aria-label={t('tpl.table.emphasis.row')} value={e.index} onChange={(ev) => setLook({ emphasis: { kind: 'row', index: Number(ev.target.value) } })}>
            {rows.map((i) => <option key={i} value={i}>{rowName(i)}</option>)}
          </select>
        )}
        {e.kind === 'cell' && (
          <div className={tp.pair}>
            <select className={css.select} aria-label={t('tpl.table.emphasis.row')} value={e.row} onChange={(ev) => setLook({ emphasis: { ...e, row: Number(ev.target.value) } })}>
              {rows.map((i) => <option key={i} value={i}>{rowName(i)}</option>)}
            </select>
            <select className={css.select} aria-label={t('tpl.table.emphasis.col')} value={e.col} onChange={(ev) => setLook({ emphasis: { ...e, col: Number(ev.target.value) } })}>
              {cols.map((j) => <option key={j} value={j}>{colName(j)}</option>)}
            </select>
          </div>
        )}
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={tableAlign(look.align)} options={['left', 'center', 'right']} onChange={(align) => setLook({ align })} />
        {check('showLead')}{check('showSource')}{check('rowLines')}{check('headerFill')}
      </Fold>
      <FormatsFold c={c} look={look} setLook={setLook} slideLocale={s.slideLocale} />
    </>
  );
}

/** 数の形（行ごと・列ごと）。比較表とヒートマップで共有（同じ表なので、数の形も同じ） */
function FormatsFold({ c, look, setLook, slideLocale }: {
  c: ComparisonContent; look: Pick<ComparisonLook, 'formatAxis' | 'formats'>;
  setLook: (patch: Partial<Pick<ComparisonLook, 'formatAxis' | 'formats'>>) => void; slideLocale: BuilderState['slideLocale'];
}) {
  const t = useT();
  const w = Math.max(1, ...c.cells.map((r) => r.length));
  const rows = c.cells.map((_, i) => i).filter((i) => !(c.headerRow && i === 0));
  const cols = Array.from({ length: w }, (_, j) => j).filter((j) => !(c.headerCol && j === 0));
  const rowName = (i: number) => (c.headerCol ? c.cells[i]?.[0]?.trim() : '') || t('tpl.table.rowN', { n: i + 1 });
  const colName = (j: number) => (c.headerRow ? c.cells[0]?.[j]?.trim() : '') || t('tpl.table.colN', { n: j + 1 });
  const lines = look.formatAxis === 'row' ? rows : cols;
  const kinds: NumberKind[] = ['auto', 'int', 'dec', 'pct', 'currency'];
  return (
    <Fold id="tplNumbers" title={t('tpl.numbers')}>
      <div className={css.field}>
        <span>{t('tpl.table.formatAxis')}</span>
        <div className={css.seg} role="group" aria-label={t('tpl.table.formatAxis')}>
          {(['row', 'col'] as const).map((a) => (
            <button key={a} type="button" aria-pressed={look.formatAxis === a} onClick={() => setLook({ formatAxis: a, formats: {} })}>{t(`tpl.table.axis.${a}`)}</button>
          ))}
        </div>
      </div>
      <div className={tp.fmtList}>
        {lines.map((k) => {
          // 見出しが変わった行・列の古い数の形は使わない（入れたまま、から選び直す）
          const f = activeFormat(c, look, k) ?? { kind: 'auto' as const };
          const name = look.formatAxis === 'row' ? rowName(k) : colName(k);
          const key = lineLabel(c, look.formatAxis, k);
          return (
            <div key={k} className={tp.fmtRow}>
              <span title={name}>{name}</span>
              <select className={css.select} aria-label={t('tpl.table.formatOf', { name })} value={f.kind} onChange={(ev) => {
                const kind = ev.target.value as NumberKind;
                setLook({ formats: setFormat(look, k, { ...f, kind, key, ...(kind === 'currency' && !f.symbol ? { symbol: slideLocale === 'en' ? '$' : '¥' } : {}) }).formats });
              }}>
                {kinds.map((x) => <option key={x} value={x}>{t(`tpl.fmt.${x}`)}</option>)}
              </select>
              <input className={css.input} aria-label={t('tpl.table.unitOf', { name })} placeholder={t('tpl.table.unit')} value={f.unit ?? ''} onChange={(ev) => setLook({ formats: setFormat(look, k, { ...f, key, unit: ev.target.value }).formats })} />
            </div>
          );
        })}
      </div>
      <p className={css.note}>{t('tpl.table.formatNote')}</p>
      {Object.keys(look.formats).length > 0 && <button type="button" className={css.linkBtn} onClick={() => setLook({ formats: {} })}>{t('tpl.table.formatClear')}</button>}
    </Fold>
  );
}

// ──────────── ヒートマップ型の表（中身・数の形は比較表と共有） ────────────

function HeatLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const tb = tableOf(s);
  const look = s.look?.heatmap ?? defaultHeatLook(tb.look);
  const setLook = (patch: Partial<HeatLook>) => update({ look: { ...s.look, heatmap: { ...look, ...patch } } });
  const setTableLook = (patch: Partial<ComparisonLook>) => update(putTable(s, { ...tb, look: { ...tb.look, ...patch } }));
  const check = (key: 'showLegend' | 'showLead' | 'showSource' | 'rowLines' | 'headerFill') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(key === 'showLegend' ? 'tpl.heat.showLegend' : `tpl.table.${key}`)}</label>
  );
  return (
    <>
      <Fold id="tplHeat" title={t('tpl.heat.color')}>
        <div className={css.field}>
          <span>{t('tpl.heat.scale')}</span>
          <div className={css.seg} role="group" aria-label={t('tpl.heat.scale')}>
            {(['row', 'col', 'all'] as const).map((k) => <button key={k} type="button" aria-pressed={look.scale === k} onClick={() => setLook({ scale: k })}>{t(`tpl.heat.scale.${k}`)}</button>)}
          </div>
        </div>
        <div className={css.field}>
          <span>{t('tpl.heat.palette')}</span>
          <div className={tp.swatches} role="radiogroup" aria-label={t('tpl.heat.palette')}>
            {(['navy', 'sky', 'teal', 'amber'] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={(look.palette ?? 'navy') === p} className={tp.swatch} onClick={() => setLook({ palette: p })}>
                <span className={tp.ramp} style={{ background: `linear-gradient(90deg, ${heatColor(0, false, p)}, ${heatColor(0.5, false, p)}, ${heatColor(1, false, p)})` }} />
                <span>{t(`tpl.heat.palette.${p}`)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={css.field}>
          <span>{t(usesDirs(look) ? 'tpl.heat.directionBase' : 'tpl.heat.direction')}</span>
          <select className={css.select} value={look.direction} onChange={(e) => setLook({ direction: e.target.value as HeatLook['direction'] })}>
            {(['high', 'low', 'diverging'] as const).map((d) => <option key={d} value={d}>{t(`tpl.heat.direction.${d}`)}</option>)}
          </select>
        </div>
        {usesDirs(look) && (() => {
          // 行ごと（列ごと）の良い向き：売上は大きいほど良い、コストは小さいほど良い、など
          const c = tb.content;
          const axis = look.scale === 'col' ? 'col' : 'row';
          const w = Math.max(1, ...c.cells.map((r) => r.length));
          const lines = axis === 'row' ? c.cells.map((_, i) => i).filter((i) => !(c.headerRow && i === 0)) : Array.from({ length: w }, (_, j) => j).filter((j) => !(c.headerCol && j === 0));
          const base = look.direction === 'low' ? 'down' : 'up';
          return (
            <div className={css.field}>
              <span>{t(`tpl.heat.dirs.${axis}`)}</span>
              <div className={tp.fmtList}>
                {lines.map((k) => {
                  const name = lineLabel(c, axis, k) || t(axis === 'row' ? 'tpl.table.rowN' : 'tpl.table.colN', { n: k + 1 });
                  return (
                    <div key={k} className={tp.fmtRow2}>
                      <span title={name}>{name}</span>
                      <select className={css.select} aria-label={t('tpl.heat.dirOf', { name })} value={lineDir(c, look, k) ?? base}
                        onChange={(e) => setLook({ dirs: { ...(look.dirs ?? {}), [String(k)]: { good: e.target.value as GoodDirection, key: lineLabel(c, axis, k) } } })}>
                        {(['up', 'down', 'none'] as const).map((g) => <option key={g} value={g}>{t(`tpl.heat.dir.${g}`)}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <p className={css.note}>{t('tpl.heat.note')}</p>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={tableAlign(look.align)} options={['left', 'center', 'right']} onChange={(align) => setLook({ align })} />
        {check('showLegend')}{check('showLead')}{check('showSource')}{check('rowLines')}{check('headerFill')}
      </Fold>
      <FormatsFold c={tb.content} look={tb.look} setLook={setTableLook} slideLocale={s.slideLocale} />
    </>
  );
}

// ──────────── 基本表（中身・数の形は比較表と共有） ────────────

function BasicLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const tb = tableOf(s);
  const look = s.look?.basic ?? defaultBasicLook(tb.look);
  const setLook = (patch: Partial<BasicLook>) => update({ look: { ...s.look, basic: { ...look, ...patch } } });
  const check = (key: 'showLead' | 'showSource' | 'rowLines' | 'headerFill') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.table.${key}`)}</label>
  );
  return (
    <>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={tableAlign(look.align)} options={['left', 'center', 'right']} onChange={(align) => setLook({ align })} />
        {check('showLead')}{check('showSource')}{check('rowLines')}{check('headerFill')}
      </Fold>
      {/* 数の形は基本表だけのもの（比較表とは別） */}
      <FormatsFold c={tb.content} look={look} setLook={setLook} slideLocale={s.slideLocale} />
    </>
  );
}

// ──────────── KPI スコアカード ────────────

const kpiOf = (s: BuilderState) => ({ content: s.content?.kpi ?? sampleKpi(s.slideLocale), look: s.look?.kpi ?? defaultKpiLook() });
const putKpi = (s: BuilderState, x: { content: KpiContent; look: KpiLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, kpi: x.content }, look: { ...s.look, kpi: x.look } });

/** 中央の下：KPI ごとに 指標名・今の値・単位・対象期間・比較の値・比較基準・良い向き。増減はアプリが計算して見せる */
function KpiEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = kpiOf(s);
  const c = x.content;
  const set = (next: { content: KpiContent; look: KpiLook }) => update(putKpi(s, next));
  const setContent = (content: KpiContent) => set({ ...x, content });
  const onPaste = (i: number, f: KpiField) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    setContent(pasteKpis(c, i, f, text));
  };
  const field = (i: number, f: KpiField) => (
    <label className={tp.kpiField} data-f={f}>
      <span>{t(`tpl.kpi.${f}`)}</span>
      <input className={css.input} value={c.kpis[i]![f]} placeholder={t(`tpl.kpi.${f}Placeholder`)}
        onChange={(e) => setContent(updateKpi(c, i, { [f]: e.target.value }))} onPaste={onPaste(i, f)} />
    </label>
  );
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <p className={tp.lead}>{t('tpl.kpi.hint')}</p>
      {c.fromConsultation && <FromConsultation onDone={() => setContent({ ...c, fromConsultation: false })} />}
      {c.kpis.map((k, i) => {
        const d = kpiDelta(k, x.look.formats[k.id]);
        return (
          <section key={k.id} className={tp.reason} aria-label={t('tpl.kpi.n', { n: i + 1 })}>
            <div className={tp.reasonHead}>
              <b>{t('tpl.kpi.n', { n: i + 1 })}</b>
              <span className={tp.reasonTools}>
                <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => setContent(moveKpi(c, i, -1))}>↑</button>
                <button type="button" aria-label={t('story.downLabel')} disabled={i === c.kpis.length - 1} onClick={() => setContent(moveKpi(c, i, 1))}>↓</button>
                <button type="button" disabled={c.kpis.length <= 1} onClick={() => set(removeKpi(c, x.look, i))}>{t('tpl.text.remove')}</button>
              </span>
            </div>
            <div className={tp.kpiGrid}>
              {KPI_FIELDS.map((f) => <span key={f} className={tp.kpiCell} data-f={f}>{field(i, f)}</span>)}
              <label className={tp.kpiField} data-f="good">
                <span>{t('tpl.kpi.good')}</span>
                <select className={css.select} value={k.good} onChange={(e) => setContent(updateKpi(c, i, { good: e.target.value as GoodDirection }))}>
                  {(['up', 'down', 'none'] as const).map((g) => <option key={g} value={g}>{t(`tpl.kpi.good.${g}`)}</option>)}
                </select>
              </label>
            </div>
            <p className={tp.lead}>{d ? t('tpl.kpi.deltaNow', { delta: deltaText(k, d, x.look.delta, (n) => (Number.isInteger(Math.round(n * 100) / 100) ? 0 : 1)) }) : t('tpl.kpi.deltaNone')}</p>
          </section>
        );
      })}
      {c.kpis.length < KPI_LIMITS.input && <div className={tp.actions}><button type="button" className="btn" onClick={() => setContent(addKpi(c))}>{t('tpl.kpi.add')}</button></div>}
      <label className={css.field}>
        <span>{t('tpl.kpi.note')}</span>
        <input className={css.input} value={c.note} placeholder={t('tpl.kpi.notePlaceholder')} onChange={(e) => setContent({ ...c, note: e.target.value })} />
      </label>
      <label className={css.field}>
        <span>{t('tpl.source')}</span>
        <input className={css.input} value={s.source} placeholder={t('leftover.sourcePlaceholder')} onChange={(e) => update({ source: e.target.value })} />
      </label>
    </div>
  );
}

function KpiLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = kpiOf(s);
  const look = x.look;
  const setLook = (patch: Partial<KpiLook>) => update(putKpi(s, { ...x, look: { ...look, ...patch } }));
  const kinds: NumberKind[] = ['auto', 'int', 'dec', 'pct', 'currency'];
  const check = (key: 'showPeriod' | 'showBasis' | 'showDelta') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.kpi.${key}`)}</label>
  );
  const name = (i: number) => x.content.kpis[i]!.name.trim() || t('tpl.kpi.n', { n: i + 1 });
  return (
    <>
      <Fold id="tplKpiDelta" title={t('tpl.kpi.delta')}>
        <div className={css.seg} role="group" aria-label={t('tpl.kpi.delta')}>
          {(['pct', 'diff', 'both'] as const).map((m) => <button key={m} type="button" aria-pressed={look.delta === m} onClick={() => setLook({ delta: m })}>{t(`tpl.kpi.delta.${m}`)}</button>)}
        </div>
        <p className={css.note}>{t('tpl.kpi.deltaNote')}</p>
      </Fold>
      <Fold id="tplLayout" title={t('tpl.layout')}>
        <div className={css.seg} role="group" aria-label={t('tpl.layout')}>
          {(['auto', 'one', 'two'] as const).map((r) => <button key={r} type="button" aria-pressed={look.rows === r} onClick={() => setLook({ rows: r })}>{t(`tpl.kpi.rows.${r}`)}</button>)}
        </div>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: ev.target.value || null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {x.content.kpis.map((k, i) => <option key={k.id} value={k.id}>{name(i)}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        {check('showPeriod')}{check('showBasis')}{check('showDelta')}
      </Fold>
      <Fold id="tplNumbers" title={t('tpl.numbers')}>
        <div className={tp.fmtList}>
          {x.content.kpis.map((k, i) => {
            const f = look.formats[k.id] ?? { kind: 'auto' as const };
            return (
              <div key={k.id} className={tp.fmtRow2}>
                <span title={name(i)}>{name(i)}</span>
                <select className={css.select} aria-label={t('tpl.table.formatOf', { name: name(i) })} value={f.kind} onChange={(ev) => {
                  const kind = ev.target.value as NumberKind;
                  const formats = { ...look.formats };
                  if (kind === 'auto') delete formats[k.id]; else formats[k.id] = { ...f, kind, ...(kind === 'currency' && !f.symbol ? { symbol: s.slideLocale === 'en' ? '$' : '¥' } : {}) };
                  setLook({ formats });
                }}>
                  {kinds.map((kd) => <option key={kd} value={kd}>{t(`tpl.fmt.${kd}`)}</option>)}
                </select>
              </div>
            );
          })}
        </div>
        <p className={css.note}>{t('tpl.kpi.formatNote')}</p>
      </Fold>
    </>
  );
}

// ──────────── 数字＋短い説明 ────────────

const numsOf = (s: BuilderState) => ({ content: s.content?.numbers ?? emptyNumbers(), look: s.look?.numbers ?? defaultNumbersLook() });
const putNums = (s: BuilderState, x: { content: NumbersContent; look: NumbersLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, numbers: x.content }, look: { ...s.look, numbers: x.look } });

/** 中央の下：かたまりごとに数字（入れたまま）・何の数字か・短い説明・参照スライド */
function NumbersEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = numsOf(s);
  const c = x.content;
  const set = (next: { content: NumbersContent; look: NumbersLook }) => update(putNums(s, next));
  const setContent = (content: NumbersContent) => set({ ...x, content });
  const others = s.others ?? [];
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <p className={tp.lead}>{t('tpl.num.hint')}</p>
      {c.items.map((it, i) => (
        <section key={it.id} className={tp.reason} aria-label={t('tpl.num.n', { n: i + 1 })}>
          <div className={tp.reasonHead}>
            <b>{t('tpl.num.n', { n: i + 1 })}</b>
            <span className={tp.reasonTools}>
              <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => setContent(moveNumber(c, i, -1))}>↑</button>
              <button type="button" aria-label={t('story.downLabel')} disabled={i === c.items.length - 1} onClick={() => setContent(moveNumber(c, i, 1))}>↓</button>
              <button type="button" disabled={c.items.length <= 1} onClick={() => set(removeNumber(c, x.look, i))}>{t('tpl.text.remove')}</button>
            </span>
          </div>
          <div className={tp.numRow}>
            <label className={tp.kpiField}><span>{t('tpl.num.value')}</span>
              <input className={`${css.input} ${tp.numValue}`} value={it.value} placeholder={t('tpl.num.valuePlaceholder')} onChange={(e) => setContent(updateNumber(c, i, { value: e.target.value }))} /></label>
            <label className={tp.kpiField}><span>{t('tpl.num.label')}</span>
              <input className={css.input} value={it.label} placeholder={t('tpl.num.labelPlaceholder')} onChange={(e) => setContent(updateNumber(c, i, { label: e.target.value }))} /></label>
          </div>
          <label className={tp.label} htmlFor={`nb-${it.id}`}><span>{t('tpl.num.body')}</span><Count text={it.body} max={NUM_LIMITS.body} /></label>
          <input id={`nb-${it.id}`} className={css.input} value={it.body} placeholder={t('tpl.num.bodyPlaceholder')} onChange={(e) => setContent(updateNumber(c, i, { body: e.target.value }))} />
          {others.length > 0 && (
            <select className={css.select} aria-label={t('tpl.text.ref')} value={it.ref ?? ''} onChange={(e) => setContent(updateNumber(c, i, { ref: e.target.value || null }))}>
              <option value="">{t('tpl.text.refNone')}</option>
              {it.ref && !others.some((o) => o.id === it.ref) && <option value={it.ref}>{t('tpl.text.refGone')}</option>}
              {others.map((o) => <option key={o.id} value={o.id}>{t('tpl.text.refOption', { n: o.n, title: o.title || '—' })}</option>)}
            </select>
          )}
        </section>
      ))}
      {c.items.length < NUM_LIMITS.input && <div className={tp.actions}><button type="button" className="btn" onClick={() => setContent(addNumber(c))}>{t('tpl.num.add')}</button></div>}
    </div>
  );
}

function NumbersLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = numsOf(s);
  const look = x.look;
  const setLook = (patch: Partial<NumbersLook>) => update(putNums(s, { ...x, look: { ...look, ...patch } }));
  return (
    <>
      <Fold id="tplLayout" title={t('tpl.layout')}>
        <div className={css.seg} role="group" aria-label={t('tpl.layout')}>
          {(['auto', 'horizontal', 'vertical'] as const).map((l) => <button key={l} type="button" aria-pressed={look.layout === l} onClick={() => setLook({ layout: l })}>{t(`tpl.num.layout.${l}`)}</button>)}
        </div>
        <p className={css.note}>{t('tpl.num.layoutNote')}</p>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: ev.target.value || null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {x.content.items.map((it, i) => <option key={it.id} value={it.id}>{it.value.trim() || t('tpl.num.n', { n: i + 1 })}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        <label className={css.check}><input type="checkbox" checked={look.showRefs} onChange={(ev) => setLook({ showRefs: ev.target.checked })} />{t('tpl.iia.showRefs')}</label>
      </Fold>
    </>
  );
}

// ──────────── 2カラム比較 ────────────

const twoOf = (s: BuilderState) => ({ content: s.content?.twoCol ?? emptyTwoCol(), look: s.look?.twoCol ?? defaultTwoColLook() });
const putTwo = (s: BuilderState, x: { content: TwoColContent; look: TwoColLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, twoCol: x.content }, look: { ...s.look, twoCol: x.look } });
const sideName = (t: ReturnType<typeof useT>, c: TwoColContent, id: TwoColId) => c.cols.find((x) => x.id === id)?.label.trim() || t(`tpl.two.side.${id}`);

/** 中央の下：左右の枠ごとに見出し（自由）と行。左右の入れ替え */
function TwoColEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = twoOf(s);
  const c = x.content;
  const setContent = (content: TwoColContent) => update(putTwo(s, { ...x, content }));
  const others = s.others ?? [];
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <p className={tp.lead}>{t('tpl.two.hint')}</p>
      <div className={tp.twoGrid}>
        {c.cols.map((col) => (
          <section key={col.id} className={tp.reason} aria-label={sideName(t, c, col.id)}>
            <input className={`${css.input} ${tp.blockName}`} aria-label={t('tpl.two.label', { side: t(`tpl.two.side.${col.id}`) })} value={col.label} placeholder={t(`tpl.two.ph.${col.id}`)} onChange={(e) => setContent(updateTwoCol(c, col.id, { label: e.target.value }))} />
            {col.items.map((it, i) => (
              <div key={it.id} className={tp.iiaRow}>
                <input className={css.input} aria-label={t('tpl.iia.line', { n: i + 1 })} value={it.text} onChange={(e) => setContent(updateTwoItem(c, col.id, i, e.target.value))} />
                <span className={tp.reasonTools}>
                  <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => setContent(moveTwoItem(c, col.id, i, -1))}>↑</button>
                  <button type="button" aria-label={t('story.downLabel')} disabled={i === col.items.length - 1} onClick={() => setContent(moveTwoItem(c, col.id, i, 1))}>↓</button>
                  <button type="button" aria-label={t('tpl.text.remove')} disabled={col.items.length <= 1} onClick={() => setContent(removeTwoItem(c, col.id, i))}>×</button>
                </span>
              </div>
            ))}
            <div className={tp.actions}>
              {col.items.length < TWO_COL_LIMITS.input && <button type="button" className={css.linkBtn} onClick={() => setContent(addTwoItem(c, col.id))}>{t('tpl.iia.add')}</button>}
              <Count text={col.items.filter((i) => i.text.trim()).map(() => 'x').join('')} max={TWO_COL_LIMITS.items} />
            </div>
            {others.length > 0 && (
              <details className={tp.refPick}>
                <summary>{t('tpl.exec.refs', { n: col.refs.length })}</summary>
                {others.map((o) => (
                  <label key={o.id} className={tp.refItem}>
                    <input type="checkbox" checked={col.refs.includes(o.id)} onChange={(e) => setContent(updateTwoCol(c, col.id, { refs: e.target.checked ? [...col.refs, o.id] : col.refs.filter((r) => r !== o.id) }))} />
                    {t('tpl.text.refOption', { n: o.n, title: o.title || '—' })}
                  </label>
                ))}
              </details>
            )}
          </section>
        ))}
      </div>
      <div className={tp.actions}><button type="button" className="btn" onClick={() => update(putTwo(s, swapTwoCols(c, x.look)))}>{t('tpl.two.swap')}</button></div>
    </div>
  );
}

function TwoColLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = twoOf(s);
  const look = x.look;
  const setLook = (patch: Partial<TwoColLook>) => update(putTwo(s, { ...x, look: { ...look, ...patch } }));
  return (
    <>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: (ev.target.value || null) as TwoColId | null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {(['left', 'right'] as const).map((id) => <option key={id} value={id}>{sideName(t, x.content, id)}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        <label className={css.check}><input type="checkbox" checked={look.arrow} onChange={(ev) => setLook({ arrow: ev.target.checked })} />{t('tpl.two.arrow')}</label>
        <label className={css.check}><input type="checkbox" checked={look.showRefs} onChange={(ev) => setLook({ showRefs: ev.target.checked })} />{t('tpl.iia.showRefs')}</label>
      </Fold>
    </>
  );
}

// ──────────── 箇条書き ────────────

const bulletsOf = (s: BuilderState) => ({ content: s.content?.bullets ?? emptyBullets(), look: s.look?.bullets ?? defaultBulletsLook() });
const putBullets = (s: BuilderState, x: { content: BulletsContent; look: BulletsLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, bullets: x.content }, look: { ...s.look, bullets: x.look } });

/** 中央の下：1行ずつ本文・補足・参照スライド */
function BulletsEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = bulletsOf(s);
  const c = x.content;
  const set = (next: { content: BulletsContent; look: BulletsLook }) => update(putBullets(s, next));
  const setContent = (content: BulletsContent) => set({ ...x, content });
  const others = s.others ?? [];
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <p className={tp.lead}>{t('tpl.bullet.hint')}</p>
      <div className={others.length ? tp.bulletHeadRef : tp.bulletHead} aria-hidden="true">
        <span>{t('tpl.bullet.text')}</span><span>{t('tpl.bullet.sub')}</span>{others.length > 0 && <span>{t('tpl.text.ref')}</span>}<span />
      </div>
      {c.items.map((it, i) => (
        <div key={it.id} className={others.length ? tp.bulletRowRef : tp.bulletRow}>
          <input className={css.input} aria-label={t('tpl.bullet.line', { n: i + 1 })} value={it.text} placeholder={i === 0 ? t('tpl.bullet.textPlaceholder') : ''} onChange={(e) => setContent(updateBullet(c, i, { text: e.target.value }))} />
          <input className={css.input} aria-label={t('tpl.bullet.sub')} value={it.sub} placeholder={i === 0 ? t('tpl.bullet.subPlaceholder') : ''} onChange={(e) => setContent(updateBullet(c, i, { sub: e.target.value }))} />
          {others.length > 0 && (
            <select className={css.select} aria-label={t('tpl.text.ref')} value={it.ref ?? ''} onChange={(e) => setContent(updateBullet(c, i, { ref: e.target.value || null }))}>
              <option value="">{t('tpl.text.refNone')}</option>
              {it.ref && !others.some((o) => o.id === it.ref) && <option value={it.ref}>{t('tpl.text.refGone')}</option>}
              {others.map((o) => <option key={o.id} value={o.id}>{t('tpl.text.refOption', { n: o.n, title: o.title || '—' })}</option>)}
            </select>
          )}
          <span className={tp.reasonTools}>
            <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => setContent(moveBullet(c, i, -1))}>↑</button>
            <button type="button" aria-label={t('story.downLabel')} disabled={i === c.items.length - 1} onClick={() => setContent(moveBullet(c, i, 1))}>↓</button>
            <button type="button" aria-label={t('tpl.text.remove')} disabled={c.items.length <= 1} onClick={() => set(removeBullet(c, x.look, i))}>×</button>
          </span>
        </div>
      ))}
      <div className={tp.actions}>
        {c.items.length < BULLET_LIMITS.input && <button type="button" className="btn" onClick={() => setContent(addBullet(c))}>{t('tpl.bullet.add')}</button>}
        <Count text={c.items.filter((i) => i.text.trim()).map(() => 'x').join('')} max={BULLET_LIMITS.max} />
      </div>
    </div>
  );
}

function BulletsLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = bulletsOf(s);
  const look = x.look;
  const setLook = (patch: Partial<BulletsLook>) => update(putBullets(s, { ...x, look: { ...look, ...patch } }));
  return (
    <>
      <Fold id="tplLayout" title={t('tpl.bullet.marker')}>
        <div className={css.seg} role="group" aria-label={t('tpl.bullet.marker')}>
          {(['dot', 'number'] as const).map((m) => <button key={m} type="button" aria-pressed={look.marker === m} onClick={() => setLook({ marker: m })}>{t(`tpl.bullet.marker.${m}`)}</button>)}
        </div>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: ev.target.value || null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {x.content.items.map((it, i) => <option key={it.id} value={it.id}>{it.text.trim() || t('tpl.bullet.line', { n: i + 1 })}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        <label className={css.check}><input type="checkbox" checked={look.showRefs} onChange={(ev) => setLook({ showRefs: ev.target.checked })} />{t('tpl.iia.showRefs')}</label>
      </Fold>
    </>
  );
}

// ──────────── 次のアクション ────────────

const nextOf = (s: BuilderState) => ({ content: s.content?.next ?? emptyNext(), look: s.look?.next ?? defaultNextLook() });
const putNext = (s: BuilderState, x: { content: NextContent; look: NextLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, next: x.content }, look: { ...s.look, next: x.look } });

/** 中央の下：ひとこと・やること（担当・期限・状態）。課題→示唆→アクションのスライドから取り込める（写すだけ） */
function NextEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const locale = useLocale();
  const x = nextOf(s);
  const c = x.content;
  const set = (next: { content: NextContent; look: NextLook }) => update(putNext(s, next));
  const setContent = (content: NextContent) => set({ ...x, content });
  const sources = (s.others ?? []).filter((o) => o.actions?.length);
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <p className={tp.lead}>{t('tpl.next.hint')}</p>
      <label className={tp.label} htmlFor="next-lead"><span>{t('tpl.next.lead')}</span><Count text={c.lead} max={NEXT_LIMITS.lead} /></label>
      <input id="next-lead" className={css.input} value={c.lead} placeholder={t('tpl.next.leadPlaceholder')} onChange={(e) => setContent({ ...c, lead: e.target.value })} />
      <div className={tp.nextHead} aria-hidden="true">
        <span>{t('tpl.next.text')}</span><span>{t('tpl.next.owner')}</span><span>{t('tpl.next.due')}</span><span>{t('tpl.next.status')}</span><span />
      </div>
      {c.items.map((it, i) => (
        <div key={it.id} className={tp.nextRow}>
          <input className={css.input} aria-label={t('tpl.next.line', { n: i + 1 })} value={it.text} placeholder={t('tpl.next.textPlaceholder')} onChange={(e) => setContent(updateAction(c, i, { text: e.target.value }))} />
          <input className={css.input} aria-label={t('tpl.next.owner')} value={it.owner} placeholder={t('tpl.next.owner')} onChange={(e) => setContent(updateAction(c, i, { owner: e.target.value }))} />
          <input className={css.input} aria-label={t('tpl.next.due')} value={it.due} placeholder={t('tpl.next.duePlaceholder')} onChange={(e) => setContent(updateAction(c, i, { due: e.target.value }))} />
          <select className={css.select} aria-label={t('tpl.next.status')} value={it.status} onChange={(e) => setContent(updateAction(c, i, { status: e.target.value as NextStatus }))}>
            {NEXT_STATUS_IDS.map((k) => <option key={k} value={k}>{localize(NEXT_STATUS[k], locale)}</option>)}
          </select>
          <span className={tp.reasonTools}>
            <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => setContent(moveAction(c, i, -1))}>↑</button>
            <button type="button" aria-label={t('story.downLabel')} disabled={i === c.items.length - 1} onClick={() => setContent(moveAction(c, i, 1))}>↓</button>
            <button type="button" aria-label={t('tpl.text.remove')} disabled={c.items.length <= 1} onClick={() => set(removeAction(c, x.look, i))}>×</button>
          </span>
        </div>
      ))}
      <div className={tp.actions}>
        {c.items.length < NEXT_LIMITS.input && <button type="button" className="btn" onClick={() => setContent(addAction(c))}>{t('tpl.next.add')}</button>}
        {sources.map((o) => (
          <button key={o.id} type="button" className={css.linkBtn} onClick={() => setContent(importActions(c, o.actions!))}>
            {t('tpl.next.import', { n: o.n, k: o.actions!.length })}
          </button>
        ))}
      </div>
      {sources.length > 0 && <p className={css.note}>{t('tpl.next.importNote')}</p>}
    </div>
  );
}

function NextLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = nextOf(s);
  const look = x.look;
  const setLook = (patch: Partial<NextLook>) => update(putNext(s, { ...x, look: { ...look, ...patch } }));
  const check = (key: 'showNumbers' | 'showOwner' | 'showDue' | 'showStatus' | 'showLead') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.next.${key}`)}</label>
  );
  return (
    <>
      <Fold id="tplLayout" title={t('tpl.layout')}>
        <div className={css.seg} role="group" aria-label={t('tpl.layout')}>
          {(['table', 'cards'] as const).map((l) => <button key={l} type="button" aria-pressed={look.layout === l} onClick={() => setLook({ layout: l })}>{t(`tpl.next.layout.${l}`)}</button>)}
        </div>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: ev.target.value || null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {x.content.items.map((it, i) => <option key={it.id} value={it.id}>{it.text.trim() || t('tpl.next.line', { n: i + 1 })}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        {check('showLead')}{check('showNumbers')}{check('showOwner')}{check('showDue')}{check('showStatus')}
      </Fold>
    </>
  );
}

// ──────────── 課題→示唆→アクション ────────────

const iiaOf = (s: BuilderState) => ({ content: s.content?.iia ?? emptyIia(), look: s.look?.iia ?? defaultIiaLook() });
const putIia = (s: BuilderState, x: { content: IiaContent; look: IiaLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, iia: x.content }, look: { ...s.look, iia: x.look } });

/** 中央の下：3つの枠ごとに見出しと行（アクションは担当・期限も）。関係する問いのメッセージを参考に出し、そのまま入れられる */
function IiaEditor({ state: s, update, related }: { state: BuilderState; update: Up; related: (id: IiaColId) => RelatedSlide[] }) {
  const t = useT();
  const locale = useLocale();
  const x = iiaOf(s);
  const c = x.content;
  const setContent = (content: IiaContent) => update(putIia(s, { ...x, content }));
  const others = s.others ?? [];
  const usable = (r: RelatedSlide[]) => r.filter((o) => o.title.trim() && !isPlaceholderTitle(o.title));
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <p className={tp.lead}>{t('tpl.iia.hint')}</p>
      {c.cols.map((col) => {
        const name = localize(IIA_COLS[col.id].label, locale);
        const rel = usable(related(col.id));
        const action = col.id === 'action';
        return (
          <section key={col.id} className={tp.reason} aria-label={col.label || name}>
            <input className={`${css.input} ${tp.blockName}`} aria-label={t('tpl.exec.label')} value={col.label} placeholder={name} onChange={(e) => setContent(updateIiaCol(c, col.id, { label: e.target.value }))} />
            {col.items.map((it, i) => (
              <div key={it.id} className={action ? tp.iiaRowAction : tp.iiaRow}>
                <input className={css.input} aria-label={t('tpl.iia.line', { n: i + 1 })} value={it.text} placeholder={t(`tpl.iia.ph.${col.id}`)} onChange={(e) => setContent(updateIiaItem(c, col.id, i, { text: e.target.value }))} />
                {action && <input className={css.input} aria-label={t('tpl.iia.owner')} value={it.owner} placeholder={t('tpl.iia.owner')} onChange={(e) => setContent(updateIiaItem(c, col.id, i, { owner: e.target.value }))} />}
                {action && <input className={css.input} aria-label={t('tpl.iia.due')} value={it.due} placeholder={t('tpl.iia.due')} onChange={(e) => setContent(updateIiaItem(c, col.id, i, { due: e.target.value }))} />}
                <span className={tp.reasonTools}>
                  <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => setContent(moveIiaItem(c, col.id, i, -1))}>↑</button>
                  <button type="button" aria-label={t('story.downLabel')} disabled={i === col.items.length - 1} onClick={() => setContent(moveIiaItem(c, col.id, i, 1))}>↓</button>
                  <button type="button" aria-label={t('tpl.text.remove')} disabled={col.items.length <= 1} onClick={() => setContent(removeIiaItem(c, col.id, i))}>×</button>
                </span>
              </div>
            ))}
            <div className={tp.actions}>
              {col.items.length < IIA_LIMITS.input && <button type="button" className={css.linkBtn} onClick={() => setContent(addIiaItem(c, col.id))}>{t('tpl.iia.add')}</button>}
              <Count text={col.items.filter((i) => i.text.trim()).map(() => 'x').join('')} max={IIA_LIMITS.items} />
            </div>
            {rel.length > 0 && (
              <div className={tp.related}>
                <span>{t('tpl.exec.related')}</span>
                <ul>{rel.map((o) => <li key={o.id}>{t('tpl.text.refOption', { n: o.n, title: o.title })}</li>)}</ul>
                <button type="button" className={css.linkBtn} onClick={() => setContent(insertIiaMessages(c, col.id, rel, isPlaceholderTitle))}>{t('tpl.exec.insert')}</button>
              </div>
            )}
            {others.length > 0 && (
              <details className={tp.refPick}>
                <summary>{t('tpl.exec.refs', { n: col.refs.length })}</summary>
                {others.map((o) => (
                  <label key={o.id} className={tp.refItem}>
                    <input type="checkbox" checked={col.refs.includes(o.id)} onChange={(e) => setContent(updateIiaCol(c, col.id, { refs: e.target.checked ? [...col.refs, o.id] : col.refs.filter((r) => r !== o.id) }))} />
                    {t('tpl.text.refOption', { n: o.n, title: o.title || '—' })}
                  </label>
                ))}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function IiaLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const locale = useLocale();
  const x = iiaOf(s);
  const look = x.look;
  const setLook = (patch: Partial<IiaLook>) => update(putIia(s, { ...x, look: { ...look, ...patch } }));
  const check = (key: 'showNumbers' | 'showOwner' | 'showRefs') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.iia.${key}`)}</label>
  );
  return (
    <>
      <Fold id="tplLayout" title={t('tpl.layout')}>
        <div className={css.seg} role="group" aria-label={t('tpl.layout')}>
          {(['horizontal', 'vertical'] as const).map((l) => <button key={l} type="button" aria-pressed={look.layout === l} onClick={() => setLook({ layout: l })}>{t(`tpl.iia.layout.${l}`)}</button>)}
        </div>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: (ev.target.value || null) as IiaColId | null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {x.content.cols.map((col) => <option key={col.id} value={col.id}>{col.label.trim() || localize(IIA_COLS[col.id].label, locale)}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        {check('showNumbers')}{check('showOwner')}{check('showRefs')}
      </Fold>
    </>
  );
}

// ──────────── 増減付き表 ────────────

const deltaOf = (s: BuilderState) => ({ content: s.content?.delta ?? sampleDelta(s.slideLocale), look: s.look?.delta ?? defaultDeltaLook() });
const putDelta = (s: BuilderState, x: { content: DeltaContent; look: DeltaLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, delta: x.content }, look: { ...s.look, delta: x.look } });

/** 中央の下：列の見出しと単位、1行＝1項目（項目名・今の値・比較1・比較2）。差と率はアプリが計算する */
function DeltaEditor({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = deltaOf(s);
  const c = x.content;
  const set = (next: { content: DeltaContent; look: DeltaLook }) => update(putDelta(s, next));
  const setContent = (content: DeltaContent) => set({ ...x, content });
  const onPaste = (i: number, f: DeltaField) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    setContent(pasteDeltaRows(c, i, f, text));
  };
  const head = (k: keyof DeltaContent['heads']) => (
    <label className={tp.kpiField}>
      <span>{t(`tpl.delta.head.${k}`)}</span>
      <input className={css.input} value={c.heads[k]} placeholder={t(`tpl.delta.head.${k}Placeholder`)} onChange={(e) => setContent({ ...c, heads: { ...c.heads, [k]: e.target.value } })} />
    </label>
  );
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <label className={css.field}>
        <span>{t('tpl.table.lead')}</span>
        <input className={css.input} value={c.lead} placeholder={t('tpl.table.leadPlaceholder')} onChange={(e) => setContent({ ...c, lead: e.target.value })} />
      </label>
      <p className={tp.lead}>{t('tpl.delta.hint')}</p>
      <div className={tp.deltaHeads}>
        {head('name')}{head('value')}{head('c1')}{head('c2')}
        <label className={tp.kpiField}>
          <span>{t('tpl.kpi.unit')}</span>
          <input className={css.input} value={c.unit} placeholder={t('tpl.kpi.unitPlaceholder')} onChange={(e) => setContent({ ...c, unit: e.target.value })} />
        </label>
      </div>
      <div className={tp.gridWrap}>
        <table className={tp.grid}>
          <thead>
            <tr>
              <td className={tp.corner} />
              {DELTA_FIELDS.map((f) => <th key={f} className={tp.headCell}><span className={tp.thText}>{c.heads[f] || t(`tpl.delta.col.${f}`)}</span></th>)}
              <th className={tp.headCell}><span className={tp.thText}>{t('tpl.delta.col.calc')}</span></th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r, i) => {
              const d = rowDelta(r.value, r.c1);
              return (
                <tr key={r.id}>
                  <td className={tp.ctl}>
                    <button type="button" aria-label={t('tpl.table.rowUp', { n: i + 1 })} disabled={i === 0} onClick={() => setContent(moveDeltaRow(c, i, -1))}>↑</button>
                    <button type="button" aria-label={t('tpl.table.rowDown', { n: i + 1 })} disabled={i === c.rows.length - 1} onClick={() => setContent(moveDeltaRow(c, i, 1))}>↓</button>
                    <button type="button" aria-label={t('tpl.table.rowRemove', { n: i + 1 })} disabled={c.rows.length <= 1} onClick={() => set(removeDeltaRow(c, x.look, i))}>×</button>
                  </td>
                  {DELTA_FIELDS.map((f) => (
                    <td key={f}><input aria-label={t('tpl.table.cell', { r: i + 1, c: DELTA_FIELDS.indexOf(f) + 1 })} value={r[f]} onChange={(e) => setContent(updateDeltaRow(c, i, { [f]: e.target.value }))} onPaste={onPaste(i, f)} /></td>
                  ))}
                  <td className={tp.calc}>{d ? (d.isPct ? `${d.diff > 0 ? '+' : ''}${Math.round(d.diff * 10) / 10}pt` : `${d.diff > 0 ? '+' : ''}${Math.round(d.diff * 100) / 100}${d.pct == null ? '' : `（${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%）`}`) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={tp.actions}><button type="button" className="btn" onClick={() => setContent(addDeltaRow(c))}>{t('tpl.table.addRow')}</button></div>
      <label className={css.field}>
        <span>{t('tpl.table.note')}</span>
        <input className={css.input} value={c.note} placeholder={t('tpl.table.notePlaceholder')} onChange={(e) => setContent({ ...c, note: e.target.value })} />
      </label>
      <label className={css.field}>
        <span>{t('tpl.source')}</span>
        <input className={css.input} value={s.source} placeholder={t('leftover.sourcePlaceholder')} onChange={(e) => update({ source: e.target.value })} />
      </label>
    </div>
  );
}

function DeltaLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = deltaOf(s);
  const look = x.look;
  const c = x.content;
  const setLook = (patch: Partial<DeltaLook>) => update(putDelta(s, { ...x, look: { ...look, ...patch } }));
  const second = c.rows.some((r) => r.c2.trim());
  const modeSeg = (key: 'delta1' | 'delta2', label: string) => (
    <div className={css.field}>
      <span>{label}</span>
      <div className={css.seg} role="group" aria-label={label}>
        {(['pct', 'diff', 'both'] as const).map((m) => <button key={m} type="button" aria-pressed={look[key] === m} onClick={() => setLook({ [key]: m })}>{t(`tpl.kpi.delta.${m}`)}</button>)}
      </div>
    </div>
  );
  const check = (key: 'showCompare' | 'total' | 'showLead' | 'showSource' | 'rowLines' | 'headerFill') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(key === 'showCompare' || key === 'total' ? `tpl.delta.${key}` : `tpl.table.${key}`)}</label>
  );
  const kinds: NumberKind[] = ['auto', 'int', 'dec', 'pct', 'currency'];
  return (
    <>
      <Fold id="tplKpiDelta" title={t('tpl.kpi.delta')}>
        {modeSeg('delta1', t('tpl.delta.vs', { name: c.heads.c1 || t('tpl.delta.col.c1') }))}
        {second && modeSeg('delta2', t('tpl.delta.vs', { name: c.heads.c2 || t('tpl.delta.col.c2') }))}
        <div className={css.field}>
          <span>{t('tpl.kpi.good')}</span>
          <select className={css.select} value={look.good} onChange={(e) => setLook({ good: e.target.value as GoodDirection })}>
            {(['up', 'down', 'none'] as const).map((g) => <option key={g} value={g}>{t(`tpl.kpi.good.${g}`)}</option>)}
          </select>
        </div>
        <p className={css.note}>{t('tpl.kpi.deltaNote')}</p>
      </Fold>
      <Fold id="tplSort" title={t('tpl.delta.sort')}>
        <select className={css.select} aria-label={t('tpl.delta.sort')} value={look.sort} onChange={(e) => setLook({ sort: e.target.value as DeltaLook['sort'] })}>
          {(['input', 'value', 'delta'] as const).map((m) => <option key={m} value={m}>{t(`tpl.delta.sort.${m}`)}</option>)}
        </select>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: ev.target.value || null })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {c.rows.map((r, i) => <option key={r.id} value={r.id}>{r.name.trim() || t('tpl.table.rowN', { n: i + 1 })}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={tableAlign(look.align)} options={['left', 'center', 'right']} onChange={(align) => setLook({ align })} />
        {check('showCompare')}{check('total')}{check('showLead')}{check('showSource')}{check('rowLines')}{check('headerFill')}
      </Fold>
      <Fold id="tplNumbers" title={t('tpl.numbers')}>
        <select className={css.select} aria-label={t('tpl.numbers')} value={look.format?.kind ?? 'auto'} onChange={(ev) => {
          const kind = ev.target.value as NumberKind;
          setLook({ format: kind === 'auto' ? undefined : { kind, ...(kind === 'currency' ? { symbol: s.slideLocale === 'en' ? '$' : '¥' } : {}) } });
        }}>
          {kinds.map((kd) => <option key={kd} value={kd}>{t(`tpl.fmt.${kd}`)}</option>)}
        </select>
        <p className={css.note}>{t('tpl.delta.formatNote')}</p>
      </Fold>
    </>
  );
}

// ──────────── Executive Summary ────────────

const execOf = (s: BuilderState) => ({ content: s.content?.exec ?? emptyExec(), look: s.look?.exec ?? defaultExecLook() });
const putExec = (s: BuilderState, x: { content: ExecContent; look: ExecLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, exec: x.content }, look: { ...s.look, exec: x.look } });

/**
 * 中央の下：5つの項目の本文と参照スライド。Coach は書かない。
 * 関係するスライドのメッセージ（ユーザーが書いたヘッダー）を「参考」に出し、［メッセージを入れる］でそのまま入れられる
 */
function ExecEditor({ state: s, update, related }: { state: BuilderState; update: Up; related: (id: ExecBlockId) => RelatedSlide[] }) {
  const t = useT();
  const locale = useLocale();
  const x = execOf(s);
  const c = x.content;
  const setContent = (content: ExecContent) => update(putExec(s, { ...x, content }));
  const others = s.others ?? [];
  const usable = (r: RelatedSlide[]) => r.filter((o) => o.title.trim() && !isPlaceholderTitle(o.title));
  // 下書きに使えるメッセージ（ほかのスライドで、見本のままでないタイトル）
  const written = usable(others);
  // 役割で結び付くスライドが無い時（相談の並びで作った Story など）は、メッセージのあるスライドを「重要な根拠」に使う
  const roleMatched = c.blocks.some((b) => usable(related(b.id)).length > 0);
  const draftRelated = (id: ExecBlockId) => (roleMatched ? related(id) : id === 'evidence' ? written : []);
  // 数字（KPI スコアカード）と、対象期間・出典（前提・範囲）からの下書き
  const kpiOthers = others.filter((o) => o.kpi?.lines.length);
  const periods = [...new Set(kpiOthers.flatMap((o) => o.kpi!.periods))];
  // 出典はスライドの下に出るので、前提・範囲には入れない（重ねない）。対象期間だけ
  const boundary = periods.length ? (locale === 'ja' ? `対象：${periods.join('・')}` : `Period: ${periods.join(', ')}`) : '';
  const extras = { evidence: kpiOthers.map((o) => ({ id: o.id, lines: o.kpi!.lines })), boundary };
  const blockOf = (id: ExecBlockId) => c.blocks.find((b) => b.id === id)!;
  const extraEmpty = (!blockOf('evidence').body.trim() && kpiOthers.length > 0) || (!blockOf('boundary').body.trim() && !!boundary);
  const anyEmpty = extraEmpty || c.blocks.some((b) => !b.body.trim() && usable(draftRelated(b.id)).length);
  const allFilled = c.blocks.every((b) => b.body.trim());
  const draftWhy = anyEmpty ? null : !written.length ? t('tpl.exec.draftNeedMsg') : allFilled ? t('tpl.exec.draftAllFilled') : t('tpl.exec.draftNoMatch');
  const free = c.mode === 'free';
  const tabs = (
    <div className={tp.modeTabs} role="tablist" aria-label={t('tpl.exec.mode')}>
      {(['fixed', 'free'] as const).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={(c.mode ?? 'fixed') === m} onClick={() => setContent(setExecMode(c, m))}>{t(`tpl.exec.mode.${m}`)}</button>
      ))}
    </div>
  );
  if (free) {
    const f = c.free ?? { body: '', refs: [] };
    const all = usable(others);
    return (
      <div className={tp.editor}>
        <TitleField state={s} update={update} />
        {tabs}
        <p className={tp.lead}>{t('tpl.exec.freeHint')}</p>
        <label className={tp.label} htmlFor="exec-free"><span>{t('tpl.text.body')}</span><Count text={f.body} max={EXEC_LIMITS.free} /></label>
        <textarea id="exec-free" className={`${css.textarea} ${tp.freeBody}`} value={f.body} placeholder={t('tpl.exec.freePlaceholder')} onChange={(e) => setContent(updateFree(c, { body: e.target.value }))} />
        {all.length > 0 && (
          <div className={tp.related}>
            <span>{t('tpl.exec.relatedAll')}</span>
            <ul>{all.map((o) => <li key={o.id}>{t('tpl.text.refOption', { n: o.n, title: o.title })}</li>)}</ul>
            <button type="button" className={css.linkBtn} onClick={() => setContent(insertFreeMessages(c, all, isPlaceholderTitle))}>{t('tpl.exec.insertAll')}</button>
          </div>
        )}
        {others.length > 0 && (
          <details className={tp.refPick}>
            <summary>{t('tpl.exec.refs', { n: f.refs.length })}</summary>
            {others.map((o) => (
              <label key={o.id} className={tp.refItem}>
                <input type="checkbox" checked={f.refs.includes(o.id)} onChange={(e) => setContent(updateFree(c, { refs: e.target.checked ? [...f.refs, o.id] : f.refs.filter((r) => r !== o.id) }))} />
                {t('tpl.text.refOption', { n: o.n, title: o.title || '—' })}
              </label>
            ))}
          </details>
        )}
      </div>
    );
  }
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      {tabs}
      <p className={tp.lead}>{t('tpl.exec.hint')}</p>
      <div className={tp.actions}>
        <button type="button" className="btn" disabled={!anyEmpty} onClick={() => setContent(draftExtras(draftFromMessages(c, draftRelated, isPlaceholderTitle), extras))}>{t('tpl.exec.draft')}</button>
        {others.length > 0 && <span className={`${tp.lead} ${tp.count}`}>{t('tpl.exec.draftProgress', { n: written.length, total: others.length })}</span>}
        <span className={tp.lead}>{draftWhy ?? t('tpl.exec.draftNote')}</span>
      </div>
      {c.blocks.map((b) => {
        const rel = usable(related(b.id));
        const name = localize(EXEC_BLOCKS[b.id].label, locale);
        return (
          <section key={b.id} className={tp.reason} aria-label={b.label || name}>
            <div className={tp.reasonHead}>
              <input className={`${css.input} ${tp.blockName}`} aria-label={t('tpl.exec.label')} value={b.label} placeholder={name} onChange={(e) => setContent(updateBlock(c, b.id, { label: e.target.value }))} />
            </div>
            <label className={tp.label} htmlFor={`eb-${b.id}`}><span>{t('tpl.text.body')}</span><Count text={b.body} max={EXEC_LIMITS.body} /></label>
            <textarea id={`eb-${b.id}`} className={css.textarea} value={b.body} placeholder={t(`tpl.exec.ph.${b.id}`)} onChange={(e) => setContent(updateBlock(c, b.id, { body: e.target.value }))} />
            {rel.length > 0 && (
              <div className={tp.related}>
                <span>{t('tpl.exec.related')}</span>
                <ul>{rel.map((o) => <li key={o.id}>{t('tpl.text.refOption', { n: o.n, title: o.title })}</li>)}</ul>
                <button type="button" className={css.linkBtn} onClick={() => setContent(insertMessages(c, b.id, rel, isPlaceholderTitle))}>{t('tpl.exec.insert')}</button>
              </div>
            )}
            {others.length > 0 && (
              <details className={tp.refPick}>
                <summary>{t('tpl.exec.refs', { n: b.refs.length })}</summary>
                {others.map((o) => (
                  <label key={o.id} className={tp.refItem}>
                    <input type="checkbox" checked={b.refs.includes(o.id)} onChange={(e) => setContent(updateBlock(c, b.id, { refs: e.target.checked ? [...b.refs, o.id] : b.refs.filter((r) => r !== o.id) }))} />
                    {t('tpl.text.refOption', { n: o.n, title: o.title || '—' })}
                  </label>
                ))}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ExecLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const locale = useLocale();
  const x = execOf(s);
  const look = x.look;
  const setLook = (patch: Partial<ExecLook>) => update(putExec(s, { ...x, look: { ...look, ...patch } }));
  const check = (key: 'showLabels' | 'showRefs') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.exec.${key}`)}</label>
  );
  return (
    <>
      {x.content.mode !== 'free' && (
        <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
          <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: (ev.target.value || null) as ExecBlockId | null })}>
            <option value="">{t('tpl.text.emphasisNone')}</option>
            {x.content.blocks.map((b) => <option key={b.id} value={b.id}>{b.label.trim() || localize(EXEC_BLOCKS[b.id].label, locale)}</option>)}
          </select>
        </Fold>
      )}
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        {x.content.mode !== 'free' && check('showLabels')}{check('showRefs')}
        <p className={css.note}>{t('tpl.exec.refsNote')}</p>
      </Fold>
    </>
  );
}

// ──────────── 結論＋3つの根拠 ────────────

const textOf = (s: BuilderState) => ({
  content: s.content?.conclusion ?? emptyConclusion(),
  look: s.look?.conclusion ?? defaultConclusionLook(),
});
const putText = (s: BuilderState, x: { content: ConclusionContent; look: ConclusionLook }): Partial<BuilderState> =>
  ({ content: { ...s.content, conclusion: x.content }, look: { ...s.look, conclusion: x.look } });

/** 中央の下：結論（メッセージタイトル）と根拠1〜3、前提・留意点。本文は自分で書く（自動では入れない） */
function ConclusionEditor({ state: s, update, refLabel }: { state: BuilderState; update: Up; refLabel?: (id: string) => string | undefined }) {
  const t = useT();
  const x = textOf(s);
  const c = x.content;
  const set = (next: { content: ConclusionContent; look: ConclusionLook }) => update(putText(s, next));
  const setContent = (content: ConclusionContent) => set({ ...x, content });
  const others = s.others ?? [];
  const label = (o: { id: string; n: number; title: string }) => t('tpl.text.refOption', { n: o.n, title: refLabel?.(o.id) ?? (o.title || '—') });
  return (
    <div className={tp.editor}>
      <div>
        <TitleField state={s} update={update} />
        <p className={tp.lead}>{t('tpl.text.titleNote')} <Count text={s.title} max={CONCLUSION_LIMITS.title} /></p>
      </div>
      {c.reasons.map((r, i) => (
        <section key={r.id} className={tp.reason} aria-label={t('tpl.text.reasonN', { n: i + 1 })}>
          <div className={tp.reasonHead}>
            <b>{t('tpl.text.reasonN', { n: i + 1 })}</b>
            <span className={tp.reasonTools}>
              <button type="button" aria-label={t('story.upLabel')} disabled={i === 0} onClick={() => set(moveReason(c, x.look, i, -1))}>↑</button>
              <button type="button" aria-label={t('story.downLabel')} disabled={i === c.reasons.length - 1} onClick={() => set(moveReason(c, x.look, i, 1))}>↓</button>
              <button type="button" disabled={c.reasons.length <= 1} onClick={() => set(removeReason(c, x.look, i))}>{t('tpl.text.remove')}</button>
            </span>
          </div>
          <label className={tp.label} htmlFor={`rh-${r.id}`}><span>{t('tpl.text.heading')}</span><Count text={r.heading} max={CONCLUSION_LIMITS.heading} /></label>
          <input id={`rh-${r.id}`} className={css.input} value={r.heading} placeholder={t('tpl.text.headingPlaceholder')} onChange={(e) => setContent(updateReason(c, i, { heading: e.target.value }))} />
          <label className={tp.label} htmlFor={`rb-${r.id}`}><span>{t('tpl.text.body')}</span><Count text={r.body} max={CONCLUSION_LIMITS.body} /></label>
          <textarea id={`rb-${r.id}`} className={css.textarea} value={r.body} placeholder={t('tpl.text.bodyPlaceholder')} onChange={(e) => setContent(updateReason(c, i, { body: e.target.value }))} />
          <label className={tp.label} htmlFor={`rr-${r.id}`}><span>{t('tpl.text.ref')}</span></label>
          <select id={`rr-${r.id}`} className={css.select} value={r.ref ?? ''} onChange={(e) => setContent(updateReason(c, i, { ref: e.target.value || null }))}>
            <option value="">{t('tpl.text.refNone')}</option>
            {r.ref && !others.some((o) => o.id === r.ref) && <option value={r.ref}>{t('tpl.text.refGone')}</option>}
            {others.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
          </select>
        </section>
      ))}
      {c.reasons.length < CONCLUSION_LIMITS.maxReasons && (
        <div className={tp.actions}><button type="button" className="btn" onClick={() => setContent(addReason(c))}>{t('tpl.text.add')}</button></div>
      )}
      <label className={css.field}>
        <span>{t('tpl.text.caveat')}</span>
        <textarea className={css.textarea} value={c.caveat} placeholder={t('tpl.text.caveatPlaceholder')} onChange={(e) => setContent({ ...c, caveat: e.target.value })} />
      </label>
    </div>
  );
}

function ConclusionLookPanel({ state: s, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const x = textOf(s);
  const look = x.look;
  const setLook = (patch: Partial<ConclusionLook>) => update(putText(s, { ...x, look: { ...look, ...patch } }));
  const check = (key: 'showNumbers' | 'showRefs' | 'showCaveat') => (
    <label className={css.check}><input type="checkbox" checked={look[key]} onChange={(ev) => setLook({ [key]: ev.target.checked })} />{t(`tpl.text.${key}`)}</label>
  );
  return (
    <>
      <Fold id="tplLayout" title={t('tpl.layout')}>
        <div className={css.seg} role="group" aria-label={t('tpl.layout')}>
          {(['horizontal', 'vertical'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={look.layout === l} onClick={() => setLook({ layout: l })}>{t(`tpl.text.layout.${l}`)}</button>
          ))}
        </div>
      </Fold>
      <Fold id="tplEmphasis" title={t('tpl.emphasis')}>
        <select className={css.select} aria-label={t('tpl.emphasis')} value={look.emphasis ?? ''} onChange={(ev) => setLook({ emphasis: ev.target.value === '' ? null : Number(ev.target.value) })}>
          <option value="">{t('tpl.text.emphasisNone')}</option>
          {x.content.reasons.map((_, i) => <option key={i} value={i}>{t('tpl.text.reasonN', { n: i + 1 })}</option>)}
        </select>
      </Fold>
      <Fold id="tplShow" title={t('tpl.show')}>
        <AlignField value={look.align ?? 'left'} options={['left', 'center', 'right']} onChange={(align) => setLook({ align: align as TextAlign })} />
        {check('showNumbers')}{check('showRefs')}{check('showCaveat')}
      </Fold>
    </>
  );
}

// ──────────── 入り口 ────────────

/** 中央の下：今の型の中身の入力欄 */
export function TemplateEditor({ state, update, refLabel, relatedRoles }: {
  state: BuilderState; update: Up; refLabel?: (id: string) => string | undefined;
  /**
   * 問いの役割 → 関係するスライド（ストーリーの時だけ）。Executive Summary・課題→示唆→アクションの「参考」と［メッセージを入れる］に使う。
   * 無ければ（1枚の編集画面）、Executive Summary の「重要な根拠」にほかのスライド全部
   */
  relatedRoles?: (roles: string[]) => RelatedSlide[];
}) {
  const others = state.others ?? [];
  if (state.view === 'STORY_TEXT_EXECUTIVE_SUMMARY') {
    return <ExecEditor state={state} update={update} related={(id) => (relatedRoles ? relatedRoles(EXEC_BLOCKS[id].roles) : id === 'evidence' ? others : [])} />;
  }
  if (state.view === 'STORY_TEXT_NUMBERS') return <NumbersEditor state={state} update={update} />;
  if (state.view === 'STORY_TEXT_NEXT_ACTIONS') return <NextEditor state={state} update={update} />;
  if (state.view === 'STORY_TEXT_TWO_COLUMN') return <TwoColEditor state={state} update={update} />;
  if (state.view === 'STORY_TEXT_BULLETS') return <BulletsEditor state={state} update={update} />;
  if (state.view === 'STORY_TEXT_ISSUE_INSIGHT_ACTION') {
    return <IiaEditor state={state} update={update} related={(id) => (relatedRoles ? relatedRoles(IIA_COLS[id].roles) : [])} />;
  }
  // ヒートマップ・基本表も中身は比較表と同じ（共有）
  if (state.view === 'STORY_TABLE_COMPARISON' || state.view === 'STORY_TABLE_HEATMAP' || state.view === 'STORY_TABLE_BASIC') return <ComparisonEditor state={state} update={update} />;
  if (state.view === 'STORY_TABLE_DELTA') return <DeltaEditor state={state} update={update} />;
  if (state.view === 'STORY_TABLE_KPI') return <KpiEditor state={state} update={update} />;
  if (state.view === 'STORY_TEXT_CONCLUSION_REASONS') return <ConclusionEditor state={state} update={update} refLabel={refLabel} />;
  return null;
}

/** 右：今の型の見せ方（内容は書かせない） */
export function TemplateLookPanel({ state, update }: { state: BuilderState; update: Up }) {
  // 今の見せ方の名前と説明は、上の「見せ方：〇〇（今）」と左に出ているので、ここには出さない
  if (!state.view) return null;
  return (
    <>
      {state.view === 'STORY_TABLE_COMPARISON' ? <ComparisonLookPanel state={state} update={update} />
        : state.view === 'STORY_TEXT_NUMBERS' ? <NumbersLookPanel state={state} update={update} />
        : state.view === 'STORY_TEXT_NEXT_ACTIONS' ? <NextLookPanel state={state} update={update} />
        : state.view === 'STORY_TEXT_TWO_COLUMN' ? <TwoColLookPanel state={state} update={update} />
        : state.view === 'STORY_TEXT_BULLETS' ? <BulletsLookPanel state={state} update={update} />
        : state.view === 'STORY_TABLE_BASIC' ? <BasicLookPanel state={state} update={update} />
        : state.view === 'STORY_TEXT_ISSUE_INSIGHT_ACTION' ? <IiaLookPanel state={state} update={update} />
        : state.view === 'STORY_TABLE_DELTA' ? <DeltaLookPanel state={state} update={update} />
        : state.view === 'STORY_TABLE_HEATMAP' ? <HeatLookPanel state={state} update={update} />
        : state.view === 'STORY_TABLE_KPI' ? <KpiLookPanel state={state} update={update} />
        : state.view === 'STORY_TEXT_EXECUTIVE_SUMMARY' ? <ExecLookPanel state={state} update={update} />
        : <ConclusionLookPanel state={state} update={update} />}
    </>
  );
}
