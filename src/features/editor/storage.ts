import { initialProject, normalizeProject, type ProjectState } from './project';

/** ブラウザに残す作業中の控え（ログインしていなくても消えないように） */
export const STATE_KEY = 'chart-advisor:mekko-builder:v1';
export const DOC_KEY = 'chart-advisor:mekko-builder:doc';

/** 今開いている保存済みチャート（未保存なら id は null） */
export interface DocRef {
  id: string | null;
  version: number | null;
  name: string | null;
  /** 最後に保存・読み込みした時の状態（未保存の変更の判定に使う） */
  snapshot: string | null;
  /** 保存したタグ（先頭は言語のタグ） */
  tags?: string[];
  /** 管理者が Library の見本を直している時の、その見本（保存の欄に「見本を更新」を出す） */
  library?: { id: string; title: string; tags: string[] };
}

export const EMPTY_DOC: DocRef = { id: null, version: null, name: null, snapshot: null };

export function readStored(): { state: ProjectState | null; doc: DocRef | null } {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    const d = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null');
    return {
      state: normalizeProject(s),
      doc: d && typeof d === 'object' && 'id' in d ? { ...EMPTY_DOC, ...d } : null,
    };
  } catch {
    return { state: null, doc: null };
  }
}

export function writeStored(state: ProjectState, doc: DocRef) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    localStorage.setItem(DOC_KEY, JSON.stringify(doc));
  } catch { /* 保存できない環境では何もしない */ }
}

/**
 * 失われると困る変更があるか。
 * 保存済みなら最後の保存から変わったか、未保存ならサンプルから変わったか。
 */
export function hasUnsavedChanges(state: ProjectState, doc: DocRef): boolean {
  const now = JSON.stringify(state);
  return doc.snapshot != null ? doc.snapshot !== now : JSON.stringify(initialProject()) !== now;
}
