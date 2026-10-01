import { isStoryTemplateId, localize, PURPOSE_IDS, registry, STORY_TEMPLATES, type ChartTypeId, type Locale, type PurposeId } from '@/registry';
import type { ProjectState } from '@/features/editor/project';
import { tagLabel } from '@/lib/tags';
import { DISH_IDS, dishesOf } from '@/features/start/dishTag';
import { EMPHASIS_LABEL } from '@/features/start/coach';

/**
 * Library・マイチャートの絞り込み（目的・チャート・タグ・料理）。料理は、見本に付けた料理 ID（② の重視点）。
 * 目的はチャートの種類から決める（レシピを外してチャートを替えた資料も正しく入る）。複数スライドは、どれか1枚が当てはまれば入る。
 * 同じ欄の中は「どれか」（OR）、欄どうしは「すべて」（AND）。
 */
export interface FacetItem { charts: ChartTypeId[]; purposes: PurposeId[]; tags: readonly string[]; dishes?: readonly string[] }
export interface FacetSelection { purpose: string[]; chart: string[]; tag: string[]; dish?: string[] }
export interface FacetOption { value: string; label: string; count: number }

export const EMPTY_SELECTION: FacetSelection = { purpose: [], chart: [], tag: [] };

/** 資料で使っているチャート（重なりなし、スライドの順）。表・言葉の型のスライドは数えない（裏に残っているチャートは見えていない） */
export function chartsOf(p: ProjectState | null | undefined): ChartTypeId[] {
  const out: ChartTypeId[] = [];
  for (const s of p?.slides ?? []) if (!s.view && registry.charts[s.chart] && !out.includes(s.chart)) out.push(s.chart);
  return out;
}

export function facetItem(p: ProjectState | null | undefined, tags: readonly string[]): FacetItem {
  const charts = chartsOf(p);
  const purposes = PURPOSE_IDS.filter((id) => charts.some((c) => registry.charts[c].purpose === id));
  return { charts, purposes, tags, dishes: dishesOf(p) };
}

const any = (have: readonly string[], want: readonly string[]) => want.length === 0 || want.some((w) => have.includes(w));
export const matchesFacets = (x: FacetItem, s: FacetSelection, skip?: keyof FacetSelection): boolean =>
  (skip === 'purpose' || any(x.purposes, s.purpose)) && (skip === 'chart' || any(x.charts, s.chart)) && (skip === 'tag' || any(x.tags, s.tag)) && (skip === 'dish' || any(x.dishes ?? [], s.dish ?? []));

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
    for (const v of s[key] ?? []) if (!m.has(v)) m.set(v, 0);
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
  // 料理：料理の表の順（目的ごと）
  const dc = count('dish', (x) => x.dishes ?? []);
  const dish = DISH_IDS.filter((d) => dc.has(d)).map((d) => ({ value: d, label: localize(EMPHASIS_LABEL[d], locale), count: dc.get(d)! }));
  return { purpose, chart, tag, dish };
}

/** 検索に使う文字（チャート名・目的名を日本語と英語で） */
export function facetSearchText(x: FacetItem): string {
  return [...x.charts.flatMap((c) => Object.values(registry.charts[c].label)), ...x.purposes.flatMap((p) => Object.values(registry.purposes[p].label)), ...(x.dishes ?? []).flatMap((d) => Object.values(EMPHASIS_LABEL[d as keyof typeof EMPHASIS_LABEL] ?? {}))].join(' ');
}

/** 1枚の一言：「推移・折れ線」。表・言葉の型は「表・比較表」「言葉・2カラム」 */
export function slideSummary(p: ProjectState | null | undefined, index: number, locale: Locale): string {
  const s = p?.slides[index];
  if (!s) return '';
  const dot = locale === 'ja' ? '・' : ' · ';
  if (s.view && isStoryTemplateId(s.view)) {
    const def = STORY_TEMPLATES[s.view];
    const kind = def.kind === 'table' ? (locale === 'ja' ? '表' : 'Table') : (locale === 'ja' ? '言葉' : 'Text');
    return `${kind}${dot}${localize(def.label, locale)}`;
  }
  if (!registry.charts[s.chart]) return '';
  return `${purposeName(registry.charts[s.chart].purpose, locale)}${dot}${chartName(s.chart, locale)}`;
}

/** カードの一言：「推移・折れ線」「構成・Mekko ほか2枚」。index は表示中のスライド（縮小表示を送った時に合わせる） */
export function facetSummary(p: ProjectState | null | undefined, locale: Locale, more: (n: number) => string, index = 0): string {
  const head = slideSummary(p, index, locale);
  if (!head) return '';
  const rest = (p?.slides.length ?? 1) - 1;
  return rest > 0 ? `${head} ${more(rest)}` : head;
}
