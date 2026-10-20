import type { ParsedTable } from '@/features/editor/dataCheck';
import type { Dataset } from '@/registry';
import { kindOf, primaryMetricOf, relationBinding, type Assignment, type ColumnRoleMap } from './columnRoles';
import type { DraftShape } from './shape';

/**
 * 列対応と貼り付けた表から、Dataset（プレビュー・編集画面が使う入れ物）を作る（コードだけ。AI は使わない）。
 * 数値は元のセルから読んだ値をそのまま写す（計算しない）。読み取れない形は、黙って一部だけ読まず、理由を返す。
 *   item_metric：行＝［主指標の見出し］、列＝項目（順位・大小を並べる）
 *   time_metric：行＝期間、列＝系列（横持ち・縦持ち・横に並んだ期間のどれも同じ形にそろえる）
 *   item_compare：行＝［比較先の見出し, 現在の見出し］（基準が先、現在が後）、列＝項目。差は描画側が（現在−基準）で出す
 *   relation：行＝項目、列＝［X, Y, 大きさ（あれば）］。列の割り当てはこの候補だけのもの（relationBinding）
 *   exact_table：行＝項目、列＝数値の列すべて（貼った順。単位は見出しに添える）。基本表の元データ
 */
export type ReshapeFail = 'unsupported_shape' | 'no_primary_metric' | 'duplicate_keys' | 'too_few_rows' | 'no_item_column' | 'no_time_column' | 'no_compare_pair' | 'no_relation_pair';
export interface ReshapeNote { code: 'blank_values' | 'metrics_dropped_unit_mismatch' | 'other_compares_unused'; n?: number }
export type ReshapeResult =
  | { ok: true; dataset: Dataset & { periods: { base: { label: string; values: (number | null)[][] } } }; notes: ReshapeNote[] }
  | { ok: false; reason: ReshapeFail };

const empty = (rows: number, cols: number) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => null as number | null));

export function cellText(t: ParsedTable, r: number, col: number): string {
  const off = t.hasRowNames ? 1 : 0;
  if (t.hasRowNames && col === 0) return t.rows[r] ?? '';
  return (t.raw[r]?.[col - off] ?? '').trim();
}
function cellValue(t: ParsedTable, r: number, col: number): number | null {
  const off = t.hasRowNames ? 1 : 0;
  if (t.hasRowNames && col === 0) return null;
  return t.values[r]?.[col - off] ?? null;
}
const headerOf = (t: ParsedTable, col: number): string => {
  const off = t.hasRowNames ? 1 : 0;
  if (t.hasRowNames && col === 0) return t.corner ?? '';
  return t.hasColNames ? t.cols[col - off] ?? '' : '';
};

const finish = (d: Omit<Dataset, 'periods'> & { periods: { current: { label: string; values: (number | null)[][] } } }, notes: ReshapeNote[]): ReshapeResult => {
  const values = d.periods.current.values;
  const blanks = values.reduce((s, r) => s + r.filter((v) => v == null).length, 0);
  if (blanks) notes.push({ code: 'blank_values', n: blanks });
  return { ok: true, dataset: { ...d, periods: { current: d.periods.current, base: { label: '', values: empty(d.rows.length, d.cols.length) } } } as never, notes };
};

export function reshape(t: ParsedTable, map: ColumnRoleMap, shape: DraftShape): ReshapeResult {
  const notes: ReshapeNote[] = [];
  const a = map.assignments;
  const byRole = (...r: string[]) => a.filter((x) => r.includes(x.role));
  const primary = primaryMetricOf(map);
  const unitOf = (x?: Assignment) => x?.unit ?? '';

  if (shape === 'item_metric') {
    const item = byRole('item')[0];
    if (!item) return { ok: false, reason: 'no_item_column' };
    if (primary == null) return { ok: false, reason: 'no_primary_metric' };
    const pa = a.find((x) => x.col === primary)!;
    const rows = t.rows.map((_, r) => r);
    const cols = rows.map((r) => cellText(t, r, item.col) || `#${r + 1}`);
    if (new Set(cols).size !== cols.length) return { ok: false, reason: 'duplicate_keys' };
    const name = headerOf(t, primary) || `#${primary}`;
    return finish({
      schema: 'MATRIX_TIME_SERIES', unit: unitOf(pa), rows: [name], cols,
      dimensions: { rows: '', cols: headerOf(t, item.col) },
      periods: { current: { label: name, values: [rows.map((r) => cellValue(t, r, primary))] } },
    } as never, notes);
  }

  if (shape === 'time_metric') {
    const time = map.time;
    if (!time) return { ok: false, reason: 'no_time_column' };
    // 横に並んだ期間：行＝項目、列＝期間 → 期間を行、項目を列にする
    if (time.orientation === 'columns') {
      const item = byRole('item')[0];
      if (!item) return { ok: false, reason: 'no_item_column' };
      const rows = time.at.map((c) => headerOf(t, c));
      const cols = t.rows.map((_, r) => cellText(t, r, item.col) || `#${r + 1}`);
      if (new Set(cols).size !== cols.length) return { ok: false, reason: 'duplicate_keys' };
      if (rows.length < 2) return { ok: false, reason: 'too_few_rows' };
      return finish({
        schema: 'MATRIX_TIME_SERIES', rows, cols, dimensions: { rows: '', cols: headerOf(t, item.col) },
        periods: { current: { label: '', values: time.at.map((c) => t.rows.map((_, r) => cellValue(t, r, c))) } },
      } as never, notes);
    }
    const tc = time.at[0]!;
    const series = byRole('series')[0];
    const wide = byRole('seriesValue');
    if (series) {
      // 縦持ち：期間 × 系列 → 主指標の値
      if (primary == null) return { ok: false, reason: 'no_primary_metric' };
      const pa = a.find((x) => x.col === primary)!;
      const periods: string[] = [], names: string[] = [];
      const cell = new Map<string, number | null>();
      for (let r = 0; r < t.rows.length; r++) {
        const p = cellText(t, r, tc), s = cellText(t, r, series.col);
        if (!periods.includes(p)) periods.push(p);
        if (!names.includes(s)) names.push(s);
        const k = `${p}\u0000${s}`;
        if (cell.has(k)) return { ok: false, reason: 'duplicate_keys' };
        cell.set(k, cellValue(t, r, primary));
      }
      if (periods.length < 2) return { ok: false, reason: 'too_few_rows' };
      return finish({
        schema: 'MATRIX_TIME_SERIES', unit: unitOf(pa), rows: periods, cols: names,
        dimensions: { rows: headerOf(t, tc), cols: headerOf(t, series.col) },
        periods: { current: { label: headerOf(t, primary), values: periods.map((p) => names.map((s) => cell.get(`${p}\u0000${s}`) ?? null)) } },
      } as never, notes);
    }
    // 横持ち（系列値）または、系列の無い指標：行＝期間、列＝系列／指標
    let cols: Assignment[];
    if (wide.length) cols = wide;
    else {
      if (primary == null) return { ok: false, reason: 'no_primary_metric' };
      const pa = a.find((x) => x.col === primary)!;
      // 同じ型（水準）・同じ単位の指標だけ並べる。違うものは捨てて知らせる
      const same = byRole('metric').filter((x) => kindOf(x) === kindOf(pa) && x.unit === pa.unit);
      if (same.length < byRole('metric').length) notes.push({ code: 'metrics_dropped_unit_mismatch', n: byRole('metric').length - same.length });
      cols = same;
    }
    const rows = t.rows.map((_, r) => cellText(t, r, tc) || `#${r + 1}`);
    if (rows.length < 2) return { ok: false, reason: 'too_few_rows' };
    if (new Set(rows).size !== rows.length) return { ok: false, reason: 'duplicate_keys' };
    return finish({
      schema: 'MATRIX_TIME_SERIES', unit: unitOf(cols[0]), rows, cols: cols.map((c) => headerOf(t, c.col) || `#${c.col}`),
      dimensions: { rows: headerOf(t, tc), cols: '' },
      periods: { current: { label: '', values: rows.map((_, r) => cols.map((c) => cellValue(t, r, c.col))) } },
    } as never, notes);
  }
  if (shape === 'item_compare') {
    const item = byRole('item')[0];
    if (!item) return { ok: false, reason: 'no_item_column' };
    // 比べる側の水準の列で、相手（compareOf）が実在する指標のもの。相手が無い差分の列はここに来ない（compare にならない）
    const pairs = byRole('compare').filter((c) => c.compareOf != null && a.some((m) => m.col === c.compareOf && (m.role === 'metric' || m.role === 'seriesValue')));
    if (!pairs.length) return { ok: false, reason: 'no_compare_pair' };
    const c = pairs.find((x) => x.compareOf === primary) ?? pairs[0]!;
    const cur = a.find((x) => x.col === c.compareOf)!;
    if (pairs.length > 1) notes.push({ code: 'other_compares_unused', n: pairs.length - 1 });
    const r = t.rows.map((_, i) => i);
    const cols = r.map((i) => cellText(t, i, item.col) || `#${i + 1}`);
    if (new Set(cols).size !== cols.length) return { ok: false, reason: 'duplicate_keys' };
    return finish({
      schema: 'MATRIX_TIME_SERIES', unit: unitOf(cur), rows: [headerOf(t, c.col) || `#${c.col}`, headerOf(t, cur.col) || `#${cur.col}`], cols,
      dimensions: { rows: '', cols: headerOf(t, item.col) },
      periods: { current: { label: '', values: [r.map((i) => cellValue(t, i, c.col)), r.map((i) => cellValue(t, i, cur.col))] } },
    } as never, notes);
  }

  if (shape === 'relation') {
    const item = byRole('item')[0];
    if (!item) return { ok: false, reason: 'no_item_column' };
    const b = relationBinding(map);
    if (!b || b.x == null || b.y == null) return { ok: false, reason: 'no_relation_pair' };
    const picked = [b.x, b.y, ...(b.size != null ? [b.size] : [])];
    const r = t.rows.map((_, i) => i);
    const rows = r.map((i) => cellText(t, i, item.col) || `#${i + 1}`);
    if (new Set(rows).size !== rows.length) return { ok: false, reason: 'duplicate_keys' };
    const label = (col: number) => {
      const h = headerOf(t, col) || `#${col}`;
      const u = a.find((x) => x.col === col)?.unit;
      return u && !h.includes(u) ? `${h}（${u}）` : h;
    };
    const group = byRole('group')[0];
    return finish({
      schema: 'BUBBLE', unit: '', rows, cols: picked.map(label),
      dimensions: { rows: headerOf(t, item.col), cols: '', ...(group ? { group: headerOf(t, group.col) } : {}) },
      ...(group ? { groups: r.map((i) => cellText(t, i, group.col) || null) } : {}),
      periods: { current: { label: '', values: r.map((i) => picked.map((c) => cellValue(t, i, c))) } },
    } as never, notes);
  }
  if (shape === 'exact_table') {
    const item = byRole('item')[0];
    if (!item || map.time) return { ok: false, reason: 'no_item_column' };
    const nums = a.filter((x) => x.role === 'metric' || x.role === 'compare' || x.role === 'seriesValue').sort((x, y) => x.col - y.col);
    if (!nums.length) return { ok: false, reason: 'no_primary_metric' };
    const r = t.rows.map((_, i) => i);
    const rows = r.map((i) => cellText(t, i, item.col) || `#${i + 1}`);
    if (new Set(rows).size !== rows.length) return { ok: false, reason: 'duplicate_keys' };
    const label = (x: Assignment) => {
      const h = headerOf(t, x.col) || `#${x.col}`;
      return x.unit && !h.includes(x.unit) ? `${h}（${x.unit}）` : h;
    };
    // 貼った桁数（セルの文字から。1250.5 → 1、21.0 → 1、12.55% → 2）。基本表が貼った桁のまま出すために持つ
    const decimalsOf = (s: string) => /\.(\d+)/.exec(s.replace(/,/g, ''))?.[1]?.length ?? 0;
    const cellDecimals: Record<string, number> = {};
    const lbls = nums.map(label);
    r.forEach((i, ri) => nums.forEach((x, xi) => { const d = decimalsOf(cellText(t, i, x.col)); if (d > 0) cellDecimals[`${rows[ri]}\t${lbls[xi]}`] = Math.min(8, d); }));
    return finish({
      schema: 'MATRIX_TIME_SERIES', unit: '', rows, cols: lbls,
      ...(Object.keys(cellDecimals).length ? { cellDecimals } : {}),
      dimensions: { rows: headerOf(t, item.col), cols: '' },
      periods: { current: { label: '', values: r.map((i) => nums.map((x) => cellValue(t, i, x.col))) } },
    } as never, notes);
  }
  return { ok: false, reason: 'unsupported_shape' };
}
