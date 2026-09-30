'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import {
  PURPOSE_IDS, localize, recipeAspects, registry,
  type LocalizedText, type RecipeDef,
} from '@/registry';
import { CLARIFY_QUESTIONS } from '@/lib/advisor/clarify';
import { FEEDBACK_REASONS, sendFeedback, type FeedbackReason } from '@/lib/repo/feedback';
import { useAuth } from '../shell/AppShell';
import type { MissingInfo } from '@/registry';
import {
  activeAnswers, addPurposeAngle, angleRecommendation, answerAsk, answerClarify, clearAsk, chosenRecipes, emphasisChoices, intentOf, pendingRecipeCount, planReady,
  purposeHasRecipes, recommendationState, removeAngle, setEmphasis, switchReading, type Angle, type Plan,
} from './plan';
import { EMPHASIS_LABEL, differenceText, reasonLines, type Proposal } from './coach';
import { CONSULT_MAX_CHARS, CONSULT_NOTE_MAX_CHARS } from '@/lib/ai/consult';
import type { ConsultQuota } from '@/lib/repo/quota';
import { needsText } from '../shared/needs';
import { ASKS, type AskId } from './dishes';
import { changeParts, proposalSvg } from './dishView';
import { examplesFor, mainChartOf } from './dishTag';
import { listLibrary, type LibraryItem } from '@/lib/repo/library';
import Link from 'next/link';
import { QuotaLine, shortPurpose } from './StartFlow';
import { track } from '@/lib/ab/track';
import { ScopeCard, scopeBlocksOneSlide } from '../story/ScopeCard';
import css from './start.module.css';

type SetPlan = (p: Plan) => void;
type Reconsult = (note: string) => Promise<boolean>;

/**
 * ② 伝え方を決める（Coach 型）。3つの入り口とも同じ画面。
 * ユーザーが選ぶのは「今回、最も強く伝えたいこと」（重視点）だけ。Coach がおすすめを1つ出し、主ボタンは「この構成でデータを入れる」の1つ。
 * ほかの見せ方は折りたたみ（選ばせない）。データを入れた後、同じデータの実プレビューで比べて差し替えられる
 */
export function RecipeScreen({ plan, setPlan, onNext, onReconsult, onEditConsultation, thinking = false, quota = null }: { plan: Plan; setPlan: SetPlan; onNext: (p?: Plan) => void; onReconsult?: Reconsult; onEditConsultation?: Reconsult; thinking?: boolean; quota?: ConsultQuota | null }) {
  const t = useT();
  const L = useL();
  const auth = useAuth();
  const c = plan.consultation;
  const clarify = c?.classification.expected_action === 'CLARIFY';
  const ready = planReady(plan);
  const goalOf = useGoalLabel();
  const [adding, setAdding] = useState(false);
  const accept = () => {
    track('coach_lead_accepted', { loggedIn: !!auth.session, detail: chosenRecipes(plan).map((x) => x.recipe.id.toLowerCase()).join(',').slice(0, 80) });
    onNext();
  };
  return (
    <div className={css.coachWork}>
      <aside className={css.left}>
        {c ? (
          <>
            <h2 className={css.colHead}>{t('recipes.understanding')}</h2>
            <blockquote className={css.quote}><Highlighted text={c.text} marks={c.focus ?? []} /></blockquote>
            {c.note && <p className={css.small}><b>{t('reconsult.noteLabel')}</b> {c.note}</p>}
            <p className={css.summary}>{c.reading === 'alternative' ? c.question : c.summary}</p>
            <p className={css.small}>{c.classifier === 'ai' ? t('consult.byAi') : t('consult.byRules') + (c.fallback ? t(`consult.fallback.${c.fallback}`) : '')}</p>
            <p className={css.small}>{t('coach.aiOnce')}</p>
          </>
        ) : plan.entry === 'CHART' && plan.chart ? (
          <>
            <h2 className={css.colHead}>{t('coach.fromChart')}</h2>
            <p className={css.summary}>{L(registry.charts[plan.chart].label)}</p>
            <p className={css.small}>{t('coach.chartFixed')}</p>
          </>
        ) : (
          <>
            <h2 className={css.colHead}>{t('coach.fromPurpose')}</h2>
            <p className={css.summary}>{plan.angles.map((a) => shortPurpose(L(registry.purposes[a.purpose].label))).join('・')}</p>
          </>
        )}
        <p className={css.small}>{t('coach.noAiAfter')}</p>
      </aside>

      <main className={css.center}>
        {clarify ? <Clarify plan={plan} setPlan={setPlan} /> : (
          <>
            {/* 1枚か Story か（相談から入って AI の読み取りがある時だけ）。Story のおすすめ・確認の間は、1枚の提案を出さない */}
            <ScopeCard plan={plan} setPlan={setPlan} />
            {!scopeBlocksOneSlide(plan) && <>
            {c?.alternative && <ReadingChoice plan={plan} setPlan={setPlan} />}
            {!plan.angles.length && (
              <div className={css.empty}><b>{t('unsupported.heading')}</b><p>{t('unsupported.body', { goal: c ? goalOf(c.classification.primary_goal) : '' })}</p></div>
            )}
            {plan.angles.map((a, i) => (
              <AngleCoach key={a.id} plan={plan} angle={a} index={i} setPlan={setPlan} />
            ))}
            {plan.angles.length > 0 && (
              <div className={css.acceptBar}>
                <button type="button" className={css.primaryBig} disabled={!ready} onClick={accept}>{t('coach.accept')}</button>
                <p className={css.small}>{ready ? t('coach.acceptNote') : t('coach.pickFirst')}</p>
                <ExtraData chosen={chosenRecipes(plan).map((x) => x.recipe)} />
              </div>
            )}
            {/* Advanced：別の問い（目的）の切り口を足す。もう1枚のスライドになる */}
            {plan.angles.length > 0 && (
              <details className={css.advanced} open={adding} onToggle={(e) => setAdding((e.target as HTMLDetailsElement).open)}>
                <summary>{t('coach.advanced')}</summary>
                <p className={css.small}>{t('coach.advancedNote')}</p>
                <div className={css.rechooseChips}>
                  {PURPOSE_IDS.filter(purposeHasRecipes).map((p) => (
                    <button key={p} type="button" className={css.option} onClick={() => { setPlan(addPurposeAngle(plan, p)); setAdding(false); }}>
                      <b>{shortPurpose(L(registry.purposes[p].label))}</b><small>{L(registry.purposes[p].question)}</small>
                    </button>
                  ))}
                </div>
              </details>
            )}
            </>}
            {c && onReconsult && <Reconsult plan={plan} onReconsult={onReconsult} onEdit={onEditConsultation} thinking={thinking} quota={quota} />}
            {c && <Feedback plan={plan} />}
            <Pending />
          </>
        )}
      </main>
    </div>
  );
}

/** 切り口1つ：重視点の1問 → Coach のおすすめ1つ → ほかの見せ方（折りたたみ） */
function AngleCoach({ plan, angle: a, index, setPlan }: { plan: Plan; angle: Angle; index: number; setPlan: SetPlan }) {
  const t = useT();
  const L = useL();
  const auth = useAuth();
  const [changing, setChanging] = useState(false);
  const rec = angleRecommendation(plan, a);
  const choices = emphasisChoices(plan, a);
  const showChips = !a.emphasis || a.emphasisSource === 'user' || changing;
  // 計測：質問を出した／Coach が推定した／おすすめを出した（同じ表示で何度も数えない）
  const sent = useRef<string>('');
  useEffect(() => {
    const key = `${a.id}:${a.emphasis}:${showChips}`;
    if (sent.current === key) return;
    sent.current = key;
    if (showChips && !a.emphasis) track('coach_emphasis_shown', { loggedIn: !!auth.session, detail: a.purpose });
    if (a.emphasisSource === 'inferred' && !changing) track('coach_emphasis_inferred', { loggedIn: !!auth.session, detail: a.emphasis ?? undefined });
    if (rec) track('coach_lead_shown', { loggedIn: !!auth.session, detail: rec.lead.recipe.toLowerCase() });
  }, [a.id, a.emphasis, a.emphasisSource, a.purpose, showChips, changing, rec, auth.session]);
  const choose = (e: (typeof choices)[number]) => {
    track('coach_emphasis_selected', { loggedIn: !!auth.session, detail: e });
    setPlan(setEmphasis(plan, a.id, e));
    setChanging(false);
  };
  const intent = intentOf(plan, a);
  const lead = rec ? registry.recipes[rec.lead.recipe] : null;
  return (
    <section className={css.angle} aria-labelledby={`q-${a.id}`}>
      <div className={css.angleHead}>
        <span className={css.tag} data-purpose={a.purpose}>{plan.angles.length > 1 ? `${index + 1}. ` : ''}{shortPurpose(L(registry.purposes[a.purpose].label))}</span>
        {plan.angles.length > 1 && <button type="button" className={css.linkBtn} onClick={() => setPlan(removeAngle(plan, a.id))}>{t('coach.removeAngle')}</button>}
      </div>
      {a.emphasisSource === 'inferred' && !changing ? (
        <div className={css.inferred}>
          <p id={`q-${a.id}`}>{t('coach.inferred', { name: L(EMPHASIS_LABEL[a.emphasis!]) })}</p>
          <button type="button" className={css.linkBtn} onClick={() => setChanging(true)}>{t('coach.changeEmphasis')}</button>
        </div>
      ) : (
        <>
          <h2 id={`q-${a.id}`} className={css.question}>{t('coach.question')}</h2>
          {showChips && (
            <div className={css.emphasisRow} role="radiogroup" aria-labelledby={`q-${a.id}`}>
              {choices.map((e) => (
                <button key={e} type="button" role="radio" aria-checked={a.emphasis === e} className={css.emphasis} onClick={() => choose(e)}>{L(EMPHASIS_LABEL[e])}</button>
              ))}
            </div>
          )}
        </>
      )}

      {rec?.ask ? (
        <AskCard plan={plan} angle={a} ask={rec.ask} setPlan={setPlan} />
      ) : rec && lead ? (
        <>
          <h3 className={css.coachHead}>{t('coach.recommendation')}</h3>
          {activeAnswers(plan, a).map((x) => (
            <p key={x.ask} className={css.small}>
              {L(ASKS[x.ask].question)} → <b>{L(ASKS[x.ask].options.find((o) => o.id === x.option)?.label ?? { ja: '', en: '' })}</b>{' '}
              <button type="button" className={css.linkBtn} onClick={() => setPlan(clearAsk(plan, a.id, x.ask))}>{t('coach.askChange')}</button>
            </p>
          ))}
          {rec.note && <p className={css.switchNote} role="note"><b className={css.coachBadge} aria-hidden="true">C</b>{L(rec.note)}</p>}
          <article className={css.leadCard}>
            <DishPreview proposal={rec.lead} className={css.thumbBig} />
            <div className={css.cardBody}>
              <h4 className={css.name}>{L(lead.name)}</h4>
              <dl className={css.changes} aria-label={t('coach.changes')}>
                {changeParts(rec.lead, intent.preferredChart).map((x, i) => <div key={i}><dt>{L(x.label)}</dt><dd>{L(x.value)}</dd></div>)}
              </dl>
              <p className={css.reason}>{L(lead.reason)}</p>
              <h5 className={css.okHead}>{t('coach.why')}</h5>
              <ul className={css.whyList}>{reasonLines(intent, rec.lead).map((x, i) => <li key={i}>{L(x)}</li>)}</ul>
              <h5 className={css.okHead}>{t('recipes.shows')}</h5>
              <ul className={css.coachShows}>{shows(rec.lead).map((x) => <li key={x}>{L(registry.aspects[x].label)}</li>)}</ul>
              <Needs recipe={lead} />
              {a.emphasis && <Examples dish={a.emphasis} recipe={rec.lead.recipe} />}
            </div>
          </article>
          {rec.alternatives.length > 0 && (
            <details className={css.altBox} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) track('coach_alternatives_opened', { loggedIn: !!auth.session, detail: rec.lead.recipe.toLowerCase() }); }}>
              <summary>{t('coach.others')}</summary>
              <p className={css.small}>{t('coach.othersNote')}</p>
              <div className={css.altGrid}>
                {rec.alternatives.map((x) => (
                  <div key={x.recipe + (x.tag ?? '')} className={css.altCard}>
                    {x.tag && <span className={css.altTag}>{t(x.tag === 'kept' ? 'coach.keptTag' : 'coach.conditionalTag')}</span>}
                    <DishPreview proposal={x} className={css.thumb} />
                    <b>{L(registry.recipes[x.recipe].name)}</b>
                    <small>{changeParts(x, intent.preferredChart).map((c) => `${L(c.label)}：${L(c.value)}`).join(' ／ ')}</small>
                    <small className={css.diff}>{t('coach.diff')}：{L(differenceText(rec.lead, x))}</small>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      ) : a.emphasis ? <p className={css.empty}>{t('recipes.none')}</p> : <p className={css.small}>{t('coach.pickHint')}</p>}
    </section>
  );
}

/** Library の見本（一度だけ読む。読めなければ出さない） */
let libraryOnce: Promise<LibraryItem[]> | null = null;

/** 「この料理の見本」：同じ伝えたいこと・同じチャートの見本が Library にあれば、件数と名前を出す（別のタブで開く） */
function Examples({ dish, recipe }: { dish: NonNullable<Angle['emphasis']>; recipe: Proposal['recipe'] }) {
  const t = useT();
  const auth = useAuth();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => {
    if (!auth.client) return;
    libraryOnce ??= listLibrary(auth.client).catch(() => { libraryOnce = null; return []; });
    let live = true;
    void libraryOnce.then((l) => { if (live) setItems(l.filter((x) => x.published)); });
    return () => { live = false; };
  }, [auth.client]);
  const chart = mainChartOf(recipe);
  if (!items || !chart) return null;
  const hit = examplesFor(items, dish, chart);
  if (!hit.length) return null;
  return (
    <div className={css.examples}>
      <h5 className={css.okHead}>{t('coach.examples', { n: hit.length })}</h5>
      <ul className={css.whyList}>{hit.slice(0, 3).map((x) => <li key={x.id}>{x.title}</li>)}</ul>
      <Link href={`/library?dish=${dish}&chart=${chart}`} target="_blank" rel="noopener" className={css.linkBtn}>{t('coach.examplesOpen')}</Link>
    </div>
  );
}

/** 実際に描いた小さなプレビュー（見本データ） */
function DishPreview({ proposal, className }: { proposal: Proposal; className?: string }) {
  const locale = useLocale();
  const svg = proposalSvg(proposal, locale);
  return svg ? <div className={`${className ?? ''} ${css.dishSvg}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className={className} aria-hidden="true" />;
}

/**
 * 一問だけの確認（中心の Question を判定できない時）。左右構成を自動で採用せず、2つの答えを、
 * それぞれの結果のプレビューと一緒に見せる。答えは切り口に残る（別の料理に変えても聞き直さない）
 */
function AskCard({ plan, angle: a, ask, setPlan }: { plan: Plan; angle: Angle; ask: AskId; setPlan: SetPlan }) {
  const t = useT();
  const L = useL();
  const def = ASKS[ask];
  return (
    <section className={css.askCard} aria-labelledby={`ask-${a.id}`}>
      <h3 className={css.coachHead}>{t('coach.askHead')}</h3>
      <p id={`ask-${a.id}`} className={css.askQ}><b className={css.coachBadge} aria-hidden="true">C</b>{L(def.question)}</p>
      <div className={css.askOptions}>
        {def.options.map((o) => {
          const next = answerAsk(plan, a.id, ask, o.id);
          const r = angleRecommendation(next, next.angles.find((x) => x.id === a.id)!);
          return (
            <button key={o.id} type="button" className={css.askOption} onClick={() => setPlan(next)}>
              {r && !r.ask && <DishPreview proposal={r.lead} className={css.thumb} />}
              <b>{L(o.label)}</b>
              <small>{L(o.note)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function shows(p: Proposal) {
  const s = new Set(recipeAspects(registry.recipes[p.recipe]).shows);
  (p.complements ?? []).forEach((c) => registry.complements[c].covers.forEach((x) => s.add(x)));
  return [...s];
}

function useL() {
  const locale = useLocale();
  return (x: LocalizedText) => localize(x, locale);
}

// ──────────── 相談から ────────────

/** 目的のコード → 短い目的名（推移・比較…） */
function useGoalLabel() {
  const L = useL();
  return (goal: string) => shortPurpose(L(registry.purposes[{ TREND: 'trend', COMPARISON: 'comparison', COMPOSITION: 'composition', CONTRIBUTION: 'contribution', RELATIONSHIP: 'relationship', EVALUATION: 'evaluate' }[goal] as 'trend'].label));
}

/** 相談文の中で、AI が重視した言葉に印を付ける */
function Highlighted({ text, marks }: { text: string; marks: string[] }) {
  if (!marks.length) return <>{text}</>;
  const esc = marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${esc.join('|')})`, 'g'));
  return <>{parts.map((p, i) => (marks.includes(p) ? <mark key={i} className={css.focusMark}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

function ReadingChoice({ plan, setPlan }: { plan: Plan; setPlan: SetPlan }) {
  const t = useT();
  const goalOf = useGoalLabel();
  const c = plan.consultation!;
  const now = c.reading ?? 'primary';
  const primary = c.primary ?? { classification: c.classification, question: c.question, focus: c.focus ?? [] };
  const opts = [
    { id: 'primary' as const, goal: primary.classification.primary_goal, question: primary.classification.business_question ?? primary.question, focus: primary.focus },
    { id: 'alternative' as const, goal: c.alternative!.classification.primary_goal, question: c.alternative!.question, focus: c.alternative!.focus },
  ];
  return (
    <section className={css.readingChoice} aria-labelledby="reading-head">
      <h2 id="reading-head" className={css.readingHead}>{t('reading.title')}</h2>
      <p className={css.small}>{t('reading.lead')}</p>
      <div className={css.readingOpts} role="radiogroup" aria-labelledby="reading-head">
        {opts.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={now === o.id} className={css.readingOpt} onClick={() => setPlan(switchReading(plan, o.id))}>
            <span className={css.readingTop}><span className={css.readingGoal}>{goalOf(o.goal)}</span>{now === o.id && <span className={css.readingNow}>{t('reading.now')}</span>}</span>
            <b>{o.question}</b>
            {o.focus.length > 0 && <small>{t('reading.basedOn')} {o.focus.map((f) => `「${f}」`).join(' ')}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * 「提案が意図と違う」：補足を書いて、AI にもう一度読み直してもらう（AI の相談1回として数える）。
 * 元の相談文はそのまま。補足は相談文より優先して読まれる
 */
function Reconsult({ plan, onReconsult, onEdit, thinking, quota }: { plan: Plan; onReconsult: Reconsult; onEdit?: Reconsult; thinking: boolean; quota: ConsultQuota | null }) {
  const t = useT();
  const auth = useAuth();
  // 開いている欄：補足／相談文の修正（どちらか1つ）
  const [mode, setMode] = useState<'note' | 'edit' | null>(null);
  const [note, setNote] = useState(plan.consultation?.note ?? '');
  const [failed, setFailed] = useState(false);
  // 相談文そのものを直す：最初の相談文が入った編集欄。出し直すと、直した文だけを新しい相談として AI に送る
  const original = plan.consultation?.text ?? '';
  const [text, setText] = useState(original);
  const [editFailed, setEditFailed] = useState(false);
  useEffect(() => { setText(original); setMode((m) => (m === 'edit' ? null : m)); setEditFailed(false); }, [original]);
  const noQuota = quota?.remaining === 0;
  if (!auth.session) return null;
  return (
    <section className={css.rechoose} aria-labelledby="reconsult-head">
      <div className={css.reconsultHead}>
        <h2 id="reconsult-head" className={css.reconsultTitle}>{t('reconsult.title')}</h2>
        <p className={css.small}>{t('reconsult.lead')}</p>
        <p className={css.small}>{t('reconsult.stay')}</p>
      </div>
      <div className={css.reconsultActions}>
        <button type="button" className={`${css.reconsultBtn} ${mode === 'note' ? css.reconsultBtnOn : ''}`} aria-expanded={mode === 'note'} aria-controls="reconsult-note-box" onClick={() => setMode(mode === 'note' ? null : 'note')}>
          {t('reconsult.open')}<span aria-hidden="true">{mode === 'note' ? '▴' : '▾'}</span>
        </button>
        {onEdit && (
          <button type="button" className={`${css.linkBtn} ${css.reconsultLink}`} aria-expanded={mode === 'edit'} aria-controls="reconsult-edit-box" onClick={() => { setText(original); setEditFailed(false); setMode(mode === 'edit' ? null : 'edit'); }}>{t('reconsult.editLink')}</button>
        )}
      </div>
      {mode === 'note' && (
        <div id="reconsult-note-box" className={css.reconsultBody}>
          <label htmlFor="reconsult-note" className={css.small}>{t('reconsult.label')}</label>
          <textarea id="reconsult-note" className={css.feedbackText} value={note} maxLength={CONSULT_NOTE_MAX_CHARS} placeholder={t('reconsult.placeholder')} onChange={(e) => setNote(e.target.value)} />
          <div className={css.clarifyFoot}>
            <button type="button" className={css.primary} disabled={!note.trim() || thinking || noQuota} aria-busy={thinking} onClick={async () => {
              setFailed(false);
              const ok = await onReconsult(note.trim());
              if (!ok) setFailed(true);
            }}>{thinking ? t('entry.ai.thinking') : t('reconsult.button')}</button>
            <small>{note.length} / {CONSULT_NOTE_MAX_CHARS}</small>
          </div>
          {failed && <p className={css.small} role="alert">{t('reconsult.failed')}</p>}
          <p className={css.small}>{t('reconsult.cost')}</p>
        </div>
      )}
      {mode === 'edit' && onEdit && (
        <div id="reconsult-edit-box" className={css.reconsultBody}>
          <label htmlFor="reconsult-text" className={css.small}>{t('reconsult.editLabel')}</label>
          <textarea id="reconsult-text" className={css.feedbackText} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <div className={css.clarifyFoot}>
            <button type="button" className={css.primary} disabled={!text.trim() || text.trim() === original.trim() || text.length > CONSULT_MAX_CHARS || thinking || noQuota} aria-busy={thinking} onClick={async () => {
              setEditFailed(false);
              const ok = await onEdit(text.trim());
              if (!ok) setEditFailed(true);
            }}>{thinking ? t('entry.ai.thinking') : t('reconsult.editButton')}</button>
            <button type="button" className={css.linkBtn} disabled={thinking} onClick={() => { setMode(null); setText(original); setEditFailed(false); }}>{t('save.cancel')}</button>
            <small>{text.length} / {CONSULT_MAX_CHARS}</small>
          </div>
          {editFailed && <p className={css.small} role="alert">{t('reconsult.editFailed')}</p>}
          <p className={css.small}>{t('reconsult.editCost')}</p>
        </div>
      )}
      {mode && quota && <QuotaLine quota={quota} className={css.small} />}
    </section>
  );
}

/**
 * 「どれも違う？」：相談をやり直さずに、見せたいこと（目的）から切り口を選び直す。AI は使わない（回数を消費しない）
 */
function Feedback({ plan }: { plan: Plan }) {
  const t = useT();
  const auth = useAuth();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const c = plan.consultation;
  const send = async (r: 'up' | 'down') => {
    if (!auth.client || !auth.session) return;
    setStatus('sending');
    try {
      await sendFeedback(auth.client, {
        entryMode: plan.entry, consultationText: c?.text, classification: c?.classification,
        recommended: recommendationState(plan).recommended_recipe_ids, chosen: chosenRecipes(plan).map((x) => x.recipe.id),
        rating: r, reasons: r === 'down' ? reasons : [], comment, classifier: c?.classifier,
      });
      setStatus('sent');
    } catch { setStatus('error'); }
  };
  if (status === 'sent') return <p className={css.feedbackDone}>{t('feedback.thanks')}</p>;
  const loggedIn = !!auth.session;
  return (
    <section className={css.feedback} aria-label={t('feedback.question')}>
      <div className={css.feedbackRow}>
        <span>{t('feedback.question')}</span>
        <button type="button" className={css.fbBtn} aria-pressed={rating === 'up'} disabled={!loggedIn || status === 'sending'} onClick={() => { setRating('up'); void send('up'); }}>👍 {t('feedback.up')}</button>
        <button type="button" className={css.fbBtn} aria-pressed={rating === 'down'} disabled={!loggedIn} onClick={() => setRating('down')}>👎 {t('feedback.down')}</button>
        {!loggedIn && <small>{t('feedback.needLogin')}</small>}
      </div>
      {loggedIn && <p className={css.small}>{t('feedback.privacy')}</p>}
      {rating === 'down' && (
        <div className={css.feedbackBody}>
          <div className={css.rechooseChips} role="group" aria-label={t('feedback.reasonsLabel')}>
            {FEEDBACK_REASONS.map((k) => {
              const on = reasons.includes(k);
              return (
                <button key={k} type="button" className={css.chip} aria-pressed={on} onClick={() => {
                  setReasons((x) => (on ? x.filter((y) => y !== k) : [...x, k]));
                }}>{on ? '✓ ' : ''}{t(`feedback.reason.${k}` as MessageKey)}</button>
              );
            })}
          </div>
          <label className={css.small} htmlFor="fb-comment">{t('feedback.commentLabel')}</label>
          <textarea id="fb-comment" className={css.feedbackText} value={comment} maxLength={2000} placeholder={t('feedback.commentPlaceholder')} onChange={(e) => setComment(e.target.value)} />
          <div className={css.clarifyFoot}>
            <button type="button" className={css.primary} disabled={status === 'sending'} onClick={() => void send('down')}>{t('feedback.send')}</button>
            {status === 'error' && <small role="alert">{t('feedback.error')}</small>}
          </div>
        </div>
      )}
    </section>
  );
}

/** 確認：相談文だけでは決められない時、決まった質問と選択肢で聞く（AI は使わない） */
function Clarify({ plan, setPlan }: { plan: Plan; setPlan: SetPlan }) {
  const t = useT();
  const L = useL();
  const missing = plan.consultation!.classification.missing_info;
  const [answers, setAnswers] = useState<Partial<Record<MissingInfo, number>>>({});
  const notes = missing.map((id) => (answers[id] == null ? null : CLARIFY_QUESTIONS[id].options[answers[id]!]?.note)).filter(Boolean);
  return (
    <section className={css.clarify} aria-labelledby="clarify-head">
      <div className={css.centerHead}>
        <h2 id="clarify-head" className={css.colHead}>{t('clarify.heading')}</h2>
        <p>{t('clarify.lead')}</p>
      </div>
      {missing.map((id) => {
        const q = CLARIFY_QUESTIONS[id];
        return (
          <fieldset key={id} className={css.clarifyQ}>
            <legend>{L(q.text)}</legend>
            <div className={css.clarifyOpts}>
              {q.options.map((o, i) => (
                <button key={i} type="button" className={css.option} aria-pressed={answers[id] === i} onClick={() => setAnswers((a) => ({ ...a, [id]: i }))}>
                  <b>{answers[id] === i ? '✓ ' : ''}{L(o.label)}</b>
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      {notes.map((n, i) => <p key={i} className={css.small}>{L(n!)}</p>)}
      <div className={css.clarifyFoot}>
        <button type="button" className={css.primary} disabled={!missing.every((id) => answers[id] != null)} onClick={() => setPlan(answerClarify(plan, answers))}>{t('clarify.submit')}</button>
        <button type="button" className={css.secondary} onClick={() => setPlan(answerClarify(plan, answers))}>{t('clarify.skip')}</button>
      </div>
    </section>
  );
}

function Needs({ recipe }: { recipe: RecipeDef }) {
  const t = useT();
  const needs = needsText(t, recipe, recipe.schema);
  const derived = recipe.derived.map((d) => t(`derived.${d}` as MessageKey)).join('・');
  return (
    <p className={css.needs}>
      {t('recipes.needs')}：<b>{needs}</b>
      {derived && <>　／　{t('recipes.derived')}：<b>{derived}</b></>}
    </p>
  );
}

function Pending() {
  const t = useT();
  const n = pendingRecipeCount();
  return n > 0 ? <p className={css.small}>{t('recipes.pending', { n })}</p> : null;
}

// ──────────── 目的・チャートから ────────────

function ExtraData({ chosen }: { chosen: RecipeDef[] }) {
  const t = useT();
  const L = useL();
  const items = chosen.flatMap((r) => (r.optional ?? []).filter((o) => o.requiresFields?.length).map((o) => ({ r, o })));
  if (!items.length) return null;
  return (
    <div className={css.extra}>
      <h3 className={css.subHead}>{t('recipes.extraHead')}</h3>
      {items.map(({ r, o }) => (
        <p key={`${r.id}-${o.complement}`} className={css.small}>
          {t('recipes.extraAsk', { name: L(registry.complements[o.complement].label), fields: o.requiresFields!.map((f) => L(f.label)).join('、') })}
        </p>
      ))}
    </div>
  );
}

