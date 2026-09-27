'use client';

import { useEffect, useMemo, useState } from 'react';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { useLocale, useT } from '@/i18n/ui';
import { localize, recipeParts, registry, type RecipeId } from '@/registry';
import { track } from '@/lib/ab/track';
import { useAuth } from '../shell/AppShell';
import { EMPHASIS_LABEL, differenceText, type Proposal } from '../start/coach';
import {
  addAlternativeSlide, addSupplementSlide, applyProposal, currentProposal, dismissSupplement, replaceWithAlternative,
  slideAlternatives, slideCoach, slideSupplement,
} from './coach';
import { evaluate } from './preview';
import { viewOf, type ProjectState } from './project';
import css from '../ui.module.css';
import lb from '../library/library.module.css';

/** 案を今のデータで描いた SVG（描けなければ null） */
function previewSvg(p: ProjectState, pr: Proposal): string | null {
  const v = viewOf(p);
  const r = evaluate(applyProposal(v, pr));
  return r.scene && !r.warnings.some((w) => w.key === 'warn.no_data') ? sceneToSvg(r.scene, { title: v.title }) : null;
}

/**
 * 編集画面の Coach（docs/decisions.md「Coach 型の切り口選定」）。
 * ・Coach のおすすめ（今のスライド）と、重視していること
 * ・同じデータから作った別の見せ方（同じ問い → 差し替え。スライドは増えない）
 * ・Coach からの追加提案（別の問い → 補助スライドとして追加。既定は「今は追加しない」）
 * 同じ案を両方に出さない。AI は使わない
 */
export function CoachPanel({ project, setProject }: { project: ProjectState; setProject: (f: (p: ProjectState) => ProjectState) => void }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const v = viewOf(project);
  const coach = slideCoach(v);
  const lead = currentProposal(v);
  const alts = useMemo(() => slideAlternatives(v), [v]);
  const supplement = useMemo(() => slideSupplement(project), [project]);
  const thumbs = useMemo(() => alts.map((a) => previewSvg(project, a)), [alts, project]);
  const [big, setBig] = useState<{ title: string; svg: string | null } | null>(null);
  const [supOpen, setSupOpen] = useState(false);
  const loggedIn = !!auth.session;

  useEffect(() => { setSupOpen(false); }, [project.current, supplement?.recipe]);
  useEffect(() => {
    if (!big) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [big]);

  if (!coach || !lead) return null;
  const name = (pr: Proposal) => L(registry.recipes[pr.recipe].name);
  const supSvg = supplement && supOpen ? previewSvg(project, { recipe: supplement.recipe }) : null;

  const replace = (pr: Proposal) => {
    track('coach_lead_replaced', { loggedIn, detail: pr.recipe.toLowerCase() });
    setBig(null);
    setProject((p) => replaceWithAlternative(p, pr));
  };
  const addAlt = (pr: Proposal) => {
    track('coach_supplement_added', { loggedIn, detail: pr.recipe.toLowerCase() });
    setProject((p) => addAlternativeSlide(p, pr));
  };
  const addSupplement = (id: RecipeId) => {
    track('coach_supplement_added', { loggedIn, detail: id.toLowerCase() });
    setProject((p) => addSupplementSlide(p, id));
  };

  return (
    <section className={css.coachPanel} aria-label={t('coach.editor.panel')}>
      <span className={css.contextKey}>{t('coach.recommendation')}</span>
      <span className={css.contextVal}>{L(registry.recipes[lead.recipe].name)}（{recipeParts(registry.recipes[lead.recipe], L)}）</span>
      {coach.emphasis && <span className={css.contextNote}>{t('coach.editor.emphasis', { what: L(EMPHASIS_LABEL[coach.emphasis]) })}</span>}

      {alts.length > 0 && (
        <>
          <span className={css.contextKey}>{t('coach.editor.alternatives')}</span>
          <span className={css.coachDiff}>{t('coach.editor.alternativesNote')}</span>
          <ul className={css.coachAlts}>
            {alts.map((a, i) => (
              <li key={a.recipe} className={css.coachAlt}>
                <button type="button" className={css.coachThumb} aria-label={t('coach.editor.enlarge', { name: name(a) })}
                  onClick={() => { track('coach_alternative_previewed', { loggedIn, detail: a.recipe.toLowerCase() }); setBig({ title: name(a), svg: thumbs[i] ?? null }); }}>
                  {thumbs[i] ? <span dangerouslySetInnerHTML={{ __html: thumbs[i]! }} /> : <span className={css.stripNone}>{t('slides.problem')}</span>}
                </button>
                <b className={css.coachAltName}>{name(a)}</b>
                <span className={css.coachDiff}>{L(differenceText(lead, a))}</span>
                <span className={css.coachAltBtns}>
                  <button type="button" className={css.linkBtn}
                    onClick={() => { track('coach_alternative_previewed', { loggedIn, detail: a.recipe.toLowerCase() }); setBig({ title: name(a), svg: thumbs[i] ?? null }); }}>
                    {t('coach.editor.enlargeShort')}
                  </button>
                  <button type="button" className={css.contextAddBtn} onClick={() => replace(a)}>{t('coach.editor.replace')}</button>
                  <button type="button" className={css.linkBtn} onClick={() => addAlt(a)}>{t('coach.editor.addSupplement')}</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {supplement && (
        <>
          <span className={css.contextKey}>{t('coach.editor.supplementHead')}</span>
          <span className={css.contextAdvice}>
            {t('coach.editor.supplement', { what: L(registry.aspects[supplement.aspect].label), name: L(registry.recipes[supplement.recipe].name) })}
            <span className={css.coachAltBtns}>
              <button type="button" className={css.linkBtn} aria-expanded={supOpen} onClick={() => setSupOpen((x) => !x)}>
                {supOpen ? t('coach.editor.hidePreview') : t('coach.editor.preview')}
              </button>
              <button type="button" className={css.contextAddBtn} onClick={() => addSupplement(supplement.recipe)}>{t('coach.editor.addSupplement')}</button>
              <button type="button" className={css.linkBtn} onClick={() => setProject((p) => dismissSupplement(p, supplement.recipe))}>{t('coach.editor.notNow')}</button>
            </span>
            {supOpen && (
              <span className={css.coachThumb} aria-hidden="true">
                {supSvg ? <span dangerouslySetInnerHTML={{ __html: supSvg }} /> : <span className={css.stripNone}>{t('slides.problem')}</span>}
              </span>
            )}
          </span>
        </>
      )}

      {big && (
        <div className={lb.overlay} role="dialog" aria-modal="true" aria-label={big.title} onClick={() => setBig(null)}>
          <div className={lb.viewer} onClick={(e) => e.stopPropagation()}>
            <div className={lb.viewerHead}>
              <b>{big.title}</b>
              <button type="button" className="btn" onClick={() => setBig(null)}>{t('account.close')}</button>
            </div>
            <div className={lb.stage}>
              {big.svg ? <div className={lb.slide} dangerouslySetInnerHTML={{ __html: big.svg }} /> : <p className={css.note}>{t('slides.problem')}</p>}
            </div>
            <p className={css.note}>{t('coach.editor.sameData')}</p>
            <div className={css.buttons}>
              {(() => { const a = alts.find((x) => name(x) === big.title); return a ? <button type="button" className={css.primary} onClick={() => replace(a)}>{t('coach.editor.replace')}</button> : null; })()}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
