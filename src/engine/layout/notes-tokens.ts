import type { Locale } from '@/registry';
import { formatMetric, formatSigned, type NumberFormat } from '../format';
import { cagr, growthSpan } from '../transform/cagr';
import type { Matrix } from '../transform/matrix';

/**
 * 補足・検討事項の本文に差し込める数字。「{pct}」「{delta:売上高}」のように書くと、チャートのデータから計算して入る
 * （数字は人が貼らず、コードが計算する）。系列を書かなければ、強調している系列、無ければ表の左の系列。
 * 計算できないものは「—」
 */
export interface NoteToken { id: string; ja: string; en: string }
export const NOTE_TOKENS: readonly NoteToken[] = [
  { id: 'last', ja: '最後の値', en: 'Last value' },
  { id: 'first', ja: '最初の値', en: 'First value' },
  { id: 'delta', ja: '増減額（最初→最後）', en: 'Change (first → last)' },
  { id: 'pct', ja: '増減率（最初→最後）', en: 'Change % (first → last)' },
  { id: 'yoy', ja: '前の行からの増減率', en: 'Change % vs previous row' },
  { id: 'yoyDelta', ja: '前の行からの増減額', en: 'Change vs previous row' },
  { id: 'cagr', ja: 'CAGR（年平均成長率）', en: 'CAGR' },
  { id: 'max', ja: '最大の値', en: 'Maximum' },
  { id: 'maxName', ja: '最大の項目名', en: 'Name of the maximum' },
  { id: 'min', ja: '最小の値', en: 'Minimum' },
  { id: 'minName', ja: '最小の項目名', en: 'Name of the minimum' },
  { id: 'total', ja: '最後の行の合計', en: 'Total of the last row' },
  { id: 'share', ja: '最後の行の構成比', en: 'Share of the last row' },
  { id: 'firstLabel', ja: '最初の行の名前', en: 'First row name' },
  { id: 'lastLabel', ja: '最後の行の名前', en: 'Last row name' },
];

const DASH = '—';
const pct = (r: number | null) => (r == null || !Number.isFinite(r) ? DASH : (r > 0 ? '+' : r < 0 ? '-' : '') + (Math.abs(r) * 100).toFixed(1) + '%');
const ratio = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : a / b - 1);

export interface TokenCtx { matrix: Matrix; numberFormat: NumberFormat; locale: Locale; /** 系列を書かなかった時に使う系列（強調している系列） */ defaultSeries?: string }

/** 1つの数字を求める。系列は名前（無ければ既定）。求められなければ null */
export function noteValue(id: string, series: string | undefined, c: TokenCtx): string | null {
  const m = c.matrix;
  const known = NOTE_TOKENS.some((t) => t.id === id);
  if (!known) return null;
  const name = series?.trim() || c.defaultSeries;
  const k = name ? m.cols.indexOf(name) : 0;
  if (k < 0) return DASH;
  const col = m.rows.map((_, r) => {
    const v = m.current.values[r]?.[k];
    return v == null || !Number.isFinite(v) ? null : v;
  });
  const n = col.length;
  const fmt = (v: number | null | undefined) => (v == null ? DASH : formatMetric(v, c.numberFormat));
  const last = col[n - 1] ?? null;
  const first = col[0] ?? null;
  switch (id) {
    case 'last': return fmt(last);
    case 'first': return fmt(first);
    case 'delta': return n < 2 || first == null || last == null ? DASH : formatSigned(last - first, c.numberFormat);
    case 'pct': return n < 2 ? DASH : pct(ratio(last, first));
    case 'yoy': return n < 2 ? DASH : pct(ratio(last, col[n - 2]));
    case 'yoyDelta': return n < 2 || last == null || col[n - 2] == null ? DASH : formatSigned(last - col[n - 2]!, c.numberFormat);
    case 'cagr': {
      const g = growthSpan(m.rows);
      if (!g || g.years == null || g.years <= 0) return DASH;
      return pct(cagr(col[g.fromIndex] ?? null, col[g.toIndex] ?? null, g.years));
    }
    case 'max': case 'min': case 'maxName': case 'minName': {
      const isMax = id.startsWith('max');
      // 行が1つだけ（項目が列に並ぶ表）の時は、系列どうしで比べる
      const byCols = n === 1;
      const vals = byCols ? (m.current.values[0] ?? []).map((v) => (v == null || !Number.isFinite(v) ? null : v)) : col;
      const names = byCols ? m.cols : m.rows;
      let best = -1;
      vals.forEach((v, i) => { if (v != null && (best < 0 || (isMax ? v > vals[best]! : v < vals[best]!))) best = i; });
      if (best < 0) return DASH;
      return id.endsWith('Name') ? names[best] ?? DASH : fmt(vals[best]);
    }
    case 'total': case 'share': {
      const row = m.current.values[n - 1] ?? [];
      const sum = row.reduce<number>((s, v) => s + (v != null && Number.isFinite(v) ? v : 0), 0);
      if (id === 'total') return fmt(sum);
      return last == null || sum === 0 ? DASH : (last / sum * 100).toFixed(1) + '%';
    }
    case 'firstLabel': return m.rows[0] ?? DASH;
    case 'lastLabel': return m.rows[n - 1] ?? DASH;
  }
  return null;
}

/** 本文の中の {名前} と {名前:系列名} を数字に置き換える。知らない名前はそのまま（波かっこを文字として使えるように） */
export function resolveNoteTokens(text: string, c: TokenCtx): string {
  return text.replace(/\{([A-Za-z]+)(?::([^{}]+))?\}/g, (all, id: string, series?: string) => noteValue(id, series, c) ?? all);
}
