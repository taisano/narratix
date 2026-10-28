import type { Locale } from '@/registry';
import { isRateName } from '@/engine/layout/charts/combo-config';
import { loadDraft, pastedSource, type DraftSource } from '../data/draft/session';
import type { BuilderState } from '../editor/state';
import type { ColumnRoleMap } from '../data/draft/columnRoles';
import type { StoryDataset } from './model';

/**
 * 貼った表から作った実データを、Story のデータにする（表の形の元データ＋関係の元データがあれば関係）。
 * Story の問いは、このデータで最初のグラフを描く（見本にしない）。列対応が決まっていない・組み替えられない時は空
 */
export function storyDatasetsFromDraft(draft: DraftSource | undefined, locale: Locale): StoryDataset[] {
  if (!draft?.map) return [];
  const loaded = loadDraft({ ...draft, pick: undefined });
  if (!loaded.ok) return [];
  const source = pastedSource(draft.tsv, locale);
  const out: StoryDataset[] = [];
  // 表の形の元データは、指標（列）をいちばん多く持つもの（単位の違う指標も全部。時系列の形は同じ単位の指標だけに絞るので、売上だけになる）。見せる列は問いごとに絞る
  const matrix = loaded.sets.filter((s) => s.dataset.schema === 'MATRIX_TIME_SERIES').reduce<(typeof loaded.sets)[number] | undefined>((best, s) => (!best || s.dataset.cols.length > best.dataset.cols.length ? s : best), undefined);
  const relation = loaded.sets.find((s) => s.dataset.schema === 'BUBBLE');
  if (matrix) out.push({ id: 'table', label: '', data: matrix.dataset as BuilderState['dataset'], source });
  if (relation) out.push({ id: 'relation', label: '', data: relation.dataset as BuilderState['dataset'], source });
  return out;
}

/** Story を始める時に、下書きのデータを入れた Story にする（すでに同じ id のデータがあれば貼った表を優先） */
export function withDraftData<T extends { datasets: StoryDataset[]; draft?: { tsv: string; map: ColumnRoleMap; question: string } }>(story: T, draft: DraftSource | undefined, locale: Locale): T {
  const add = storyDatasetsFromDraft(draft, locale);
  if (!add.length) return story;
  const ids = new Set(add.map((d) => d.id));
  return { ...story, datasets: [...add, ...story.datasets.filter((d) => !ids.has(d.id))], ...(draft?.map ? { draft: { tsv: draft.tsv, map: structuredClone(draft.map), question: draft.question } } : {}) };
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
