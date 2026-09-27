/**
 * 横軸が年かどうかと CAGR（NarratiX の isTimeAxis_ / getTimeRange_ / calcCAGRFromData_ と同じ規則）。
 * 1900〜2100 の年として読める項目が2つ以上あれば「年」とみなし、最小の年→最大の年で計算する。
 * 年として読むのは「2025」「2025年」「2025年度」「FY2025」「2025E」など年だけの項目。
 * 「2025 Q4」「2024年3月」のような四半期・月は年ではない（前は先頭の年だけ読んで、2025 Q4→2026 Q1 を「前年比」と取り違えていた）。
 */
const yearOf = (label: string): number | null => {
  const m = /^(?:FY\s?)?(\d{4})\s*(?:年度?|[A-Z])?$/i.exec(String(label).trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isNaN(n) || n < 1900 || n > 2100 ? null : n;
};

/**
 * 年より細かい時点（四半期・半期・月）の並び順。例：2025 Q4 → 2025.75、2024年3月 → 2024.167、2025 H2 → 2025.5。
 * 読めなければ null
 */
export function periodOrder(label: string): number | null {
  const s = String(label).trim().replace(/\s+/g, ' ');
  const y = yearOf(s);
  if (y != null) return y;
  let m = /^(?:FY\s?)?(\d{4})\s*(?:年\s*)?[-/ ]?\s*(?:Q([1-4])|([1-4])Q)$/i.exec(s) ?? null;
  if (m) return Number(m[1]) + (Number(m[2] ?? m[3]) - 1) / 4;
  m = /^Q([1-4])\s*(?:FY)?\s*(\d{4})$/i.exec(s);
  if (m) return Number(m[2]) + (Number(m[1]) - 1) / 4;
  m = /^(\d{4})\s*(?:年\s*)?[-/ ]?\s*(?:H([12])|(上|下)期)$/i.exec(s);
  if (m) return Number(m[1]) + (m[2] === '2' || m[3] === '下' ? 0.5 : 0);
  m = /^(\d{4})\s*(?:年\s*|[-/.]\s*)(\d{1,2})\s*月?$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return Number(m[1]) + (Number(m[2]) - 1) / 12;
  return null;
}

/**
 * 伸び率を出す区間：年なら最小の年→最大の年（years＝年数。CAGR や前年比に使う）。
 * 四半期・月などなら最初→最後の時点（years＝null。年平均にはせず、期間の伸び率を出す）
 */
export interface GrowthSpan { fromIndex: number; toIndex: number; years: number | null; fromLabel: string; toLabel: string }
export function growthSpan(labels: readonly string[]): GrowthSpan | null {
  const r = timeRange(labels);
  if (r) return { fromIndex: r.fromIndex, toIndex: r.toIndex, years: r.to - r.from, fromLabel: String(r.from), toLabel: String(r.to) };
  const ts = labels.map(periodOrder);
  const valid = ts.map((t, i) => ({ t, i })).filter((x): x is { t: number; i: number } => x.t != null);
  if (valid.length < 2) return null;
  const min = valid.reduce((a, b) => (b.t < a.t ? b : a)), max = valid.reduce((a, b) => (b.t > a.t ? b : a));
  if (max.t <= min.t) return null;
  return { fromIndex: min.i, toIndex: max.i, years: null, fromLabel: labels[min.i]!, toLabel: labels[max.i]! };
}

/** 区間の伸び率：年なら CAGR（1年なら前年比と同じ）、それ以外は期間の伸び率（終点 ÷ 始点 − 1） */
export function spanRate(span: GrowthSpan, start: number | null | undefined, end: number | null | undefined): number | null {
  if (span.years != null) return cagr(start, end, span.years);
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return null;
  return end / start - 1;
}

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

/** 行（や列）が時間の並びか：年、または四半期・半期・月（CAGR は年のときだけ） */
export const isTimeAxis = (labels: readonly string[]): boolean => growthSpan(labels) != null;
