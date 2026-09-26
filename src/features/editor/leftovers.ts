import { RECIPE_IDS, registry } from '@/registry';
import { isSampleData } from './fromRecipe';
import { viewOf, type ProjectState } from './project';
import { BRIDGE_TITLE, RELATION_TITLE, SAMPLE_SOURCES, SAMPLE_TITLE, TREND_TITLE } from './sample';

/**
 * 見本のまま残っているもの（出力・保存の前に知らせる）。
 * タイトル：見本のタイトル、または切り口の「答える問い」のまま（② から作った時の仮の見出し）
 * 出典：見本の出典のまま。データ：見本のデータのまま
 */
export type Leftover = 'title' | 'source' | 'data';

const PLACEHOLDER_TITLES = new Set<string>([
  SAMPLE_TITLE, TREND_TITLE, BRIDGE_TITLE, RELATION_TITLE,
  ...RECIPE_IDS.flatMap((id) => Object.values(registry.recipes[id].question).filter((x): x is string => !!x)),
]);

export const isSampleSource = (source: string) => SAMPLE_SOURCES.includes(source.trim());
export const isPlaceholderTitle = (title: string) => PLACEHOLDER_TITLES.has(title.trim());

export function sampleLeftovers(p: ProjectState): Leftover[] {
  const views = p.slides.map((_, i) => viewOf(p, i));
  const out: Leftover[] = [];
  if (views.some((v) => isPlaceholderTitle(v.title))) out.push('title');
  if (isSampleSource(p.source)) out.push('source');
  if (views.some(isSampleData)) out.push('data');
  return out;
}
