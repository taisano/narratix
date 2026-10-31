'use client';

import { useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { NOTE_TOKENS } from '@/engine/layout/notes-tokens';
import { viewAxes } from './state';
import { MAX_NOTES, NOTE_TONES, newNotes, type NoteItem, type NoteTone, type SlideNotes } from './notes';
import type { BuilderState } from './state';
import css from '../ui.module.css';

/**
 * 「スライド」欄の補足・検討事項（右の列）。選んだ時だけ付く：チェックを入れると、チャートが左に寄り、右に見出し＋本文が並ぶ。
 * 外しても書いた内容は残る（もう一度入れると戻る）
 */
export function NotesFields({ state: s, update }: { state: BuilderState; update: (patch: Partial<BuilderState>) => void }) {
  const t = useT();
  const locale = useLocale();
  const n = s.notes;
  // 数字を入れる先：最後に触った欄（無ければ最初の項目の本文）
  const [at, setAt] = useState<{ i: number; k: 'head' | 'body' }>({ i: 0, k: 'body' });
  const [token, setToken] = useState('');
  const [series, setSeries] = useState('');
  const names = viewAxes(s).cols;
  const insert = () => {
    if (!n || !token) return;
    const i = Math.min(at.i, n.items.length - 1);
    const ins = `{${token}${series ? ':' + series : ''}}`;
    setItem(i, { [at.k]: (n.items[i]![at.k] ?? '') + ins } as Partial<NoteItem>);
    setToken('');
  };
  const on = !!n?.on;
  const set = (patch: Partial<SlideNotes>) => update({ notes: { ...(n ?? newNotes()), ...patch } });
  const setItem = (i: number, patch: Partial<NoteItem>) => set({ items: (n?.items ?? []).map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  return (
    <div className={`${css.field} ${css.contentField}`}>
      <label className={css.inlineCheck}>
        <input type="checkbox" checked={on} onChange={(e) => update({ notes: e.target.checked ? { ...(n ?? newNotes()), on: true, items: n?.items.length ? n.items : newNotes().items } : { ...(n ?? newNotes()), on: false } })} />
        {t('field.notes')}
      </label>
      {on && n && <>
        <p className={css.infoText}>{t('field.notesHint')}</p>
        <input className={css.input} value={n.title ?? ''} maxLength={40} placeholder={t('field.notesTitlePlaceholder')} aria-label={t('field.notesTitle')} onChange={(e) => set({ title: e.target.value })} />
        {n.items.map((it, i) => (
          <div key={i} className={css.field}>
            <span className={css.headRow}>
              <input className={css.input} value={it.head} maxLength={60} placeholder={t('field.noteHead')} aria-label={`${t('field.noteHead')} ${i + 1}`} onFocus={() => setAt({ i, k: 'head' })} onChange={(e) => setItem(i, { head: e.target.value })} />
              <select className={css.select} value={it.tone ?? 'plain'} aria-label={t('field.noteTone')} onChange={(e) => setItem(i, { tone: e.target.value as NoteTone })}>
                {NOTE_TONES.map((x) => <option key={x} value={x}>{t(`field.noteTone.${x}`)}</option>)}
              </select>
              <button type="button" className={css.linkBtn} aria-label={t('field.noteRemove')} disabled={n.items.length <= 1} onClick={() => set({ items: n.items.filter((_, k) => k !== i) })}>×</button>
            </span>
            <textarea className={css.input} rows={3} maxLength={400} value={it.body} placeholder={t('field.noteBody')} aria-label={`${t('field.noteBody')} ${i + 1}`} onFocus={() => setAt({ i, k: 'body' })} onChange={(e) => setItem(i, { body: e.target.value })} />
          </div>
        ))}
        <div className={css.row2}>
          <select className={css.select} value={token} aria-label={t('field.noteToken')} onChange={(e) => setToken(e.target.value)}>
            <option value="">{t('field.noteToken')}</option>
            {NOTE_TOKENS.map((x) => <option key={x.id} value={x.id}>{x[locale]}</option>)}
          </select>
          <select className={css.select} value={series} aria-label={t('field.noteSeries')} onChange={(e) => setSeries(e.target.value)}>
            <option value="">{t('field.noteSeriesAuto')}</option>
            {names.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button type="button" className="btn" disabled={!token} onClick={insert}>{t('field.noteInsert')}</button>
        </div>
        <p className={css.infoText}>{t('field.noteTokenHint')}</p>
        {n.items.length < MAX_NOTES && <button type="button" className={css.linkBtn} onClick={() => set({ items: [...n.items, { head: '', body: '', tone: 'plain' }] })}>{t('field.noteAdd')}</button>}
      </>}
    </div>
  );
}
