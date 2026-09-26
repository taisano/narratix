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
function slideSvg(locale: Locale, id: RecipeId, controls: Record<string, unknown> = {}, patch: Partial<BuilderState> = {}): string {
  const s0 = applyRecipe(initialState(locale), registry.recipes[id]);
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
  /** 見本と PreBuilt の絵（言語ごと。英語の画面では項目名・単位・見出しも英語） */
  examples: Record<Locale, { id: RecipeId; svg: string }[]>;
  prebuilt: Record<Locale, { waterfall: string; slope: string; bubble: string; chartTable: string }>;
}

/** 見本の見出し（言語ごと） */
const EXAMPLE_TITLES: Record<Locale, { sizeMix: string; variance: string; china: string }> = {
  ja: { sizeMix: '市場は4年で37%拡大。増加分の6割を中国と東南アジアが占める', variance: '5地域すべてで増加。増加幅は中国が最大で、日本はほぼ横ばい', china: '中国' },
  en: { sizeMix: 'The market grew 37% in four years; China and Southeast Asia made up 60% of the increase', variance: 'All five regions grew; China grew the most while Japan was nearly flat', china: 'China' },
};

function slidesFor(locale: Locale) {
  const x = EXAMPLE_TITLES[locale];
  return {
    examples: [
      { id: 'TREND_CAGR_TABLE' as RecipeId, svg: slideSvg(locale, 'TREND_CAGR_TABLE', { highlight: x.china }) },
      { id: 'SIZE_MIX_CAGR' as RecipeId, svg: slideSvg(locale, 'SIZE_MIX_CAGR', {}, { title: x.sizeMix }) },
      { id: 'COMP_VARIANCE' as RecipeId, svg: slideSvg(locale, 'COMP_VARIANCE', {}, { title: x.variance }) },
    ],
    prebuilt: {
      waterfall: slideSvg(locale, 'CONTRIB_WATERFALL'),
      slope: slideSvg(locale, 'TREND_SLOPE', { highlight: x.china }),
      bubble: slideSvg(locale, 'REL_BUBBLE'),
      chartTable: slideSvg(locale, 'START_END_CAGR'),
    },
  };
}

export function landingSlides(): LandingSlides {
  const ja = slidesFor('ja');
  const en = slidesFor('en');
  return {
    mekko: { ja: mekkoSvg('ja'), en: mekkoSvg('en') },
    examples: { ja: ja.examples, en: en.examples },
    prebuilt: { ja: ja.prebuilt, en: en.prebuilt },
  };
}
