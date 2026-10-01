'use client';

import type { ClipboardEvent } from 'react';
import { CONCLUSION_LIMITS, STORY_TEMPLATES, localize } from '@/registry';
import type { ComparisonContent, ComparisonLook, ConclusionContent, ConclusionLook, Emphasis, NumberKind, TextAlign } from '@/engine/layout/templates';
import { useLocale, useT } from '@/i18n/ui';
import { TitleField } from '../editor/SlideFields';
import { Fold } from '../editor/Fold';
import type { BuilderState } from '../editor/state';
import {
  addCol, addReason, addRow, defaultComparisonLook, defaultConclusionLook, emptyConclusion, moveCol, moveReason, moveRow, pasteCells,
  removeCol, removeReason, removeRow, sampleComparison, setCell, setFormat, updateReason,
} from './content';
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

// ──────────── 比較表 ────────────

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
  const set = (next: { content: ComparisonContent; look: ComparisonLook }) => update(putTable(s, next));
  const setContent = (patch: Partial<ComparisonContent>) => set({ ...tb, content: { ...c, ...patch } });
  const onPaste = (r: number, k: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    set(pasteCells(tb, r, k, text));
  };
  const head = (r: number, k: number) => (c.headerRow && r === 0) || (c.headerCol && k === 0);
  return (
    <div className={tp.editor}>
      <TitleField state={s} update={update} />
      <label className={css.field}>
        <span>{t('tpl.table.lead')}</span>
        <input className={css.input} value={c.lead} placeholder={t('tpl.table.leadPlaceholder')} onChange={(e) => setContent({ lead: e.target.value })} />
      </label>
      <p className={tp.lead}>{t('tpl.table.pasteHint')}</p>
      <div className={tp.toggles}>
        <label><input type="checkbox" checked={c.headerRow} onChange={(e) => setContent({ headerRow: e.target.checked })} />{t('tpl.table.headerRow')}</label>
        <label><input type="checkbox" checked={c.headerCol} onChange={(e) => setContent({ headerCol: e.target.checked })} />{t('tpl.table.headerCol')}</label>
      </div>
      <div className={tp.gridWrap}>
        <table className={tp.grid}>
          <thead>
            <tr>
              <td className={tp.corner} />
              {Array.from({ length: w }, (_, k) => (
                <td key={k} className={tp.ctl}>
                  <button type="button" aria-label={t('tpl.table.colLeft', { n: k + 1 })} disabled={k === 0} onClick={() => set(moveCol(tb, k, -1))}>←</button>
                  <button type="button" aria-label={t('tpl.table.colRight', { n: k + 1 })} disabled={k === w - 1} onClick={() => set(moveCol(tb, k, 1))}>→</button>
                  <button type="button" aria-label={t('tpl.table.colRemove', { n: k + 1 })} disabled={w <= 1} onClick={() => set(removeCol(tb, k))}>×</button>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.cells.map((row, r) => (
              <tr key={r}>
                <td className={tp.ctl}>
                  <button type="button" aria-label={t('tpl.table.rowUp', { n: r + 1 })} disabled={r === 0} onClick={() => set(moveRow(tb, r, -1))}>↑</button>
                  <button type="button" aria-label={t('tpl.table.rowDown', { n: r + 1 })} disabled={r === h - 1} onClick={() => set(moveRow(tb, r, 1))}>↓</button>
                  <button type="button" aria-label={t('tpl.table.rowRemove', { n: r + 1 })} disabled={h <= 1} onClick={() => set(removeRow(tb, r))}>×</button>
                </td>
                {Array.from({ length: w }, (_, k) => (
                  <td key={k} className={head(r, k) ? tp.headCell : undefined}>
                    <input aria-label={t('tpl.table.cell', { r: r + 1, c: k + 1 })} value={row[k] ?? ''} onChange={(e) => set(setCell(tb, r, k, e.target.value))} onPaste={onPaste(r, k)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={tp.actions}>
        <button type="button" className="btn" onClick={() => set(addRow(tb))}>{t('tpl.table.addRow')}</button>
        <button type="button" className="btn" onClick={() => set(addCol(tb))}>{t('tpl.table.addCol')}</button>
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
  const lines = look.formatAxis === 'row' ? rows : cols;
  const kinds: NumberKind[] = ['auto', 'int', 'dec', 'pct', 'currency'];
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
        <AlignField value={look.align ?? 'auto'} options={['auto', 'left', 'center', 'right']} onChange={(align) => setLook({ align })} note={t('tpl.align.autoNote')} />
        {check('showLead')}{check('showSource')}{check('rowLines')}{check('headerFill')}
      </Fold>
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
            const f = look.formats[String(k)] ?? { kind: 'auto' as const };
            const name = look.formatAxis === 'row' ? rowName(k) : colName(k);
            return (
              <div key={k} className={tp.fmtRow}>
                <span title={name}>{name}</span>
                <select className={css.select} aria-label={t('tpl.table.formatOf', { name })} value={f.kind} onChange={(ev) => {
                  const kind = ev.target.value as NumberKind;
                  setLook(setFormat(look, k, { ...f, kind, ...(kind === 'currency' && !f.symbol ? { symbol: s.slideLocale === 'en' ? '$' : '¥' } : {}) }));
                }}>
                  {kinds.map((x) => <option key={x} value={x}>{t(`tpl.fmt.${x}`)}</option>)}
                </select>
                <input className={css.input} aria-label={t('tpl.table.unitOf', { name })} placeholder={t('tpl.table.unit')} value={f.unit ?? ''} onChange={(ev) => setLook(setFormat(look, k, { ...f, unit: ev.target.value }))} />
              </div>
            );
          })}
        </div>
        <p className={css.note}>{t('tpl.table.formatNote')}</p>
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
export function TemplateEditor({ state, update, refLabel }: { state: BuilderState; update: Up; refLabel?: (id: string) => string | undefined }) {
  if (state.view === 'STORY_TABLE_COMPARISON') return <ComparisonEditor state={state} update={update} />;
  if (state.view === 'STORY_TEXT_CONCLUSION_REASONS') return <ConclusionEditor state={state} update={update} refLabel={refLabel} />;
  return null;
}

/** 右：今の型の見せ方（内容は書かせない） */
export function TemplateLookPanel({ state, update }: { state: BuilderState; update: Up }) {
  const t = useT();
  const locale = useLocale();
  if (!state.view) return null;
  const def = STORY_TEMPLATES[state.view];
  return (
    <>
      <div className={css.outputBox}>
        <p className={tp.now}>{t('tpl.now')} <b>{localize(def.label, locale)}</b></p>
        <p className={css.note}>{localize(def.purpose, locale)}</p>
      </div>
      {state.view === 'STORY_TABLE_COMPARISON' ? <ComparisonLookPanel state={state} update={update} /> : <ConclusionLookPanel state={state} update={update} />}
    </>
  );
}
