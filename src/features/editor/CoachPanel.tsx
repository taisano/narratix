'use client';

import { useEffect, useMemo, useState } from 'react';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { useLocale, useT } from '@/i18n/ui';
import { localize, registry, slideSvgFont, type ComplementId, type LocalizedText, type RecipeId } from '@/registry';
import { track } from '@/lib/ab/track';
import { useAuth } from '../shell/AppShell';
import { EMPHASIS_LABEL, differenceText, type Proposal } from '../start/coach';
import {
  addAlternativeSlide, addSupplementSlide, applyProposal, currentProposal, dismissSupplement, replaceWithAlternative,
  slideAlternatives, slideCoach, slideSupplement, type EditorCoach,
} from './coach';
import { evaluate } from './preview';
import { viewOf, type ProjectState } from './project';
import { isComplementOn } from './state';
import css from '../ui.module.css';
import lb from '../library/library.module.css';

type SetProject = (f: (p: ProjectState) => ProjectState) => void;

/** 案を今のデータで描いた SVG（描けなければ null） */
function previewSvg(p: ProjectState, pr: Proposal): string | null {
  const v = viewOf(p);
  const r = evaluate(applyProposal(v, pr));
  return r.scene && !r.warnings.some((w) => w.key === 'warn.no_data') ? sceneToSvg(r.scene, { title: v.title, font: slideSvgFont(v.deckStyle?.font, v.slideLocale) }) : null;
}

/** 大きく見る（同じデータで描いたプレビュー） */
function BigPreview({ title, svg, onClose, onReplace }: { title: string; svg: string | null; onClose: () => void; onReplace?: () => void }) {
  const t = useT();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className={lb.overlay} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={lb.viewer} onClick={(e) => e.stopPropagation()}>
        <div className={lb.viewerHead}>
          <b>{title}</b>
          <button type="button" className="btn" onClick={onClose}>{t('account.close')}</button>
        </div>
        <div className={lb.stage}>
          {svg ? <div className={lb.slide} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className={css.note}>{t('slides.problem')}</p>}
        </div>
        <p className={css.note}>{t('coach.editor.sameData')}</p>
        {onReplace && <div className={css.buttons}><button type="button" className={css.primary} onClick={onReplace}>{t('coach.editor.replace')}</button></div>}
      </div>
    </div>
  );
}

/**
 * 左の「Coach」カード：次の一手を「説明＋操作」で出す（docs/decisions.md）。
 * 出すのは次の一手1つだけ：
 * ・今のスライドに足せる補完パーツ → ［…を追加］でその場でオン。オンにした後は「追加しました」＋［元に戻す］
 * ・それが無ければ、おすすめで答えていない別の問い → ［補助スライドとして追加］（既定は「今は追加しない」）
 * ・どちらも無い時だけ、レシピの定型のコツを1つ。何も無ければカードを出さない
 */
export function CoachCard({ project, setProject, coach, tips, onComplement, inStory = false, quiet = false }: {
  project: ProjectState; setProject: SetProject; coach: EditorCoach; tips: LocalizedText[];
  /** 控えめに（枠・太字・背景なし。ストーリーの問いの一覧より強く見せない） */
  quiet?: boolean;
  onComplement: (id: ComplementId, on: boolean) => void;
  /** ストーリーの編集画面：補助スライドは目立たせず、今の問いのすぐ後ろに入ることを添える */
  inStory?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const L = (x: LocalizedText) => localize(x, locale);
  const supplementAll = useMemo(() => slideSupplement(project), [project]);
  const [applied, setApplied] = useState<ComplementId[]>([]);
  const [supBig, setSupBig] = useState(false);
  // 別のスライドに移ったら「追加しました」は消す
  useEffect(() => { setApplied([]); setSupBig(false); }, [project.current]);
  // 右の「補完」で外した・付けたものは「追加しました」から外す（表示が実際の状態とずれないように）
  const v = viewOf(project);
  const shownApplied = applied.filter((id) => isComplementOn(v, id));

  // 次の一手は1つだけ：補完パーツ（このスライドで済む）を先に、無ければ補助スライド
  const comps = coach.complements.filter((c) => !applied.includes(c.id)).slice(0, 1);
  const supplement = comps.length ? null : supplementAll;
  const tip = !comps.length && !supplement && !shownApplied.length ? tips[0] : undefined;
  if (!comps.length && !supplement && !shownApplied.length && !tip) return null;
  const cname = (id: ComplementId) => L(registry.complements[id].label);

  return (
    <section className={quiet ? css.coachQuiet : css.coachCard} aria-label={t('coach.card.title')}>
      <span className={css.coachCardHead}>{t('coach.card.title')}</span>
      {comps.map((c) => (
        <div key={c.id} className={css.coachItem}>
          <p>{c.reason
            ? t('coach.card.reason', { reason: L(c.reason), name: cname(c.id) })
            : t('coach.card.complement', { what: L(registry.aspects[c.aspect!].label), name: cname(c.id) })}</p>
          <button type="button" className={quiet ? css.linkBtn : css.coachAct} onClick={() => { onComplement(c.id, true); setApplied((a) => [...a, c.id]); }}>
            {t('coach.card.add', { name: cname(c.id) })}
          </button>
        </div>
      ))}
      {shownApplied.map((id) => (
        <div key={id} className={css.coachDone} role="status">
          <span>{t('coach.card.added', { name: cname(id) })}</span>
          <button type="button" className={css.linkBtn} onClick={() => { onComplement(id, false); setApplied((a) => a.filter((x) => x !== id)); }}>{t('coach.card.undo')}</button>
        </div>
      ))}
      {supplement && (
        <div className={css.coachItem}>
          <p>{t('coach.editor.supplement', { what: L(registry.aspects[supplement.aspect].label), name: L(registry.recipes[supplement.recipe].name) })}</p>
          <button type="button" className={inStory ? css.linkBtn : css.coachAct} onClick={() => {
            track('coach_supplement_added', { loggedIn: !!auth.session, detail: supplement.recipe.toLowerCase() });
            setProject((p) => addSupplementSlide(p, supplement.recipe));
          }}>{t('coach.editor.addSupplement')}</button>
          {inStory && <span className={css.coachDiff}>{t('coach.editor.supplementWhere')}</span>}
          <span className={css.coachLinks}>
            <button type="button" className={css.linkBtn} onClick={() => setSupBig(true)}>{t('coach.editor.preview')}</button>
            <button type="button" className={css.linkBtn} onClick={() => setProject((p) => dismissSupplement(p, supplement.recipe))}>{t('coach.editor.notNow')}</button>
          </span>
          {supBig && <BigPreview title={L(registry.recipes[supplement.recipe].name)} svg={previewSvg(project, { recipe: supplement.recipe as RecipeId })} onClose={() => setSupBig(false)} />}
        </div>
      )}
      {tip && <p className={css.coachTip}>{L(tip)}</p>}
    </section>
  );
}

/**
 * 「別の見せ方を見る（N案）」：同じ問いに別の形で答える案。右のチャートの欄の上に、初めは閉じて1行だけ。差し替えたら閉じる。
 * 開くと、今のデータで描いた縮小図・違い・［この案に差し替える］［補助スライドとして追加］。縮小図を押すと大きく見る
 */
export function AlternativesFold({ project, setProject, inStory = false }: { project: ProjectState; setProject: SetProject; inStory?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const L = (x: LocalizedText) => localize(x, locale);
  const v = viewOf(project);
  const coach = slideCoach(v);
  const lead = currentProposal(v);
  const alts = useMemo(() => slideAlternatives(v), [v]);
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState<Proposal | null>(null);
  const [info, setInfo] = useState(false);
  const thumbs = useMemo(() => (open ? alts.map((a) => previewSvg(project, a)) : []), [open, alts, project]);
  const loggedIn = !!auth.session;
  useEffect(() => { setOpen(false); setBig(null); }, [project.current]);

  if (!coach || !lead || !alts.length) return null;
  const name = (pr: Proposal) => L(registry.recipes[pr.recipe].name);
  const replace = (pr: Proposal) => {
    track('coach_lead_replaced', { loggedIn, detail: pr.recipe.toLowerCase() });
    setBig(null);
    setOpen(false);
    setProject((p) => replaceWithAlternative(p, pr));
  };
  const preview = (pr: Proposal) => { track('coach_alternative_previewed', { loggedIn, detail: pr.recipe.toLowerCase() }); setBig(pr); };

  return (
    <details className={css.altFold} open={open} onToggle={(e) => {
      const o = (e.currentTarget as HTMLDetailsElement).open;
      if (o && !open) track('coach_alternatives_opened', { loggedIn, detail: lead.recipe.toLowerCase() });
      setOpen(o);
    }}>
      <summary>{t('coach.editor.others', { n: alts.length })}<button type="button" className={css.infoBtn} aria-label={t('coach.editor.othersInfoLabel')} aria-expanded={info}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfo((v) => !v); }}>i</button></summary>
      {info && <p className={css.note}>{t('coach.editor.othersInfo')}</p>}
      {open && (
        <div className={css.altBody}>
          <ul className={css.coachAlts}>
            {alts.map((a, i) => (
              <li key={a.recipe} className={css.coachAlt}>
                <button type="button" className={css.coachThumb} aria-label={t('coach.editor.enlarge', { name: name(a) })} onClick={() => preview(a)}>
                  {thumbs[i] ? <span dangerouslySetInnerHTML={{ __html: thumbs[i]! }} /> : <span className={css.stripNone}>{t('slides.problem')}</span>}
                </button>
                <b className={css.coachAltName}>{name(a)}</b>
                {/* プレビュー・差し替え・追加：同じ形のボタンを横に並べる */}
                <span className={css.altActions}>
                  <button type="button" className="btn" onClick={() => preview(a)}>{t('coach.editor.preview')}</button>
                  <button type="button" className="btn" onClick={() => replace(a)}>{t('coach.editor.replaceShort')}</button>
                  <button type="button" className="btn" onClick={() => {
                    track('coach_supplement_added', { loggedIn, detail: a.recipe.toLowerCase() });
                    setProject((p) => addAlternativeSlide(p, a));
                  }} title={t('coach.editor.addSupplement')}>{t('coach.editor.addShort')}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {big && <BigPreview title={name(big)} svg={previewSvg(project, big)} onClose={() => setBig(null)} onReplace={() => replace(big)} />}
    </details>
  );
}
