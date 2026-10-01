import type { Locale, StoryTemplateId } from '@/registry';
import { isTimeAxis } from '@/engine/transform/cagr';
import type {
  ComparisonContent, ComparisonLook, ConclusionContent, ConclusionLook, Emphasis, NumberFormatDef, Reason, TemplateContent, TemplateLook,
} from '@/engine/layout/templates';
import type { BuilderState } from '../editor/state';

/**
 * 表・言葉の型の中身（Content）と見せ方（Look）：最初の中身、読み込み、操作。
 * 中身はデータ（Dataset）とは別に持つので、見せ方を行き来してもデータも中身も失わない
 */

let seq = 0;
const newReasonId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

// ──────────── 最初の中身 ────────────

/** 空の見本（候補A〜C × 市場規模・成長率・収益性・実行難易度） */
export function sampleComparison(locale: Locale): ComparisonContent {
  const ja = locale === 'ja';
  return {
    cells: [
      [ja ? '比較項目' : 'Criteria', ja ? '候補A' : 'Option A', ja ? '候補B' : 'Option B', ja ? '候補C' : 'Option C'],
      [ja ? '市場規模' : 'Market size', '', '', ''],
      [ja ? '成長率' : 'Growth', '', '', ''],
      [ja ? '収益性' : 'Profitability', '', '', ''],
      [ja ? '実行難易度' : 'Difficulty', '', '', ''],
    ],
    headerRow: true, headerCol: true, lead: '', note: '',
  };
}

/** 見本の比較対象の名前（見本のままなら知らせる。比較項目の名前は実際に使えるので知らせない） */
export const SAMPLE_HEADS = new Set(['候補A', '候補B', '候補C', 'Option A', 'Option B', 'Option C']);

const num = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 100) / 100));

/**
 * 今のデータ（最新の期間）を文字の表にして始める（比較対象が列、比較項目が行）。
 * 行が年（推移のデータ）なら、最新の年の1行。行が項目なら、項目を比較対象（列）、列を比較項目（行）にする
 */
export function comparisonFromData(d: BuilderState['dataset'], locale: Locale): ComparisonContent {
  const vals = d.periods.current.values;
  const corner = d.dimensions?.rows || (locale === 'ja' ? '比較項目' : 'Criteria');
  if (isTimeAxis(d.rows)) {
    const last = d.rows.length - 1;
    return {
      cells: [[corner, ...d.cols], [d.rows[last] ?? '', ...d.cols.map((_, j) => num(vals[last]?.[j]))]],
      headerRow: true, headerCol: true, lead: '', note: '',
    };
  }
  return {
    cells: [[d.dimensions?.cols || corner, ...d.rows], ...d.cols.map((c, j) => [c, ...d.rows.map((_, i) => num(vals[i]?.[j]))])],
    headerRow: true, headerCol: true, lead: '', note: '',
  };
}

export const emptyConclusion = (): ConclusionContent => ({
  reasons: [0, 1, 2].map(() => ({ id: newReasonId(), heading: '', body: '', ref: null })),
  caveat: '',
});

export const defaultComparisonLook = (): ComparisonLook => ({
  emphasis: { kind: 'none' }, showLead: true, showSource: true, rowLines: true, headerFill: true, formatAxis: 'row', formats: {},
});
export const defaultConclusionLook = (): ConclusionLook => ({ layout: 'horizontal', emphasis: null, showNumbers: true, showRefs: true, showCaveat: true });

/**
 * 型を選んだ時：まだ中身が無ければ作る（データを入れてあれば、そのデータから。見本のままなら空の見本）。
 * 中身・見せ方がすでにあれば、そのまま（前に入れたものを戻す）
 */
export function ensureTemplate(s: BuilderState, id: StoryTemplateId, sample: boolean): Pick<BuilderState, 'view' | 'content' | 'look'> {
  const content: TemplateContent = { ...(s.content ?? {}) };
  const look: TemplateLook = { ...(s.look ?? {}) };
  if (id === 'STORY_TABLE_COMPARISON') {
    content.comparison ??= sample ? sampleComparison(s.slideLocale) : comparisonFromData(s.dataset, s.slideLocale);
    look.comparison ??= defaultComparisonLook();
  } else {
    content.conclusion ??= emptyConclusion();
    look.conclusion ??= defaultConclusionLook();
  }
  return { view: id, content, look };
}

// ──────────── 読み込み（壊れていても読めるところは読む） ────────────

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function normEmphasis(v: unknown): Emphasis {
  const e = v as Partial<Emphasis & { index: number; row: number; col: number }> | null;
  if (e?.kind === 'col' || e?.kind === 'row') return Number.isInteger(e.index) ? { kind: e.kind, index: e.index! } : { kind: 'none' };
  if (e?.kind === 'cell') return Number.isInteger(e.row) && Number.isInteger(e.col) ? { kind: 'cell', row: e.row!, col: e.col! } : { kind: 'none' };
  return { kind: 'none' };
}

export function normalizeContent(v: unknown): TemplateContent | undefined {
  const o = v as TemplateContent | null;
  if (!o || typeof o !== 'object') return undefined;
  const out: TemplateContent = {};
  const c = o.comparison;
  if (c && Array.isArray(c.cells)) {
    out.comparison = {
      cells: c.cells.filter(Array.isArray).slice(0, 40).map((r) => r.slice(0, 20).map((x) => str(x, 500))),
      headerRow: bool(c.headerRow, true), headerCol: bool(c.headerCol, true), lead: str(c.lead, 500), note: str(c.note, 500),
    };
  }
  const t = o.conclusion;
  if (t && Array.isArray(t.reasons)) {
    out.conclusion = {
      reasons: t.reasons.slice(0, 3).map((r: Partial<Reason>) => ({ id: str(r?.id, 40) || newReasonId(), heading: str(r?.heading, 300), body: str(r?.body, 1500), ref: typeof r?.ref === 'string' ? r.ref : null })),
      caveat: str(t.caveat, 1000),
    };
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizeLook(v: unknown): TemplateLook | undefined {
  const o = v as TemplateLook | null;
  if (!o || typeof o !== 'object') return undefined;
  const out: TemplateLook = {};
  if (o.comparison && typeof o.comparison === 'object') {
    const c = o.comparison, d = defaultComparisonLook();
    out.comparison = {
      emphasis: normEmphasis(c.emphasis), showLead: bool(c.showLead, d.showLead), showSource: bool(c.showSource, d.showSource),
      rowLines: bool(c.rowLines, d.rowLines), headerFill: bool(c.headerFill, d.headerFill), formatAxis: c.formatAxis === 'col' ? 'col' : 'row',
      formats: c.formats && typeof c.formats === 'object' ? c.formats : {},
      ...(['left', 'center', 'right'].includes(c.align as string) ? { align: c.align } : {}),
    };
  }
  if (o.conclusion && typeof o.conclusion === 'object') {
    const c = o.conclusion, d = defaultConclusionLook();
    out.conclusion = {
      layout: c.layout === 'vertical' ? 'vertical' : 'horizontal', emphasis: Number.isInteger(c.emphasis) ? c.emphasis : null,
      showNumbers: bool(c.showNumbers, d.showNumbers), showRefs: bool(c.showRefs, d.showRefs), showCaveat: bool(c.showCaveat, d.showCaveat),
      ...(['left', 'center', 'right'].includes(c.align as string) ? { align: c.align } : {}),
    };
  }
  return Object.keys(out).length ? out : undefined;
}

// ──────────── 比較表の操作（強調・数の形の位置も合わせて動かす） ────────────

type Table = { content: ComparisonContent; look: ComparisonLook };
const width = (c: ComparisonContent) => Math.max(0, ...c.cells.map((r) => r.length));
const pad = (cells: string[][], w: number) => cells.map((r) => (r.length >= w ? r : [...r, ...Array(w - r.length).fill('')]));

/** 位置の付け替え（消した位置は null） */
type Remap = (i: number) => number | null;
function remapLook(look: ComparisonLook, axis: 'row' | 'col', f: Remap): ComparisonLook {
  const e = look.emphasis;
  let emphasis: Emphasis = e;
  if (e.kind === axis) { const k = f(e.index); emphasis = k == null ? { kind: 'none' } : { kind: axis, index: k }; }
  if (e.kind === 'cell') { const k = f(axis === 'row' ? e.row : e.col); emphasis = k == null ? { kind: 'none' } : axis === 'row' ? { ...e, row: k } : { ...e, col: k }; }
  let formats = look.formats;
  if (look.formatAxis === axis) {
    formats = {};
    for (const [key, v] of Object.entries(look.formats)) { const k = f(Number(key)); if (k != null) formats[String(k)] = v; }
  }
  return { ...look, emphasis, formats };
}

export function setCell(t: Table, r: number, c: number, v: string): Table {
  const w = Math.max(width(t.content), c + 1);
  const cells = pad(t.content.cells, w);
  while (cells.length <= r) cells.push(Array(w).fill(''));
  return { ...t, content: { ...t.content, cells: cells.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) } };
}

/** 貼り付け（Excel などのタブ区切り・改行）。始めのセルから右下へ入れ、足りなければ行・列を足す */
export function pasteCells(t: Table, r: number, c: number, text: string): Table {
  const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
  let out = t;
  rows.forEach((row, i) => row.forEach((v, j) => { out = setCell(out, r + i, c + j, v.trim()); }));
  return out;
}

export function addRow(t: Table, at: number = t.content.cells.length): Table {
  const w = Math.max(1, width(t.content));
  const cells = [...t.content.cells.slice(0, at), Array(w).fill(''), ...t.content.cells.slice(at)];
  return { content: { ...t.content, cells }, look: remapLook(t.look, 'row', (i) => (i >= at ? i + 1 : i)) };
}
export function removeRow(t: Table, at: number): Table {
  if (t.content.cells.length <= 1) return t;
  return { content: { ...t.content, cells: t.content.cells.filter((_, i) => i !== at) }, look: remapLook(t.look, 'row', (i) => (i === at ? null : i > at ? i - 1 : i)) };
}
export function addCol(t: Table, at: number = width(t.content)): Table {
  const cells = pad(t.content.cells, width(t.content)).map((r) => [...r.slice(0, at), '', ...r.slice(at)]);
  return { content: { ...t.content, cells }, look: remapLook(t.look, 'col', (i) => (i >= at ? i + 1 : i)) };
}
export function removeCol(t: Table, at: number): Table {
  if (width(t.content) <= 1) return t;
  const cells = pad(t.content.cells, width(t.content)).map((r) => r.filter((_, j) => j !== at));
  return { content: { ...t.content, cells }, look: remapLook(t.look, 'col', (i) => (i === at ? null : i > at ? i - 1 : i)) };
}
const swap = (i: number, a: number, b: number) => (i === a ? b : i === b ? a : i);
export function moveRow(t: Table, at: number, dir: -1 | 1): Table {
  const to = at + dir;
  if (to < 0 || to >= t.content.cells.length) return t;
  const cells = t.content.cells.map((_, i) => t.content.cells[swap(i, at, to)]!);
  return { content: { ...t.content, cells }, look: remapLook(t.look, 'row', (i) => swap(i, at, to)) };
}
export function moveCol(t: Table, at: number, dir: -1 | 1): Table {
  const to = at + dir;
  if (to < 0 || to >= width(t.content)) return t;
  const cells = pad(t.content.cells, width(t.content)).map((r) => r.map((_, j) => r[swap(j, at, to)]!));
  return { content: { ...t.content, cells }, look: remapLook(t.look, 'col', (i) => swap(i, at, to)) };
}

export const setFormat = (look: ComparisonLook, index: number, f: NumberFormatDef | null): ComparisonLook => {
  const formats = { ...look.formats };
  if ((f && f.kind !== 'auto') || f?.unit?.trim()) formats[String(index)] = f!; else delete formats[String(index)];
  return { ...look, formats };
};

// ──────────── 結論＋根拠の操作 ────────────

export const addReason = (c: ConclusionContent): ConclusionContent =>
  c.reasons.length >= 3 ? c : { ...c, reasons: [...c.reasons, { id: newReasonId(), heading: '', body: '', ref: null }] };

/** 根拠を消す（強調の位置も合わせる） */
export function removeReason(c: ConclusionContent, look: ConclusionLook, i: number): { content: ConclusionContent; look: ConclusionLook } {
  if (c.reasons.length <= 1) return { content: c, look };
  const emphasis = look.emphasis == null || look.emphasis === i ? null : look.emphasis > i ? look.emphasis - 1 : look.emphasis;
  return { content: { ...c, reasons: c.reasons.filter((_, k) => k !== i) }, look: { ...look, emphasis } };
}
export function moveReason(c: ConclusionContent, look: ConclusionLook, i: number, dir: -1 | 1): { content: ConclusionContent; look: ConclusionLook } {
  const j = i + dir;
  if (j < 0 || j >= c.reasons.length) return { content: c, look };
  const reasons = c.reasons.map((_, k) => c.reasons[swap(k, i, j)]!);
  return { content: { ...c, reasons }, look: { ...look, emphasis: look.emphasis == null ? null : swap(look.emphasis, i, j) } };
}
export const updateReason = (c: ConclusionContent, i: number, patch: Partial<Reason>): ConclusionContent =>
  ({ ...c, reasons: c.reasons.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

/** 中身が入っているか（左の地図の「確認済み」に使う）：比較表は本文のセルが1つ以上、言葉は根拠が1つ以上 */
export function templateFilled(s: Pick<BuilderState, 'view' | 'content'>): boolean {
  if (s.view === 'STORY_TABLE_COMPARISON') {
    const c = s.content?.comparison;
    if (!c) return false;
    return c.cells.some((r, i) => !(c.headerRow && i === 0) && r.some((x, j) => !(c.headerCol && j === 0) && x.trim()));
  }
  if (s.view === 'STORY_TEXT_CONCLUSION_REASONS') return !!s.content?.conclusion?.reasons.some((r) => r.heading.trim() || r.body.trim());
  return false;
}
