import type { Locale } from '@/registry';

const NUMBER_LOCALE: Record<Locale, string> = { ja: 'ja-JP', en: 'en-US' };

/** 実数を整数に丸めて桁区切りで表示（null は空文字） */
export function formatNumber(n: number | null | undefined, locale: Locale): string {
  return n == null ? '' : Math.round(n).toLocaleString(NUMBER_LOCALE[locale]);
}

/** 率を小数1桁の%で表示（null は —） */
export function formatPct1(v: number | null | undefined): string {
  return v == null ? '—' : (v * 100).toFixed(1) + '%';
}

/** 構成比の変化を符号付きの pt で表示（−はマイナス記号） */
export function formatPt(delta: number): string {
  const d = Math.round(delta * 100);
  return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + 'pt';
}

export type NumberFormat = 'raw' | 'auto' | 'K' | 'M' | '%';

const trim1 = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Math.abs(r - Math.round(r)) < 1e-6 ? String(Math.round(r)) : r.toFixed(1);
};
const withCommas = (s: string) => {
  const [int, dec] = s.split('.');
  const sign = int!.startsWith('-') ? '-' : '';
  const body = int!.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + body + (dec ? '.' + dec : '');
};

/**
 * 値の表記（NarratiX の formatDriverMetricValue_ と同じ規則）。
 * raw＝桁区切り・小数1桁まで、auto＝1,000 以上で K、1,000,000 以上で M、
 * K / M＝常に換算、%＝値に % を付ける（値は % 単位で入力されている前提。×100 はしない）。
 */
export function formatMetric(v: number | null | undefined, mode: NumberFormat = 'raw'): string {
  if (v == null || !Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (mode === '%') return trim1(v) + '%';
  if (mode === 'K' || (mode === 'auto' && abs >= 1000 && abs < 1_000_000)) return trim1(v / 1000) + 'K';
  if (mode === 'M' || (mode === 'auto' && abs >= 1_000_000)) return trim1(v / 1_000_000) + 'M';
  return withCommas(trim1(v));
}

/** 符号付き（+12、-3.5、0）。NarratiX の formatDriverSignedValue_ と同じ */
export function formatSigned(v: number, mode: NumberFormat = 'raw'): string {
  if (Math.abs(v) < 1e-6) return '0';
  return (v > 0 ? '+' : '-') + formatMetric(Math.abs(v), mode);
}

/** 率（0.123 → 12.3%）。N/A は null */
export function formatRate(v: number | null): string {
  return v == null ? 'N/A' : (v * 100).toFixed(1) + '%';
}
