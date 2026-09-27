import { localize, PURPOSE_IDS, registry, type ChartTypeId, type Locale, type PurposeId } from '@/registry';
import type { ProjectState } from '@/features/editor/project';
import { tagLabel } from '@/lib/tags';

/**
 * Library・マイチャートの絞り込み（目的・チャート・タグ）。
 * 目的はチャートの種類から決める（レシピを外してチャートを替えた資料も正しく入る）。複数スライドは、どれか1枚が当てはまれば入る。
 * 同じ欄の中は「どれか」（OR）、欄どうしは「すべて」（AND）。
 */
export interface FacetItem { charts: ChartTypeId[]; purposes: PurposeId[]; tags: readonly string[] }
export interface FacetSelection { purpose: string[]; chart: string[]; tag: string[] }
export interface FacetOption { value: string; label: string; count: number }

export const EMPTY_SELECTION: FacetSelection = { purpose: [], chart: [], tag: [] };

/** 資料で使っているチャート（重なりなし、スライドの順） */
export function chartsOf(p: ProjectState | null | undefined): ChartTypeId[] {
  const out: ChartTypeId[] = [];
  for (const s of p?.slides ?? []) if (registry.charts[s.chart] && !out.includes(s.chart)) out.push(s.chart);
  return out;
}

export function facetItem(p: ProjectState | null | undefined, tags: readonly string[]): FacetItem {
  const charts = chartsOf(p);
  const purposes = PURPOSE_IDS.filter((id) => charts.some((c) => registry.charts[c].purpose === id));
  return { charts, purposes, tags };
}

const any = (have: readonly string[], want: readonly string[]) => want.length === 0 || want.some((w) => have.includes(w));
export const matchesFacets = (x: FacetItem, s: FacetSelection, skip?: keyof FacetSelection): boolean =>
  (skip === 'purpose' || any(x.purposes, s.purpose)) && (skip === 'chart' || any(x.charts, s.chart)) && (skip === 'tag' || any(x.tags, s.tag));

/** 「Trend（推移）」→「推移」。英語はそのまま */
export const purposeName = (id: PurposeId, locale: Locale): string => {
  const l = localize(registry.purposes[id].label, locale);
  return /（(.+)）/.exec(l)?.[1] ?? l;
};
export const chartName = (id: ChartTypeId, locale: Locale): string => localize(registry.charts[id].label, locale);

/**
 * 欄ごとの選択肢と件数。件数は「ほかの欄の条件を満たすもの」の中で数える。0件は出さない（選んでいるものは残す）。
 * チャートの欄は、目的を選んでいれば、その目的のチャートだけ
 */
export function facetOptions(items: readonly FacetItem[], s: FacetSelection, locale: Locale): Record<keyof FacetSelection, FacetOption[]> {
  const count = (key: keyof FacetSelection, pick: (x: FacetItem) => readonly string[]) => {
    const m = new Map<string, number>();
    for (const x of items) if (matchesFacets(x, s, key)) for (const v of pick(x)) m.set(v, (m.get(v) ?? 0) + 1);
    for (const v of s[key]) if (!m.has(v)) m.set(v, 0);
    return m;
  };
  const pc = count('purpose', (x) => x.purposes);
  const purpose = PURPOSE_IDS.filter((id) => pc.has(id)).map((id) => ({ value: id, label: purposeName(id, locale), count: pc.get(id)! }));
  const cc = count('chart', (x) => x.charts);
  const chart = [...cc.entries()]
    .filter(([c]) => s.purpose.length === 0 || s.chart.includes(c) || s.purpose.includes(registry.charts[c as ChartTypeId].purpose))
    .map(([c, n]) => ({ value: c, label: chartName(c as ChartTypeId, locale), count: n }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale));
  const tc = count('tag', (x) => x.tags);
  const tag = [...tc.entries()].map(([v, n]) => ({ value: v, label: tagLabel(v, locale), count: n }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale));
  return { purpose, chart, tag };
}

/** 検索に使う文字（チャート名・目的名を日本語と英語で） */
export function facetSearchText(x: FacetItem): string {
  return [...x.charts.flatMap((c) => Object.values(registry.charts[c].label)), ...x.purposes.flatMap((p) => Object.values(registry.purposes[p].label))].join(' ');
}

/** カードの一言：「推移・折れ線」「構成・Mekko ほか2枚」 */
export function facetSummary(p: ProjectState | null | undefined, locale: Locale, more: (n: number) => string): string {
  const first = p?.slides[0]?.chart;
  if (!first || !registry.charts[first]) return '';
  const head = `${purposeName(registry.charts[first].purpose, locale)}${locale === 'ja' ? '・' : ' · '}${chartName(first, locale)}`;
  const rest = (p?.slides.length ?? 1) - 1;
  return rest > 0 ? `${head} ${more(rest)}` : head;
}
