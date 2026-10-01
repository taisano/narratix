import { RECIPE_IDS, registry } from '@/registry';
import { isSampleData } from './fromRecipe';
import { viewOf, type ProjectState } from './project';
import { BRIDGE_TITLE, BRIDGE_TITLE_EN, PAIR_TITLE, PAIR_TITLE_EN, RELATION_TITLE, RELATION_TITLE_EN, SAMPLE_SOURCES, SAMPLE_TITLE, SAMPLE_TITLE_EN, TREND_TITLE, TREND_TITLE_EN } from './sample';

/**
 * 見本のまま残っているもの（出力・保存の前に知らせる）。
 * タイトル：見本のタイトル、または切り口の「答える問い」のまま（② から作った時の仮の見出し）
 * 出典：見本の出典のまま。データ：見本のデータのまま
 */
export type Leftover = 'title' | 'source' | 'data';

const PLACEHOLDER_TITLES = new Set<string>([
  SAMPLE_TITLE, TREND_TITLE, BRIDGE_TITLE, RELATION_TITLE, SAMPLE_TITLE_EN, TREND_TITLE_EN, BRIDGE_TITLE_EN, RELATION_TITLE_EN, PAIR_TITLE, PAIR_TITLE_EN,
  ...RECIPE_IDS.flatMap((id) => Object.values(registry.recipes[id].question).filter((x): x is string => !!x)),
]);

export const isSampleSource = (source: string) => SAMPLE_SOURCES.includes(source.trim());
export const isPlaceholderTitle = (title: string) => PLACEHOLDER_TITLES.has(title.trim());

export function sampleLeftovers(p: ProjectState): Leftover[] {
  const all = p.slides.map((_, i) => viewOf(p, i));
  // 表・言葉の型のスライドは、データ（見本）を使わないので数えない
  const views = all.filter((v) => !v.view);
  const out: Leftover[] = [];
  if (all.some((v) => v.view && isPlaceholderTitle(v.title))) out.push('title');
  if (!out.includes('title') && views.some((v) => isPlaceholderTitle(v.title))) out.push('title');
  // 出典をどのスライドにも出さないなら、見本のままでも残りとして数えない
  if (isSampleSource(p.source) && views.some((v) => v.chartHeader?.showSource !== false)) out.push('source');
  if (views.some(isSampleData)) out.push('data');
  return out;
}
