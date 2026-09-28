import { normalizeProject, viewOf, type ProjectState } from './project';
import { EMPTY_DOC, type DocRef } from './storage';

/**
 * 保存していない編集の「下書き」（ブラウザに残す。docs/decisions.md「下書き」）。
 * 新しく始める時に今の編集を消さずに取っておき、マイチャート・入り口から戻れるようにする。
 * 最新 5 件・30 日まで。別の端末には出ない（サーバーには送らない）
 */
export const DRAFTS_KEY = 'chart-advisor:drafts';
export const DRAFT_LIMIT = 5;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export interface Draft {
  id: string;
  savedAt: number;
  /** 一覧に出す名前（保存済みチャートの名前か、1枚目の見出し） */
  title: string;
  slides: number;
  project: ProjectState;
  /** 保存済みチャートを直していた時は、その id・版（下書きを開くと、そのチャートの続きとして編集できる） */
  doc: DocRef;
}

const store = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

export function listDrafts(now = Date.now()): Draft[] {
  try {
    const raw = JSON.parse(store()?.getItem(DRAFTS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((d): d is Draft => d && typeof d.id === 'string' && typeof d.savedAt === 'number' && now - d.savedAt < MAX_AGE)
      .map((d) => ({ ...d, project: normalizeProject(d.project) ?? d.project, doc: { ...EMPTY_DOC, ...d.doc } }));
  } catch { return []; }
}

function write(list: Draft[]) {
  try { store()?.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, DRAFT_LIMIT))); } catch { /* 残せない環境では何もしない */ }
}

/** 今の編集を下書きに残す（同じ保存済みチャートの下書きがあれば置き換える）。残した下書きを返す */
export function addDraft(project: ProjectState, doc: DocRef, now = Date.now()): Draft {
  const title = doc.name || viewOf(project, 0).title || '';
  const d: Draft = { id: `d${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: now, title, slides: project.slides.length, project, doc };
  const rest = listDrafts(now).filter((x) => !(doc.id && x.doc.id === doc.id));
  write([d, ...rest]);
  return d;
}

export function getDraft(id: string): Draft | null {
  return listDrafts().find((d) => d.id === id) ?? null;
}

export function removeDraft(id: string) {
  write(listDrafts().filter((d) => d.id !== id));
}
