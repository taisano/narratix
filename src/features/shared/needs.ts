import type { MessageKey } from '@/i18n/ui';
import type { DataSchemaId, RecipeDef } from '@/registry';

type T = (k: MessageKey, v?: Record<string, string | number>) => string;

/** 必要なデータの一文（例：行＝時間（年など）× 列＝項目、行は年（2つ以上））。② のカードとデータ欄で同じ文を使う */
export function needsText(t: T, recipe: RecipeDef | null, schema: DataSchemaId): string {
  if (!recipe) return t(`needs.${schema}` as MessageKey);
  return [t(`needs.${recipe.schema}` as MessageKey), recipe.requirements.timeAxis && t('needs.years'), recipe.requirements.base && t('needs.base')].filter(Boolean).join('、');
}
