'use client';

import Link from 'next/link';
import { useLocale, useT } from '@/i18n/ui';
import {
  localize, recipeParts, recipesForChart, registry, standardComplements,
  type ComplementId, type RecipeDef,
} from '@/registry';
import type { BuilderState } from './state';
import css from '../ui.module.css';

/** 標準構成の部品がオンか（Mekko の揃えた表も含めて） */
export function complementOn(s: BuilderState, id: ComplementId): boolean {
  return !!s.complements[id];
}

/**
 * いまの構成で答えられる問い。標準構成の部品を外していたら、そのチャートの単品レシピの問い（無ければ目的の問い）に変える。
 */
export function answeredQuestion(recipe: RecipeDef | null, s: BuilderState): { text: { en: string; ja?: string }; reduced: boolean } {
  const purposeQ = registry.purposes[registry.charts[s.chart].purpose].question;
  if (!recipe) {
    const single = recipesForChart(s.chart).find((r) => r.composition === 'SINGLE_CHART' && !standardComplements(r).length);
    return { text: single?.question ?? purposeQ, reduced: false };
  }
  const missing = standardComplements(recipe).filter((c) => !complementOn(s, c));
  if (!missing.length) return { text: recipe.question, reduced: false };
  const fallback = recipesForChart(s.chart).find((r) => r.composition === 'SINGLE_CHART' && standardComplements(r).every((c) => complementOn(s, c)));
  return { text: fallback?.question ?? purposeQ, reduced: true };
}

/** 右側の「補完」の欄を開いて、そこへ移る（左側では設定を変えない） */
function focusComplements() {
  const el = document.getElementById('fold-complements') as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  (el.querySelector('summary') as HTMLElement | null)?.focus({ preventScroll: true });
}

/**
 * 左側：現在地と設計意図（docs/consultation-flow.md 19.3・23.3）。
 * 採用した切り口・この構成で答える問い・補完アドバイス（レシピの定型文）。設定は変えない。
 */
export function ContextPane({ recipe, state, index, total, hasPlan, children }: {
  recipe: RecipeDef | null; state: BuilderState; index: number; total: number; hasPlan: boolean; children: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const q = answeredQuestion(recipe, state);
  return (
    <aside className={css.contextPane} aria-label={t('context.label')}>
      <div className={css.contextBlock}>
        <b className={css.contextNow}>{t('slides.editing', { n: index + 1, total })}</b>
        <span className={css.contextKey}>{t('context.approach')}</span>
        <span className={css.contextVal}>{recipe ? `${L(recipe.name)}（${recipeParts(recipe, L)}）` : L(registry.charts[state.chart].label)}</span>
        <span className={css.contextKey}>{t('context.question')}</span>
        <span className={css.contextVal}>{L(q.text)}</span>
        {q.reduced && <span className={css.contextNote}>{t('context.reduced')}</span>}
        {recipe?.advice?.length ? (
          <>
            <span className={css.contextKey}>{t('context.advice')}</span>
            {recipe.advice.map((a, i) => <span key={i} className={css.contextAdvice}>{L(a)}</span>)}
            <button type="button" className={css.linkBtn} onClick={focusComplements}>{t('context.toComplements')}</button>
          </>
        ) : null}
        {hasPlan && <Link href="/start?resume=1" className={css.linkBtn}>{t('plan.backToRecipes')}</Link>}
      </div>
      {children}
    </aside>
  );
}
