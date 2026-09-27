import type { MessageKey } from '@/i18n/ui';
import { primaryChart, type ChartTypeId, type DataSchemaId, type RecipeDef } from '@/registry';

type T = (k: MessageKey, v?: Record<string, string | number>) => string;

/** 必要なデータの一文（例：行＝時間（年など）× 列＝項目、行は年（2つ以上））。② のカードとデータ欄で同じ文を使う */
export function needsText(t: T, recipe: RecipeDef | null, schema: DataSchemaId, chart?: ChartTypeId): string {
  // 幅が変わる縦棒は、同じ関係のデータでも列の読み方が違う（幅と高さ）
  const c = chart ?? (recipe ? primaryChart(recipe) : null);
  if (c === 'variable_width') return t('needs.VARIABLE_WIDTH');
  if (c === 'slope_pair') return t('needs.SLOPE_PAIR');
  if (!recipe) return t(`needs.${schema}` as MessageKey);
  return [t(`needs.${recipe.schema}` as MessageKey), recipe.requirements.timeAxis && t('needs.years'), recipe.requirements.base && t('needs.base')].filter(Boolean).join('、');
}
