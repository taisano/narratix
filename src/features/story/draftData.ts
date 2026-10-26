import type { Locale } from '@/registry';
import { loadDraft, pastedSource, type DraftSource } from '../data/draft/session';
import type { BuilderState } from '../editor/state';
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
  const matrix = loaded.sets.find((s) => s.dataset.schema === 'MATRIX_TIME_SERIES');
  const relation = loaded.sets.find((s) => s.dataset.schema === 'BUBBLE');
  if (matrix) out.push({ id: 'table', label: '', data: matrix.dataset as BuilderState['dataset'], source });
  if (relation) out.push({ id: 'relation', label: '', data: relation.dataset as BuilderState['dataset'], source });
  return out;
}

/** Story を始める時に、下書きのデータを入れた Story にする（すでに同じ id のデータがあれば貼った表を優先） */
export function withDraftData<T extends { datasets: StoryDataset[] }>(story: T, draft: DraftSource | undefined, locale: Locale): T {
  const add = storyDatasetsFromDraft(draft, locale);
  if (!add.length) return story;
  const ids = new Set(add.map((d) => d.id));
  return { ...story, datasets: [...add, ...story.datasets.filter((d) => !ids.has(d.id))] };
}
