import { applyRecipe } from '@/features/editor/fromRecipe';
import { previewSvg } from '@/features/editor/preview';
import { initialState, type BuilderState } from '@/features/editor/state';
import { recipesForChart, registry, type ChartTypeId, type RecipeId } from '@/registry';
import { recipeRenderable } from '@/engine/recipes';
import type { Locale } from '@/registry/locale';

/**
 * 「チャートから選ぶ」のカタログ。Excel や PowerPoint では作りにくいものから並べる。
 * 見本の絵は本物のエンジンで、見本データから描く（サーバーで一度だけ）
 */
export const CATALOG_ORDER: ChartTypeId[] = [
  'mekko', 'share_pair', 'waterfall', 'variable_width', 'bubble', 'slope', 'slope_pair', 'bar_100', 'variance_bar', 'clustered_column',
  'stacked_100', 'driver_bar', 'posneg_bar', 'scatter', 'stacked_column', 'line', 'column_trend', 'bar_rank', 'column_compare', 'bar_trend',
];
/** Excel・PowerPoint では作りにくい（手間がかかる）チャート。カードに印を付ける */
export const HARD_CHARTS: ReadonlySet<ChartTypeId> = new Set(['mekko', 'share_pair', 'waterfall', 'variable_width', 'bubble', 'slope', 'slope_pair', 'bar_100', 'variance_bar']);
/** はじめに見せる数（残りは「すべて見る」） */
export const CATALOG_FIRST = 8;

/** 絵に使う切り口（チャートの持ち味が一番伝わるもの。無ければそのチャートだけの切り口） */
const PREFERRED: Partial<Record<ChartTypeId, RecipeId>> = { bar_100: 'MIX_BAR100', mekko: 'MIX_MEKKO', line: 'TREND_LINE' };

export type ChartThumbs = Partial<Record<ChartTypeId, string>>;

/** 画面の言語ごとの見本の絵（英語の画面では、項目名・単位も英語の見本で描く） */
export const chartThumbsByLocale = (): Record<Locale, ChartThumbs> => ({ ja: chartThumbs('ja'), en: chartThumbs('en') });

/** チャートごとの見本の絵（SVG）。タイトル・出典は出さない（絵だけを見せる） */
export function chartThumbs(locale: Locale = 'ja'): ChartThumbs {
  const out: Partial<Record<ChartTypeId, string>> = {};
  for (const chart of CATALOG_ORDER) {
    // そのチャート1つだけの切り口（無ければそのチャートを使う最初の切り口）
    const r = (PREFERRED[chart] ? registry.recipes[PREFERRED[chart]!] : undefined) ?? recipesForChart(chart).find(recipeRenderable);
    if (!r) continue;
    const s0 = applyRecipe(initialState(locale), r);
    const s: BuilderState = { ...s0, recipe: r.id, title: '', source: '' };
    const svg = previewSvg(s);
    if (svg) out[chart] = svg;
  }
  return out;
}
