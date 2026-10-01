'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreMenu } from '../shared/MoreMenu';
import { useLocale, useT } from '@/i18n/ui';
import {
  STORY_TEMPLATES, localize, recipeParts, recipesForChart, registry, standardComplements,
  type ComplementId, type RecipeDef,
} from '@/registry';
import { isComplementOn, type BuilderState } from './state';
import type { EditorCoach } from './coach';
import { CoachCard } from './CoachPanel';
import type { ProjectState } from './project';
import css from '../ui.module.css';

/** 標準構成の部品がオンか（Mekko の揃えた表も含めて） */
export function complementOn(s: BuilderState, id: ComplementId): boolean {
  return isComplementOn(s, id);
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

/**
 * 左側：現在地（docs/decisions.md「編集画面の左を簡素にする」）。役割は4つだけ：
 * 前の工程へ戻る・今のスライドと答える問い・Coach の次の一手・スライド一覧（別の見せ方は右のチャートの欄の上）。
 * 詳しい設定は右側。相談文は畳んでおく
 */
export function ContextPane({ recipe, state, index, total, hasPlan, consultation, origin, advice = [], suggestions = [], coach, project, setProject, onComplement, position, inStory = false, children }: {
  recipe: RecipeDef | null; state: BuilderState; index: number; total: number; hasPlan: boolean;
  /** このチャートを作った時の相談文（相談から作った時だけ） */
  consultation?: string;
  /** Library の見本から複製した時の元（相談文の代わりに出す） */
  origin?: { kind: 'library'; id: string; title: string };
  /** チャートとデータの相性の注意（advice.ts の規則） */
  advice?: string[];
  /** データの形から、ほかの見せ方（advice.ts の dataSuggestions） */
  suggestions?: string[];
  /** 全スライドの組み合わせから出す補完アドバイス（coach.ts） */
  coach: EditorCoach;
  project: ProjectState;
  setProject: (f: (p: ProjectState) => ProjectState) => void;
  /** Coach カードから補完パーツをその場でオン・オフ */
  onComplement: (id: ComplementId, on: boolean) => void;
  /** 位置の表示を差し替える（ストーリーでは「問い n / 全体」） */
  position?: string;
  /** ストーリーの編集画面か（補助スライドの入る場所を添える） */
  inStory?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const q = answeredQuestion(recipe, state);
  // レシピから来ていない時も、そのチャートの単品レシピのコツを出す
  const adviceRecipe = recipe ?? recipesForChart(state.chart).find((r) => r.composition === 'SINGLE_CHART' && r.advice?.length) ?? null;
  const tips = adviceRecipe?.advice ?? [];
  // 表・言葉の型：名前と、何のための型か（グラフ用の Coach・注意は出さない）
  const tpl = state.view ? STORY_TEMPLATES[state.view] : null;
  const name = tpl ? L(tpl.label) : recipe ? L(recipe.name) : L(registry.charts[state.chart].label);
  // ストーリー：左は Story の目的と問いの一覧（children）だけ。その下に Coach を控えめに（今のスライドの名前・問い・注意は重ねない）
  if (inStory) {
    return (
      <aside id="context-pane" className={css.contextPane} aria-label={t('context.label')}>
        {children}
        {!tpl && <CoachCard project={project} setProject={setProject} coach={coach} tips={tips} onComplement={onComplement} inStory quiet />}
      </aside>
    );
  }
  return (
    <aside id="context-pane" className={css.contextPane} aria-label={t('context.label')}>
      <div className={css.contextBlock}>
        {/* 「伝え方を選び直す」は見出し横の…へ（常に1行を取らず、左と中央の上端を揃える） */}
        <span className={css.contextHead}>
          <span className={css.contextPos}>{position ?? t('slides.position', { n: index + 1, total })}</span>
          {hasPlan && <MoreMenu label={t('nav.menuEditor')} items={[{ label: t('plan.backToRecipes'), onClick: () => router.push('/start?resume=1') }]} />}
        </span>
        <b className={css.contextName} title={recipe ? `${name}（${recipeParts(recipe, L)}）` : name}>{name}</b>
        {tpl ? <span className={css.contextQ}>{L(tpl.purpose)}</span> : <>
        <span className={css.contextKey}>{t('context.question')}</span>
        <span className={css.contextQ}>{L(q.text)}</span>
        {q.reduced && <span className={css.contextNote}>{t('context.reduced')}</span>}
        </>}
        {(consultation || origin) && (
          <details className={css.contextMore}>
            <summary>{origin ? t('context.origin') : t('context.consultation')}</summary>
            {origin ? (
              <>
                <span className={css.contextVal}>{t('context.fromLibrary', { title: origin.title })}</span>
                <Link href="/library" className={css.linkBtn}>{t('library.open')}</Link>
              </>
            ) : <span className={css.contextQuote} title={consultation}>{consultation}</span>}
          </details>
        )}
      </div>
      {!tpl && <CoachCard project={project} setProject={setProject} coach={coach} tips={tips} onComplement={onComplement} inStory={inStory} />}
      {!tpl && (advice.length > 0 || suggestions.length > 0) && (
        <div className={css.contextBlock}>
          {advice.length > 0 && (
            <>
              <span className={css.contextKey}>{t('fit.heading')}</span>
              {advice.map((a, i) => <span key={i} className={css.contextWarn}>{a}</span>)}
            </>
          )}
          {suggestions.length > 0 && (
            <>
              <span className={css.contextKey}>{t('suggest.heading')}</span>
              {suggestions.map((a, i) => <span key={i} className={css.contextSuggest}>{a}</span>)}
            </>
          )}
        </div>
      )}
      {children}
    </aside>
  );
}
