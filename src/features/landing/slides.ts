import { applyRecipe } from '@/features/editor/fromRecipe';
import { previewSvg } from '@/features/editor/preview';
import { initialState, type BuilderState } from '@/features/editor/state';
import { registry, type RecipeId } from '@/registry';
import type { Locale } from '@/registry/locale';
import { genAiMekko } from './mekko-genai';

/**
 * 紹介トップの絵：本物のエンジンで、見本データ（ダミー）から描いたスライド。
 * サーバーで一度だけ描いて SVG の文字列で渡す（画面を開いた時に計算しない）。
 */
function slideSvg(id: RecipeId, controls: Record<string, unknown> = {}, patch: Partial<BuilderState> = {}): string {
  const s0 = applyRecipe(initialState(), registry.recipes[id]);
  const s: BuilderState = { ...s0, ...patch, recipe: id, controls: { ...s0.controls, ...controls } };
  return previewSvg(s) ?? '';
}

/** 生成AI利用の Mekko（規模と構成＋成長率の表）。画面の言語ごとに描く */
function mekkoSvg(locale: Locale): string {
  const m = genAiMekko(locale);
  const s0 = initialState();
  const s: BuilderState = {
    ...s0, dataset: m.dataset as BuilderState['dataset'], title: m.title, source: m.source, slideLocale: locale, recipe: 'MIX_MEKKO_GROWTH',
    controls: { ...s0.controls, mekko_labels: 'pct', sort_by_size: true },
    complements: { ...s0.complements, aligned_table: true, delta_labels: true },
    mekko: { showTotal: true, growthMode: 'cagr', growthRows: ['market', `series:${m.analysisCol}`] },
  };
  return previewSvg(s) ?? '';
}

export interface LandingSlides {
  /** ヒーローと 04 の Mekko（言語ごと。生成AI利用の見本） */
  mekko: Record<Locale, string>;
  examples: { id: RecipeId; svg: string }[];
  prebuilt: { waterfall: string; slope: string; bubble: string; chartTable: string };
}

export function landingSlides(): LandingSlides {
  return {
    mekko: { ja: mekkoSvg('ja'), en: mekkoSvg('en') },
    examples: [
      { id: 'TREND_CAGR_TABLE', svg: slideSvg('TREND_CAGR_TABLE', { highlight: '中国' }) },
      { id: 'SIZE_MIX_CAGR', svg: slideSvg('SIZE_MIX_CAGR', {}, { title: '市場は4年で37%拡大。増加分の6割を中国と東南アジアが占める' }) },
      { id: 'COMP_VARIANCE', svg: slideSvg('COMP_VARIANCE', {}, { title: '5地域すべてで増加。増加幅は中国が最大で、日本はほぼ横ばい' }) },
    ],
    prebuilt: {
      waterfall: slideSvg('CONTRIB_WATERFALL'),
      slope: slideSvg('TREND_SLOPE', { highlight: '中国' }),
      bubble: slideSvg('REL_BUBBLE'),
      chartTable: slideSvg('START_END_CAGR'),
    },
  };
}
