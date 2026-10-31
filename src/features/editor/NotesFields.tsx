'use client';

import { useT } from '@/i18n/ui';
import { MAX_NOTES, NOTE_TONES, newNotes, type NoteItem, type NoteTone, type SlideNotes } from './notes';
import type { BuilderState } from './state';
import css from '../ui.module.css';

/**
 * 「スライド」欄の補足・検討事項（右の列）。選んだ時だけ付く：チェックを入れると、チャートが左に寄り、右に見出し＋本文が並ぶ。
 * 外しても書いた内容は残る（もう一度入れると戻る）
 */
export function NotesFields({ state: s, update }: { state: BuilderState; update: (patch: Partial<BuilderState>) => void }) {
  const t = useT();
  const n = s.notes;
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
              <input className={css.input} value={it.head} maxLength={60} placeholder={t('field.noteHead')} aria-label={`${t('field.noteHead')} ${i + 1}`} onChange={(e) => setItem(i, { head: e.target.value })} />
              <select className={css.select} value={it.tone ?? 'plain'} aria-label={t('field.noteTone')} onChange={(e) => setItem(i, { tone: e.target.value as NoteTone })}>
                {NOTE_TONES.map((x) => <option key={x} value={x}>{t(`field.noteTone.${x}`)}</option>)}
              </select>
              <button type="button" className={css.linkBtn} aria-label={t('field.noteRemove')} disabled={n.items.length <= 1} onClick={() => set({ items: n.items.filter((_, k) => k !== i) })}>×</button>
            </span>
            <textarea className={css.input} rows={3} maxLength={400} value={it.body} placeholder={t('field.noteBody')} aria-label={`${t('field.noteBody')} ${i + 1}`} onChange={(e) => setItem(i, { body: e.target.value })} />
          </div>
        ))}
        {n.items.length < MAX_NOTES && <button type="button" className={css.linkBtn} onClick={() => set({ items: [...n.items, { head: '', body: '', tone: 'plain' }] })}>{t('field.noteAdd')}</button>}
      </>}
    </div>
  );
}
