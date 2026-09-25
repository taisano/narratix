import type { Transform } from '@/registry';
import { timeRange } from './cagr';
import { growthRate, periodYears, rowSum, TransformError, type Cell, type Matrix, type Period } from './matrix';

const colSums = (vals: Cell[][], ncol: number): Cell[] =>
  Array.from({ length: ncol }, (_, k) => vals.reduce<number>((s, r) => s + (r[k] || 0), 0));

const mapPeriods = (m: Matrix, f: (p: Period) => Period): Pick<Matrix, 'current' | 'base'> => ({
  current: f(m.current),
  base: m.base ? f(m.base) : undefined,
});

/** 行と列を入れ替える（比較期間も同じく入れ替える）。データは変えず、見え方だけを変える */
export function transpose(m: Matrix): Matrix {
  const flip = (p: Period): Period => ({
    label: p.label,
    values: m.cols.map((_, k) => m.rows.map((_, i) => p.values[i]?.[k] ?? null)),
  });
  return { rows: [...m.cols], cols: [...m.rows], ...mapPeriods(m, flip) };
}

/** 行を合計して1行にする（例：全地域合計） */
export function aggregateRows(m: Matrix, label: string): Matrix {
  return { ...m, rows: [label], ...mapPeriods(m, (p) => ({ label: p.label, values: [colSums(p.values, m.cols.length)] })) };
}

/** 使う期間を選ぶ。両方を選ぶと、1行の表を「期間が行」の表に組み替える */
export function selectPeriods(m: Matrix, periods: ('base' | 'current')[]): Matrix {
  const want = [...new Set(periods)];
  if (want.includes('base') && !m.base) throw new TransformError('requires_base', 'select_periods: no comparison period');
  if (want.length === 1) {
    const p = want[0] === 'base' ? m.base! : m.current;
    return { rows: m.rows, cols: m.cols, current: p };
  }
  if (m.rows.length !== 1) throw new TransformError('needs_single_row', 'select_periods with both periods needs one row (use aggregate_rows first)');
  const ordered = [m.base!, m.current];
  return {
    rows: ordered.map((p) => p.label),
    cols: m.cols,
    current: { label: m.current.label, values: ordered.map((p) => [...p.values[0]!]) },
  };
}

/** 行内の構成比。合計が0以下の行は、現在は0、比較期間は null */
export function share(m: Matrix): Matrix {
  const cur = m.current.values.map((r) => { const t = rowSum(r); return m.cols.map((_, k) => (t > 0 ? (r[k] || 0) / t : 0)); });
  const base = m.base?.values.map((r) => { const t = rowSum(r); return m.cols.map((_, k) => (t > 0 ? (r[k] || 0) / t : null)); });
  return {
    ...m,
    current: { label: m.current.label, values: cur },
    base: m.base && base ? { label: m.base.label, values: base } : undefined,
  };
}

/** 構成比の変化（比率の差。表示時に ×100 して pt にする） */
export function deltaShare(m: Matrix): Matrix {
  if (!m.base) throw new TransformError('requires_base', 'delta_share: no comparison period');
  const s = share(m);
  const values = s.current.values.map((r, i) => r.map((v, k) => { const b = s.base!.values[i]?.[k]; return b == null || v == null ? null : v - b; }));
  return { rows: m.rows, cols: m.cols, current: { label: m.current.label, values } };
}

/**
 * 成長率。結果は「行＝指標（market / series:<列名>）× 列＝元の行」の表。
 * rows 未指定なら市場全体のみ。
 */
export function growth(m: Matrix, mode: 'cagr' | 'period', rows: string[] = ['market']): Matrix {
  const years = m.base ? periodYears(m.base.label, m.current.label) : null;
  const useCagr = mode === 'cagr' && years != null && years > 0;
  const cur = m.current.values, base = m.base?.values;
  const values = rows.map((key) => {
    if (key === 'market') return m.rows.map((_, i) => growthRate(rowSum(cur[i]), base ? rowSum(base[i]) : null, useCagr, years));
    const col = key.startsWith('series:') ? m.cols.indexOf(key.slice(7)) : -1;
    if (col < 0) throw new TransformError('unknown_series', `growth: unknown row "${key}"`);
    return m.rows.map((_, i) => growthRate(cur[i]?.[col], base?.[i]?.[col], useCagr, years));
  });
  return { rows, cols: m.rows, current: { label: m.current.label, values }, growth: { useCagr, years } };
}

export function filter(m: Matrix, opts: { rows?: string[]; cols?: string[]; top?: number }): Matrix {
  let ri = m.rows.map((_, i) => i);
  if (opts.rows) ri = ri.filter((i) => opts.rows!.includes(m.rows[i]!));
  if (opts.top != null) ri = [...ri].sort((a, b) => rowSum(m.current.values[b]) - rowSum(m.current.values[a])).slice(0, opts.top).sort((a, b) => a - b);
  const ci = m.cols.map((_, k) => k).filter((k) => !opts.cols || opts.cols.includes(m.cols[k]!));
  const pick = (p: Period): Period => ({ label: p.label, values: ri.map((i) => ci.map((k) => p.values[i]?.[k] ?? null)) });
  return { ...m, rows: ri.map((i) => m.rows[i]!), cols: ci.map((k) => m.cols[k]!), ...mapPeriods(m, pick) };
}

export function sort(m: Matrix, by: 'total' | 'input' | 'name', order: 'asc' | 'desc'): Matrix {
  if (by === 'input') return m;
  const idx = m.rows.map((_, i) => i);
  const dir = order === 'asc' ? 1 : -1;
  if (by === 'total') idx.sort((a, b) => dir * (rowSum(m.current.values[a]) - rowSum(m.current.values[b])));
  else idx.sort((a, b) => dir * m.rows[a]!.localeCompare(m.rows[b]!));
  const pick = (p: Period): Period => ({ label: p.label, values: idx.map((i) => p.values[i]!) });
  return { ...m, rows: idx.map((i) => m.rows[i]!), ...mapPeriods(m, pick) };
}

/** 最初と最後の時点だけを残す。行が年なら最小の年と最大の年、そうでなければ先頭と末尾の行 */
export function endpoints(m: Matrix): Matrix {
  if (m.rows.length <= 2) return m;
  const r = timeRange(m.rows);
  const idx = r ? [r.fromIndex, r.toIndex] : [0, m.rows.length - 1];
  return { ...m, rows: idx.map((i) => m.rows[i]!), ...mapPeriods(m, (p) => ({ label: p.label, values: idx.map((i) => p.values[i]!) })) };
}

/** 最新の時点だけを残す。行が年なら最大の年、そうでなければ末尾の行 */
export function latest(m: Matrix): Matrix {
  if (m.rows.length <= 1) return m;
  const r = timeRange(m.rows);
  const i = r ? r.toIndex : m.rows.length - 1;
  return { ...m, rows: [m.rows[i]!], ...mapPeriods(m, (p) => ({ label: p.label, values: [p.values[i]!] })) };
}

/** ViewSpec の transform を順に適用する */
export function applyTransforms(m: Matrix, transforms: readonly Transform[] | undefined, labels: { total: string }): Matrix {
  let out = m;
  for (const t of transforms ?? []) {
    switch (t.type) {
      case 'transpose': out = transpose(out); break;
      case 'aggregate_rows': out = aggregateRows(out, t.label ?? labels.total); break;
      case 'select_periods': out = selectPeriods(out, t.periods); break;
      case 'share': out = share(out); break;
      case 'delta_share': out = deltaShare(out); break;
      case 'growth': out = growth(out, t.mode, t.rows); break;
      case 'filter': out = filter(out, t); break;
      case 'sort': out = sort(out, t.by, t.order); break;
      case 'endpoints': out = endpoints(out); break;
      case 'latest': out = latest(out); break;
    }
  }
  return out;
}
