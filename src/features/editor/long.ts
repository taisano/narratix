import type { Dataset, LongPivot, LongSource } from '@/registry';
import { parseNumber } from './edit';
import type { BuilderState } from './state';

/**
 * 縦長の表（1行に1つの値。例：年｜地域｜タイプ｜指標｜値）を読み、チャート用の「行×列」の表を切り出す。
 * 数値の列が横に複数並ぶ表（例：年｜地域｜指標｜Steam｜Glass｜その他）は、数値の列を1つの切り口（区分）として縦に並べ直して読む。
 * 切り出し方（行・列・絞り込み・割合・合計・2時点）はユーザーが選ぶ。元の表と切り出し方は dataset.long に残す。
 */

export interface LongTable {
  headers: string[];
  rows: string[][];
  melted?: { name: string; from: string[] };
}

/** 時間の見出し（2021、2021 Q1、2021Q1、FY2024、2024年、2024年3月、2024/03 など） */
export const isTimeLabel = (v: string) => /^(FY\s?)?(19|20)\d{2}(\s*[年/\-.]?\s*(Q[1-4]|H[12]|[1-4]Q|\d{1,2}月?|上期|下期))?年?$/i.test(v.trim());
const isYear = (v: string) => /^(19|20)\d{2}$/.test(v.trim());
const distinct = (xs: string[]) => [...new Set(xs.filter((x) => x !== ''))];
const dimsOf = (kinds: ('dim' | 'value')[]) => kinds.map((k, i) => (k === 'dim' ? i : -1)).filter((i) => i >= 0);
const valuesIdx = (kinds: ('dim' | 'value')[]) => kinds.map((k, i) => (k === 'value' ? i : -1)).filter((i) => i >= 0);

/** 列の種類：切り口（文字・年）か、値（数値） */
export function columnKinds(t: LongTable): ('dim' | 'value')[] {
  return t.headers.map((_, k) => {
    const vs = t.rows.map((r) => (r[k] ?? '').trim()).filter((v) => v !== '');
    if (!vs.length) return 'dim';
    if (vs.every(isYear)) return 'dim';
    return vs.every((v) => parseNumber(v) != null) ? 'value' : 'dim';
  });
}

/** 横に並んだ数値の列を、1つの切り口（name）と値の列に縦に並べ直す */
function melt(t: LongTable, name: string, valueName: string): LongTable {
  const kinds = columnKinds(t);
  const dims = dimsOf(kinds), vals = valuesIdx(kinds);
  const headers = [...dims.map((k) => t.headers[k]!), name, valueName];
  const rows = t.rows.flatMap((r) => vals.map((k) => [...dims.map((d) => r[d] ?? ''), t.headers[k]!, r[k] ?? '']));
  return { headers, rows, melted: { name, from: vals.map((k) => t.headers[k]!) } };
}

/**
 * 貼った文字が縦長の表か。1行目が見出し、切り口の列が2つ以上・値の列が1つ以上あり、
 * 最初の切り口に同じ値が繰り返し出てくる（例：年が地域の数だけ並ぶ）なら縦長とみなす。
 * 数値の列が2つ以上なら、それを「区分」として縦に並べ直す（Steam・Glass… が横に並ぶ表でも、その中の割合を出せるように）。
 */
export function detectLong(text: string, names: { melt: string; value: string } = { melt: '区分', value: '値' }): LongTable | null {
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
  const dims = dimsOf(kinds), values = valuesIdx(kinds);
  if (dims.length < 2 || !values.length) return null;
  const first = t.rows.map((r) => r[dims[0]!] ?? '');
  if (distinct(first).length === first.filter((x) => x !== '').length) return null;
  const used = new Set(headers);
  const unique = (n: string) => { let x = n, i = 2; while (used.has(x)) x = `${n}${i++}`; return x; };
  return values.length >= 2 ? melt(t, unique(names.melt), unique(names.value)) : t;
}

/** 切り口の列にある値（出てきた順。時間なら古い順） */
export function valuesOf(t: LongTable, k: number): string[] {
  const vs = distinct(t.rows.map((r) => (r[k] ?? '').trim()));
  return vs.every(isTimeLabel) ? [...vs].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : vs;
}

export const isTimeCol = (t: LongTable, k: number) => t.rows.every((r) => !r[k]?.trim() || isTimeLabel(r[k]!));

/** はじめの切り出し方：行＝時間の列（なければ最初の切り口）、列＝次の切り口、値＝最後の数値の列、残りは最初の値で絞る */
export function defaultPivot(t: LongTable): LongPivot {
  const kinds = columnKinds(t);
  const dims = dimsOf(kinds), values = valuesIdx(kinds);
  const row = dims.find((k) => isTimeCol(t, k)) ?? dims[0]!;
  const col = dims.find((k) => k !== row)!;
  return {
    row, col, value: values[values.length - 1] ?? 0,
    filters: dims.filter((k) => k !== row && k !== col).map((k) => ({ col: k, value: valuesOf(t, k)[0] ?? null })),
    share: null, total: null, compare: null,
  };
}

export interface PivotResult {
  rows: string[];
  cols: string[];
  values: (number | null)[][];
  /** 2時点を比べる時の「比較」の値（なければ null） */
  base: (number | null)[][] | null;
  /** 同じ組み合わせが複数行あって足し合わせた数 */
  merged: number;
  /** 割合の分母が 0 などで空になったセルの数 */
  empty: number;
}

/**
 * 切り出す。絞り込みに合う行を、行×列ごとに足す。
 * 割合（share）の時は、分子＝絞り込みどおり、分母＝その列の絞り込みだけ外したもの、でマスごとに割る（%）。
 * 合計（total）は、行か列に1つ足す。割合なら分子・分母をそれぞれ足してから割る（% の平均ではなく、量の重みで計算する）。
 * 2時点（compare）は、その列の値ごとに「現在」と「比較」を作る。
 */
export function pivotTable(t: LongTable, p: LongPivot): PivotResult {
  const rows0 = valuesOf(t, p.row), cols0 = valuesOf(t, p.col);
  const ri = new Map(rows0.map((v, i) => [v, i])), ci = new Map(cols0.map((v, i) => [v, i]));
  const periods = p.compare ? ([['current', p.compare.current], ['base', p.compare.base]] as const) : ([['current', null]] as const);
  const grid = () => rows0.map(() => cols0.map(() => 0));
  const acc = new Map(periods.map(([k]) => [k, { num: grid(), den: grid(), seen: grid(), has: rows0.map(() => cols0.map(() => false)) }]));
  for (const r of t.rows) {
    const i = ri.get((r[p.row] ?? '').trim()), k = ci.get((r[p.col] ?? '').trim());
    if (i == null || k == null) continue;
    const v = parseNumber(r[p.value] ?? '');
    if (v == null) continue;
    const slot = p.compare ? periods.find(([, val]) => val === (r[p.compare!.col] ?? '').trim())?.[0] : 'current';
    if (!slot) continue;
    const a = acc.get(slot)!;
    const pass = (skip: number | null) => p.filters.every((f) => f.col === skip || f.col === p.compare?.col || f.value == null || (r[f.col] ?? '').trim() === f.value);
    if (pass(null)) { a.num[i]![k]! += v; a.seen[i]![k]! += 1; a.has[i]![k] = true; }
    if (p.share != null && pass(p.share)) a.den[i]![k]! += v;
  }
  let empty = 0, merged = 0;
  const on = p.total ? p.totalOn ?? 'col' : null;
  const build = (key: 'current' | 'base') => {
    const a = acc.get(key)!;
    merged += a.seen.flat().filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);
    const cell = (n: number, d: number, any: boolean): number | null => {
      if (p.share == null) return any ? n : null;
      if (!(d > 0)) { if (any) empty++; return null; }
      return Math.round((n / d) * 1000) / 10;
    };
    const out = rows0.map((_, i) => cols0.map((_, k) => cell(a.num[i]![k]!, a.den[i]![k]!, a.has[i]![k]!)));
    if (on === 'col') rows0.forEach((_, i) => out[i]!.push(cell(sum(a.num[i]!), sum(a.den[i]!), a.has[i]!.some(Boolean))));
    if (on === 'row') out.push(cols0.map((_, k) => cell(sum(a.num.map((r) => r[k]!)), sum(a.den.map((r) => r[k]!)), a.has.some((r) => r[k]))));
    return out;
  };
  const values = build('current');
  const base = p.compare ? build('base') : null;
  return {
    rows: on === 'row' ? [...rows0, p.total!] : rows0,
    cols: on === 'col' ? [...cols0, p.total!] : cols0,
    values, base, merged, empty,
  };
}
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/**
 * 表示する単位：割合なら %。そのままなら、入れた単位（long.unit）か、無ければ絞り込みの値の括弧（例：販売数量（千台）→ 千台）
 */
export function derivedUnit(L: LongSource, p: LongPivot): string {
  if (p.share != null) return '%';
  if (L.unit) return L.unit;
  for (const f of p.filters) {
    const m = f.value != null ? /[（(]([^（()）]{1,12})[）)]\s*$/.exec(f.value) : null;
    if (m) return m[1]!.trim();
  }
  return '';
}

/** 縦長の表と切り出し方から、チャート用の表（行×列）を作る。単位は割合なら %、そのままなら元の値の単位 */
export function longDataset(d: BuilderState['dataset'], L: LongSource, p: LongPivot): BuilderState['dataset'] {
  const r = pivotTable(L, p);
  const dataset: BuilderState['dataset'] = {
    ...d,
    rows: r.rows, cols: r.cols,
    unit: derivedUnit(L, p),
    dimensions: { ...(d.dimensions ?? {}), rows: L.headers[p.row] ?? '', cols: L.headers[p.col] ?? '' },
    periods: {
      current: { label: p.compare ? p.compare.current : d.periods.current.label, values: r.values },
      base: { label: p.compare ? p.compare.base : d.periods.base.label, values: r.base ?? r.rows.map(() => r.cols.map(() => null)) },
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
  const melted = t.melted ?? d.long?.melted;
  const dataset = longDataset(d, { headers: t.headers, rows: t.rows, pivot: p, ...(unit ? { unit } : {}), ...(melted ? { melted } : {}) }, p);
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

/** 行と列を入れ替える（切り出し方の行と列、合計の向きを入れ替えて作り直す） */
export const swapLong = (s: BuilderState): BuilderState => {
  const L = s.dataset.long;
  if (!L) return s;
  const p = L.pivot;
  return applyLong(s, L, { ...p, row: p.col, col: p.row, ...(p.total ? { totalOn: (p.totalOn ?? 'col') === 'col' ? 'row' as const : 'col' as const } : {}) });
};

/**
 * 切り出し方を整える：行と列が同じなら入れ替え、行・列・2時点以外の切り口には必ず絞り込みを置き（前の選択を残す）、
 * 割合の列が行・列・2時点になったり「すべて合計」になったら割合をやめる。2時点の列が行・列になったら2時点をやめる
 */
export function normalizePivot(t: LongTable, p: LongPivot, prev?: LongPivot): LongPivot {
  const kinds = columnKinds(t);
  let { row, col } = p;
  if (row === col) col = prev && prev.row !== row ? prev.row : kinds.findIndex((k, i) => k === 'dim' && i !== row);
  let compare = p.compare ?? null;
  if (compare && (compare.col === row || compare.col === col || kinds[compare.col] !== 'dim')) compare = null;
  if (compare) {
    const vs = valuesOf(t, compare.col);
    compare = { col: compare.col, base: vs.includes(compare.base) ? compare.base : vs[0] ?? '', current: vs.includes(compare.current) ? compare.current : vs[vs.length - 1] ?? '' };
  }
  const dims = dimsOf(kinds).filter((i) => i !== row && i !== col && i !== compare?.col);
  const filters = dims.map((k) => p.filters.find((f) => f.col === k) ?? prev?.filters.find((f) => f.col === k) ?? { col: k, value: valuesOf(t, k)[0] ?? null });
  const share = p.share != null && filters.some((f) => f.col === p.share && f.value != null) ? p.share : null;
  const value = kinds[p.value] === 'value' ? p.value : kinds.lastIndexOf('value');
  return { ...p, row, col, value, filters, share, compare };
}

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
