'use client';

import Link from 'next/link';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { checkRecipeData, recipeIssueText } from '@/engine/recipes';
import { localize, type RecipeId } from '@/registry';
import { chosenRecipes, type Plan } from '../start/plan';
import { Fold } from './Fold';
import { toDataset, type BuilderState } from './state';
import css from '../ui.module.css';

/**
 * ② で選んだ案（切り口の計画）。③ の画面ができるまでは、ここから1枚ずつ作る。
 * 今の案がこのデータで作れるかを、決まった規則と文で確かめて出す（AI は使わない）。
 */
export function PlanBar({ plan, current, state, onPick, onClose }: {
  plan: Plan; current: RecipeId | null; state: BuilderState; onPick: (id: RecipeId) => void; onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const chosen = chosenRecipes(plan);
  const cur = chosen.find((c) => c.recipe.id === current)?.recipe;
  const check = cur ? checkRecipeData(cur, toDataset(state)) : null;
  return (
    <Fold id="plan" title={t('plan.title')}>
      <p className={css.note}>{t('plan.note')}</p>
      <ol className={css.planList}>
        {chosen.map((c, i) => (
          <li key={c.recipe.id}>
            <button type="button" className={css.planItem} aria-pressed={c.recipe.id === current} onClick={() => onPick(c.recipe.id)}>
              <span>{i + 1}. {localize(c.recipe.name, locale)}</span>
              <small>{t(`comp.${c.recipe.composition}` as MessageKey)}{c.recipe.id === current ? `・${t('plan.current')}` : ''}</small>
            </button>
          </li>
        ))}
      </ol>
      {check && check.issues.length > 0 && (
        <ul className={css.warnings}>
          {check.issues.map((i, k) => <li key={k}>{recipeIssueText(i, locale)}</li>)}
        </ul>
      )}
      <div className={css.buttons}>
        <Link href="/start?resume=1" className="btn">{t('plan.backToRecipes')}</Link>
        <button type="button" className={css.linkBtn} onClick={onClose}>{t('plan.close')}</button>
      </div>
    </Fold>
  );
}
