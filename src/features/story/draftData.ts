import type { Locale, RecipeId } from '@/registry';
import { isRateName } from '@/engine/layout/charts/combo-config';
import { loadDraft, pastedSource, setFor, type DraftSource } from '../data/draft/session';
import type { BuilderState } from '../editor/state';
import type { ColumnRoleMap } from '../data/draft/columnRoles';
import type { StoryDataset } from './model';

type QRef = { id: string; referenceRecipes: RecipeId[]; presentationMode?: string; question?: string; suggestedDataNeeds?: { label: string; reason?: string }[]; userAuthoredMessage?: string };
/** 問いの文が、予算・計画・前年など「比べる先」に触れているか */
const MENTIONS_COMPARE = /予算|計画|目標|見込|前年|前期|前月|昨年|比較先|下回|上回|達成|vs\.?|budget|plan|target|forecast|prior|last year/i;
const SHAPE_LABEL: Record<string, { ja: string; en: string }> = {
  item_compare: { ja: '実績と比較先', en: 'Actual vs comparison' },
  item_metric: { ja: '項目ごとの指標', en: 'Metric by item' },
  exact_table: { ja: '指標の一覧', en: 'All metrics' },
  time_metric: { ja: '期間ごとの推移', en: 'Over time' },
};
const TIME_SHAPES = ['time_metric', 'time_kpi', 'time_combo'];

/**
 * 貼った表から作った実データと、問いごとのデータの割り当て。
 * - 表（table）：時系列の表は、指標（列）をいちばん多く持つ形（単位の違う指標も全部。見せる列は問いごとに絞る）。項目の表は「項目ごとの指標」の形。
 * - 関係（relation）：散布図・バブル用があれば。
 * - 問い専用のデータ（dr_形）：問いの見せ方（レシピ）が、表の形では描けず、別の形（実績と比較先など）なら描ける時だけ。その問いだけが使う
 * 列対応が決まっていない・組み替えられない時は空
 */
export function draftStoryData(draft: DraftSource | undefined, locale: Locale, questions: QRef[] = []): { datasets: StoryDataset[]; refs: Record<string, string>; recipes: Record<string, RecipeId> } {
  const none = { datasets: [] as StoryDataset[], refs: {} as Record<string, string>, recipes: {} as Record<string, RecipeId> };
  if (!draft?.map) return none;
  const loaded = loadDraft({ ...draft, pick: undefined });
  if (!loaded.ok) return none;
  const source = pastedSource(draft.tsv, locale);
  const matrix = loaded.sets.filter((s) => s.dataset.schema === 'MATRIX_TIME_SERIES');
  const time = matrix.filter((s) => TIME_SHAPES.includes(s.shape));
  const tableSet = time.length
    ? time.reduce((best, s) => (s.dataset.cols.length > best.dataset.cols.length ? s : best))
    : matrix.find((s) => s.shape === 'item_metric') ?? matrix[0];
  const relation = loaded.sets.find((s) => s.dataset.schema === 'BUBBLE');
  const datasets: StoryDataset[] = [];
  const refs: Record<string, string> = {};
  const recipes: Record<string, RecipeId> = {};
  if (tableSet) datasets.push({ id: 'table', label: '', data: tableSet.dataset as BuilderState['dataset'], source });
  if (relation) datasets.push({ id: 'relation', label: '', data: relation.dataset as BuilderState['dataset'], source });
  if (tableSet) {
    const compare = matrix.find((m) => m.shape === 'item_compare');
    for (const q of questions) {
      const r = q.referenceRecipes[0];
      if (!r || q.presentationMode === 'TEXT' || q.presentationMode === 'TABLE') continue;
      let set = setFor(matrix, r);
      // 時間の列が無い表：推移の問いは描けない。表の形で描ける見せ方に置き換える
      if (!time.length && r.startsWith('TREND_')) {
        const alt = tableSet.candidates.candidates[0]?.recipe;
        if (alt) { recipes[q.id] = alt; set = tableSet; }
      }
      // 問いの文に予算・比較先が出てくる：実績と比較先の形で描く
      if (compare && compare !== tableSet && MENTIONS_COMPARE.test([q.question, q.userAuthoredMessage, ...(q.suggestedDataNeeds ?? []).flatMap((n) => [n.label, n.reason])].filter(Boolean).join(' ')) && set !== compare) {
        const alt = compare.candidates.candidates[0]?.recipe;
        if (alt) { recipes[q.id] = alt; set = compare; }
      }
      if (!set || set === tableSet || (TIME_SHAPES.includes(set.shape) && TIME_SHAPES.includes(tableSet.shape))) continue;
      const id = `dr_${set.shape}`;
      if (!datasets.some((d) => d.id === id)) {
        const l = SHAPE_LABEL[set.shape];
        datasets.push({ id, label: l ? `${locale === 'en' ? 'Pasted table: ' : '貼った表：'}${l[locale === 'en' ? 'en' : 'ja']}` : '', data: set.dataset as BuilderState['dataset'], source, family: 'table' });
      }
      refs[q.id] = id;
    }
  }
  return { datasets, refs, recipes };
}

export const storyDatasetsFromDraft = (draft: DraftSource | undefined, locale: Locale, questions: QRef[] = []): StoryDataset[] => draftStoryData(draft, locale, questions).datasets;

/** Story を始める時に、下書きのデータを入れた Story にする（すでに同じ id のデータがあれば貼った表を優先） */
export function withDraftData<T extends { datasets: StoryDataset[]; slides?: (QRef & { datasetRefs: string[] })[]; draft?: { tsv: string; map: ColumnRoleMap; question: string } }>(story: T, draft: DraftSource | undefined, locale: Locale): T {
  const { datasets: add, refs, recipes } = draftStoryData(draft, locale, story.slides ?? []);
  if (!add.length) return story;
  const ids = new Set(add.map((d) => d.id));
  return {
    ...story,
    datasets: [...add, ...story.datasets.filter((d) => !ids.has(d.id))],
    ...(story.slides ? { slides: story.slides.map((q) => {
      const rr = recipes[q.id];
      const q2 = rr ? { ...q, referenceRecipes: [rr, ...q.referenceRecipes.filter((x) => x !== rr)] } : q;
      return refs[q.id] ? { ...q2, datasetRefs: [refs[q.id]!] } : q2;
    }) } : {}),
    ...(draft?.map ? { draft: { tsv: draft.tsv, map: structuredClone(draft.map), question: draft.question } } : {}),
  };
}

/**
 * 単位の違う指標が並ぶデータで、グラフに最初に見せる列：先頭の指標と同じ単位の列だけ（単位の違う指標を1つの軸に混ぜない）。
 * データは全指標を持ったまま。ほかの指標は、編集画面の「表示する列」で足せる。単位が1種類なら絞らない（null）
 */
export function firstShownSeries(d: { cols: string[]; colUnits?: string[] }): string[] | null {
  const u = d.colUnits;
  if (!u || u.length !== d.cols.length || new Set(u).size < 2) return null;
  const keep = d.cols.filter((_, k) => u[k] === u[0]);
  return keep.length && keep.length < d.cols.length ? keep : null;
}

/** 見出しから単位の括弧を外した指標名（売上(万円) → 売上） */
const bareName = (h: string): string => h.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();

/**
 * 問いの文に名前が出てくる指標の列（見出しの順）。2文字以上の指標名が文に含まれる時だけ。無ければ null（自動では選ばない）
 * 例：「新規顧客数と解約率はどう動いたか」→ [新規顧客数(人), 解約率]
 */
export function questionColumns(cols: string[], text: string): string[] | null {
  const t = text.replace(/\s/g, '');
  // 指標名のうち、末尾の「数・率・額・高・件数」の違い（解約数／解約率、売上／売上高）は同じ語として扱う
  const stem = (x: string) => x.replace(/(件数|数|率|比率|額|高|金額)$/, '');
  const hit = cols.filter((c) => {
    const b = bareName(c).replace(/\s/g, '');
    if (b.length < 2) return false;
    if (t.includes(b)) return true;
    const s = stem(b);
    return s.length >= 2 && t.includes(s);
  });
  return hit.length ? hit : null;
}

/** 選んだ指標が量（金額・件数）と率の2種類なら、2軸の組み合わせ（縦棒＋折れ線）で見せられる */
export const isVolumeAndRate = (cols: string[]): boolean => cols.some((c) => isRateName(c)) && cols.some((c) => !isRateName(c));
