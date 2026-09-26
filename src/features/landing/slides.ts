import { applyRecipe } from '@/features/editor/fromRecipe';
import { previewSvg } from '@/features/editor/preview';
import { initialState, type BuilderState } from '@/features/editor/state';
import { registry, type RecipeId } from '@/registry';

/**
 * 紹介トップの絵：本物のエンジンで、見本データ（ダミー）から描いたスライド。
 * サーバーで一度だけ描いて SVG の文字列で渡す（画面を開いた時に計算しない）。
 */
function slideSvg(id: RecipeId, controls: Record<string, unknown> = {}, patch: Partial<BuilderState> = {}): string {
  const s0 = applyRecipe(initialState(), registry.recipes[id]);
  const s: BuilderState = { ...s0, ...patch, recipe: id, controls: { ...s0.controls, ...controls } };
  return previewSvg(s) ?? '';
}

export interface LandingSlides {
  hero: string;
  examples: { id: RecipeId; svg: string }[];
  prebuilt: { mekko: string; waterfall: string; slope: string; bubble: string; chartTable: string };
}

export function landingSlides(): LandingSlides {
  return {
    // タイトルは見本データの数字に合わせて書いたもの（東南アジア CAGR 20.4%、2025年 北米430・中国420 など）
    // 相談の例（海外5地域の売上でどこが成長しているか）→ 推移＋CAGR表。成長の大きい地域を強調
    hero: slideSvg('TREND_CAGR_TABLE', { highlight: '東南アジア', data_labels: 'highlight' }, { title: '東南アジアが年率20%で最も速く成長。規模では北米と中国が並ぶ' }),
    examples: [
      { id: 'TREND_CAGR_TABLE', svg: slideSvg('TREND_CAGR_TABLE', { highlight: '中国' }) },
      { id: 'SIZE_MIX_CAGR', svg: slideSvg('SIZE_MIX_CAGR', {}, { title: '市場は4年で37%拡大。増加分の6割を中国と東南アジアが占める' }) },
      { id: 'COMP_VARIANCE', svg: slideSvg('COMP_VARIANCE', {}, { title: '5地域すべてで増加。増加幅は中国が最大で、日本はほぼ横ばい' }) },
    ],
    prebuilt: {
      mekko: slideSvg('MIX_MEKKO_GROWTH'),
      waterfall: slideSvg('CONTRIB_WATERFALL'),
      slope: slideSvg('TREND_SLOPE', { highlight: '中国' }),
      bubble: slideSvg('REL_BUBBLE'),
      chartTable: slideSvg('START_END_CAGR'),
    },
  };
}
