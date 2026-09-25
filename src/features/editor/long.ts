import type { Dataset, LongPivot, LongSource } from '@/registry';
import { parseNumber } from './edit';
import type { BuilderState } from './state';

/**
 * 縦長の表（1行に1つの値。例：年｜地域｜タイプ｜指標｜値）を読み、チャート用の「行×列」の表を切り出す。
 * 切り出し方（どの列を行・列・値にし、残りをどの値で絞るか、割合にするか、合計を足すか）はユーザーが選ぶ。
 * 元の表と切り出し方は dataset.long に残し、選び直すたびに作り直す。
 */

export interface LongTable {
  headers: string[];
  rows: string[][];
}

const isYear = (v: string) => /^(19|20)\d{2}$/.test(v.trim());
const distinct = (xs: string[]) => [...new Set(xs.filter((x) => x !== ''))];

/** 列の種類：切り口（文字・年）か、値（数値） */
export function columnKinds(t: LongTable): ('dim' | 'value')[] {
  return t.headers.map((_, k) => {
    const vs = t.rows.map((r) => (r[k] ?? '').trim()).filter((v) => v !== '');
    if (!vs.length) return 'dim';
    if (vs.every(isYear)) return 'dim';
    return vs.every((v) => parseNumber(v) != null) ? 'value' : 'dim';
  });
}

/**
 * 貼った文字が縦長の表か。1行目が見出し、切り口の列が2つ以上・値の列が1つ以上あり、
 * 最初の切り口に同じ値が繰り返し出てくる（例：年が地域の数だけ並ぶ）なら縦長とみなす。
 */
export function detectLong(text: string): LongTable | null {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 3) return null;
  const grid = lines.map((l) => l.split('\t').map((c) => c.trim()));
  const width = Math.max(...grid.map((r) => r.length));
  if (width < 3) return null;
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const headers = pad(grid[0]!).map((h, k) => h || `#${k + 1}`);
  // 1行目が見出し（数値だけの行ではない）
  if (grid[0]!.every((v) => v === '' || (parseNumber(v) != null && !isYear(v)))) return null;
  const t: LongTable = { headers, rows: grid.slice(1).map(pad) };
  const kinds = columnKinds(t);
  const dims = kinds.map((k, i) => (k === 'dim' ? i : -1)).filter((i) => i >= 0);
  const values = kinds.map((k, i) => (k === 'value' ? i : -1)).filter((i) => i >= 0);
  if (dims.length < 2 || !values.length) return null;
  const first = t.rows.map((r) => r[dims[0]!] ?? '');
  if (distinct(first).length === first.filter((x) => x !== '').length) return null;
  return t;
}

/** はじめの切り出し方：行＝年（なければ最初の切り口）、列＝次の切り口、値＝最後の数値の列、残りは最初の値で絞る */
export function defaultPivot(t: LongTable): LongPivot {
  const kinds = columnKinds(t);
  const dims = kinds.map((k, i) => (k === 'dim' ? i : -1)).filter((i) => i >= 0);
  const values = kinds.map((k, i) => (k === 'value' ? i : -1)).filter((i) => i >= 0);
  const yearCol = dims.find((k) => t.rows.every((r) => !r[k] || isYear(r[k]!)));
  const row = yearCol ?? dims[0]!;
  const col = dims.find((k) => k !== row)!;
  return {
    row, col, value: values[values.length - 1] ?? 0,
    filters: dims.filter((k) => k !== row && k !== col).map((k) => ({ col: k, value: distinct(t.rows.map((r) => r[k] ?? ''))[0] ?? null })),
    share: null, total: null,
  };
}

/** 切り口の列にある値（出てきた順。年なら小さい順） */
export function valuesOf(t: LongTable, k: number): string[] {
  const vs = distinct(t.rows.map((r) => (r[k] ?? '').trim()));
  return vs.every(isYear) ? [...vs].sort() : vs;
}

export interface PivotResult {
  rows: string[];
  cols: string[];
  values: (number | null)[][];
  /** 同じ組み合わせが複数行あって足し合わせた数 */
  merged: number;
  /** 割合の分母が 0 などで空になったセルの数 */
  empty: number;
}

/**
 * 切り出す。絞り込みに合う行を、行×列ごとに足す。
 * 割合（share）の時は、分子＝絞り込みどおり、分母＝その列の絞り込みだけ外したもの、で年・地域ごとに割る（%）。
 * 合計の列（total）は、分子・分母をそれぞれ足してから割る（地域の % の平均ではなく、量の重みで計算する）。
 */
export function pivotTable(t: LongTable, p: LongPivot): PivotResult {
  const rows = valuesOf(t, p.row), cols = valuesOf(t, p.col);
  const ri = new Map(rows.map((v, i) => [v, i])), ci = new Map(cols.map((v, i) => [v, i]));
  const zero = () => rows.map(() => cols.map(() => 0));
  const num = zero(), den = zero(), seen = zero();
  const has = rows.map(() => cols.map(() => false));
  for (const r of t.rows) {
    const i = ri.get((r[p.row] ?? '').trim()), k = ci.get((r[p.col] ?? '').trim());
    if (i == null || k == null) continue;
    const v = parseNumber(r[p.value] ?? '');
    if (v == null) continue;
    const pass = (skip: number | null) => p.filters.every((f) => f.col === skip || f.value == null || (r[f.col] ?? '').trim() === f.value);
    if (pass(null)) { num[i]![k]! += v; seen[i]![k]! += 1; has[i]![k] = true; }
    if (p.share != null && pass(p.share)) den[i]![k]! += v;
  }
  const merged = seen.flat().filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);
  let empty = 0;
  const cell = (n: number, d: number, any: boolean): number | null => {
    if (p.share == null) return any ? n : null;
    if (!(d > 0)) { empty++; return null; }
    return (n / d) * 100;
  };
  const values = rows.map((_, i) => cols.map((_, k) => cell(num[i]![k]!, den[i]![k]!, has[i]![k]!)));
  const outCols = [...cols];
  if (p.total) {
    outCols.push(p.total);
    rows.forEach((_, i) => {
      const n = num[i]!.reduce((s, x) => s + x, 0), d = den[i]!.reduce((s, x) => s + x, 0);
      values[i]!.push(p.share == null ? (has[i]!.some(Boolean) ? n : null) : d > 0 ? (n / d) * 100 : null);
    });
  }
  // 割合は小数1桁に丸める（表とグラフの数字を合わせる）
  if (p.share != null) values.forEach((r) => r.forEach((v, k) => { if (v != null) r[k] = Math.round(v * 10) / 10; }));
  return { rows, cols: outCols, values, merged, empty };
}

/** 縦長の表と切り出し方から、チャート用の表（行×列）を作る。単位は割合なら %、そのままなら元の値の単位 */
export function longDataset(d: BuilderState['dataset'], L: LongSource, p: LongPivot): BuilderState['dataset'] {
  const r = pivotTable(L, p);
  const dataset: BuilderState['dataset'] = {
    ...d,
    rows: r.rows, cols: r.cols,
    unit: p.share != null ? '%' : L.unit ?? '',
    dimensions: { ...(d.dimensions ?? {}), rows: L.headers[p.row] ?? '', cols: L.headers[p.col] ?? '' },
    periods: {
      current: { ...d.periods.current, values: r.values },
      base: { ...d.periods.base, values: r.rows.map(() => r.cols.map(() => null)) },
    },
    long: { ...L, pivot: p },
  };
  delete dataset.groups;
  return dataset;
}

/** 縦長の表と切り出し方で、今のデータ（行×列）を作り直す。行・列の名前が変わったら、名前を指す設定は外す */
export function applyLong(s: BuilderState, t: LongTable, p: LongPivot): BuilderState {
  const d = s.dataset;
  // 元の値の単位：切り出し中なら前のまま。初めて読む表は分からないので空（「データ」の単位で入れる）
  const unit = d.long ? d.long.unit : '';
  const dataset = longDataset(d, { headers: t.headers, rows: t.rows, pivot: p, ...(unit ? { unit } : {}) }, p);
  const renamed = dataset.rows.join('\u0000') !== d.rows.join('\u0000') || dataset.cols.join('\u0000') !== d.cols.join('\u0000');
  const controls = { ...s.controls };
  if (renamed) for (const k of ['items', 'series', 'highlight', 'base_target', 'compare_target', 'compare_target2'] as const) delete controls[k];
  return { ...s, dataset, controls };
}

/** 切り出しをやめ、今の表を直接編集できるようにする（元の縦長の表は捨てる） */
export function detachLong(s: BuilderState): BuilderState {
  const { long: _l, ...dataset } = s.dataset;
  void _l;
  return { ...s, dataset };
}

/** 行と列を入れ替える（切り出し方の行と列を入れ替えて作り直す） */
export const swapLong = (s: BuilderState): BuilderState => {
  const L = s.dataset.long;
  if (!L) return s;
  return applyLong(s, L, { ...L.pivot, row: L.pivot.col, col: L.pivot.row });
};

// ──────────── コピー（表をタブ区切りで。Excel にそのまま貼れる） ────────────

const cellText = (v: number | null) => (v == null ? '' : String(v));

/** 今の表（行×列）をタブ区切りの文字に。左上は行が表すもの */
export function tableToTsv(d: Dataset, period: 'current' | 'base' = 'current'): string {
  const p = d.periods[period];
  const head = [d.dimensions?.rows ?? '', ...d.cols];
  const body = d.rows.map((r, i) => [r, ...d.cols.map((_, k) => cellText(p?.values[i]?.[k] ?? null))]);
  return [head, ...body].map((r) => r.join('\t')).join('\n');
}

/** 元の縦長の表をタブ区切りの文字に */
export const longToTsv = (t: LongSource | LongTable) => [t.headers, ...t.rows].map((r) => r.join('\t')).join('\n');

/**
 * 切り出し方を整える：行と列が同じなら入れ替え、行・列以外の切り口には必ず絞り込みを置き（前の選択を残す）、
 * 割合の列が行・列になったり「すべて合計」になったら割合をやめる
 */
export function normalizePivot(t: LongTable, p: LongPivot, prev?: LongPivot): LongPivot {
  const kinds = columnKinds(t);
  let { row, col } = p;
  if (row === col) col = prev && prev.row !== row ? prev.row : kinds.findIndex((k, i) => k === 'dim' && i !== row);
  const dims = kinds.map((k, i) => (k === 'dim' ? i : -1)).filter((i) => i >= 0 && i !== row && i !== col);
  const filters = dims.map((k) => p.filters.find((f) => f.col === k) ?? { col: k, value: valuesOf(t, k)[0] ?? null });
  const share = p.share != null && filters.some((f) => f.col === p.share && f.value != null) ? p.share : null;
  const value = kinds[p.value] === 'value' ? p.value : kinds.lastIndexOf('value');
  return { ...p, row, col, value, filters, share };
}
