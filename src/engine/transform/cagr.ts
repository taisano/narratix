/**
 * 横軸が年かどうかと CAGR（NarratiX の isTimeAxis_ / getTimeRange_ / calcCAGRFromData_ と同じ規則）。
 * 1900〜2100 の整数として読める項目が2つ以上あれば「年」とみなし、最小の年→最大の年で計算する。
 */
const yearOf = (label: string): number | null => {
  const n = parseInt(String(label).trim(), 10);
  return Number.isNaN(n) || n < 1900 || n > 2100 ? null : n;
};

export function timeRange(labels: readonly string[]): { from: number; to: number; fromIndex: number; toIndex: number } | null {
  const years = labels.map(yearOf);
  const valid = years.map((y, i) => ({ y, i })).filter((x): x is { y: number; i: number } => x.y != null);
  if (valid.length < 2) return null;
  const min = valid.reduce((a, b) => (b.y < a.y ? b : a));
  const max = valid.reduce((a, b) => (b.y > a.y ? b : a));
  if (max.y <= min.y) return null;
  return { from: min.y, to: max.y, fromIndex: min.i, toIndex: max.i };
}

/** CAGR（率、0.123 = 12.3%）。始点が 0 以下・空欄なら null（N/A） */
export function cagr(start: number | null | undefined, end: number | null | undefined, years: number): number | null {
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}
