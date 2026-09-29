import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteRemoteDraft, getRemoteDraft, listRemoteDrafts, putRemoteDraft } from '@/lib/repo/drafts';
import { normalizeProject, viewOf, type ProjectState } from './project';
import { EMPTY_DOC, type DocRef } from './storage';

/**
 * 保存していない編集の「下書き」（docs/decisions.md「下書き」「下書きをアカウントに残す」）。
 * ・ログイン中：アカウントに残す（chart_drafts）。どの PC からでもマイチャートの「下書き」で開ける
 * ・ログインしていない：このブラウザにだけ残す。最新 5 件・30 日まで
 * 「保存」したチャートは完成品として「チャート」に、下書きは「下書き」に分けて置く。
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
  const title = draftTitle(project, doc);
  const d: Draft = { id: `d${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: now, title, slides: project.slides.length, project, doc: draftDoc(doc) };
  const rest = listDrafts(now).filter((x) => !(doc.id && x.doc.id === doc.id) && x.id !== doc.draftId);
  write([d, ...rest]);
  return d;
}

export function getDraft(id: string): Draft | null {
  return listDrafts().find((d) => d.id === id) ?? null;
}

export function removeDraft(id: string) {
  write(listDrafts().filter((d) => d.id !== id));
}

/** 一覧に出す名前（保存済みチャートの名前か、1枚目の見出し） */
export const draftTitle = (project: ProjectState, doc: DocRef) => doc.name || viewOf(project, 0).title || '';

/** 下書きの中に持つ DocRef（下書き自身の印は持たない） */
export function draftDoc(doc: DocRef): DocRef {
  const { draftId: _i, draftSnapshot: _s, ...rest } = doc;
  void _i; void _s;
  return rest;
}

/** 下書きの置き場所（ログイン中はアカウント、そうでなければこのブラウザ）。どちらも同じ使い方 */
export interface DraftStore {
  remote: boolean;
  list(): Promise<Draft[]>;
  get(id: string): Promise<Draft | null>;
  /** 今の編集を下書きに残す。doc.draftId（無ければ同じ保存済みチャートの下書き）があれば置き換える。残した下書きの id を返す */
  put(project: ProjectState, doc: DocRef): Promise<string>;
  remove(id: string): Promise<void>;
}

export function draftStore(sb: SupabaseClient | null | undefined): DraftStore {
  if (!sb) {
    return {
      remote: false,
      list: async () => listDrafts(),
      get: async (id) => getDraft(id),
      put: async (project, doc) => addDraft(project, doc).id,
      remove: async (id) => removeDraft(id),
    };
  }
  return {
    remote: true,
    list: () => listRemoteDrafts(sb),
    get: (id) => (isLocalDraftId(id) ? Promise.resolve(getDraft(id)) : getRemoteDraft(sb, id)),
    put: async (project, doc) => {
      let id = doc.draftId && !isLocalDraftId(doc.draftId) ? doc.draftId : null;
      if (!id && doc.id) id = (await listRemoteDrafts(sb)).find((d) => d.doc.id === doc.id)?.id ?? null;
      return putRemoteDraft(sb, { id, title: draftTitle(project, doc), slides: project.slides.length, project, doc: draftDoc(doc) });
    },
    remove: (id) => (isLocalDraftId(id) ? Promise.resolve(removeDraft(id)) : deleteRemoteDraft(sb, id)),
  };
}

/** このブラウザの下書きの id（'d' で始まる。アカウントの下書きは uuid） */
export const isLocalDraftId = (id: string) => /^d[0-9a-z]+$/.test(id) && !/^[0-9a-f]{8}-/.test(id);

/**
 * ログインした時、このブラウザに残っていた下書きをアカウントへ移す（移せたものはブラウザから消す）。
 * 移した件数を返す。移せなかったものはブラウザに残る
 */
export async function moveLocalDraftsToAccount(sb: SupabaseClient): Promise<number> {
  let n = 0;
  for (const d of listDrafts().reverse()) {
    try {
      await putRemoteDraft(sb, { id: null, title: d.title, slides: d.slides, project: d.project, doc: draftDoc(d.doc) });
      removeDraft(d.id);
      n++;
    } catch { /* 残して次へ */ }
  }
  return n;
}
