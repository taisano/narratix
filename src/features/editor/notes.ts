import type { BuilderState } from './state';

/** 右の列の補足・検討事項（見出し＋本文）。チャートの右に、結論を支える数字と論点を並べる */
export type NoteTone = 'accent' | 'up' | 'down' | 'plain';
export interface NoteItem { head: string; body: string; tone?: NoteTone }
export interface SlideNotes {
  /** 出すか（外しても書いた内容は残す） */
  on: boolean;
  /** 列の見出し（無ければ「補足・検討事項」） */
  title?: string;
  items: NoteItem[];
}

export const MAX_NOTES = 4;
export const NOTE_TONES: readonly NoteTone[] = ['accent', 'up', 'down', 'plain'];

/** 新しく足す時の最初の1項目 */
export const newNotes = (): SlideNotes => ({ on: true, items: [{ head: '', body: '', tone: 'accent' }] });

/** ViewSpec の slide に入れる notes（出さない・空なら入れない） */
export function notesOf(s: BuilderState): { notes?: { title?: string; items: NoteItem[] } } {
  const n = s.notes;
  if (!n?.on) return {};
  const items = n.items.filter((i) => i.head.trim() || i.body.trim()).slice(0, MAX_NOTES).map((i) => ({ head: i.head.trim(), body: i.body.trim(), ...(i.tone ? { tone: i.tone } : {}) }));
  if (!items.length) return {};
  return { notes: { ...(n.title?.trim() ? { title: n.title.trim() } : {}), items } };
}
