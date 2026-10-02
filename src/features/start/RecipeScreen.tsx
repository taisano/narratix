'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import {
  localize, recipeAspects, registry,
  type AspectId, type LocalizedText, type RecipeDef,
} from '@/registry';
import { CLARIFY_QUESTIONS } from '@/lib/advisor/clarify';
import { FEEDBACK_REASONS, sendFeedback, type FeedbackReason } from '@/lib/repo/feedback';
import { useAuth } from '../shell/AppShell';
import type { MissingInfo } from '@/registry';
import {
  activeAnswers, angleRecommendation, answerAsk, answerClarify, clearAsk, chosenRecipes, emphasisChoices, intentOf, pendingRecipeCount, planReady,
  recommendationState, removeAngle, selectedProposal, setEmphasis, setPresentation, type Angle, type Plan,
} from './plan';
import { EMPHASIS_LABEL, differenceText, reasonLines, type Proposal } from './coach';
import { CONSULT_MAX_CHARS, CONSULT_NOTE_MAX_CHARS } from '@/lib/ai/consult';
import type { ConsultQuota } from '@/lib/repo/quota';
import { needsText } from '../shared/needs';
import { ASKS, type AskId } from './dishes';
import { chartParts, proposalSvg } from './dishView';
import { examplesFor, mainChartOf } from './dishTag';
import { listLibrary, type LibraryItem } from '@/lib/repo/library';
import Link from 'next/link';
import { QuotaLine, shortPurpose } from './StartFlow';
import { track } from '@/lib/ab/track';
import { AUTO_HIGHLIGHT } from '../editor/fromRecipe';
import { KEEP_CHOSEN } from './dishes';
import { useConfirm } from '../shared/Confirm';
import { ScopeCard, StoryAside, StoryCoachLeft, canSwitchToStory, draftOf, expandToStory, scopeBlocksOneSlide, scopeOf, storyAllowedNow } from '../story/ScopeCard';
import { unifiable } from '../story/scope';
import { oneSlideCandidates } from '../story/oneSlide';
import { questionSet, selectQuestion, type QuestionSet } from './questions';
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
  const auth = useAuth();
  const c = plan.consultation;
  const clarify = c?.classification.expected_action === 'CLARIFY';
  const ready = planReady(plan);
  const goalOf = useGoalLabel();
  const [info, setInfo] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  // 画面を開いた時刻（編集を始めるまでの秒数を数える）
  const opened = useRef(Date.now());
  // Story のおすすめの時は3列：左＝相談の理解、真ん中＝想定される質問と流れ（見る・整える）、右＝決める（始める・出し直す）
  const storyMode = !clarify && !!c?.story && scopeOf(plan).scope === 'STORY_FLOW';
  // 相談から入った時は、1枚の時も3列（右＝現在の選択と開始）。目的・チャートから入った時は2列
  // 相談から・チャートから入った時は3列（右＝現在の選択と開始。中央をスクロールしても押せる）。目的から入った時は2列
  const threeCol = !clarify && (!!c || plan.entry === 'CHART');
  const reconsult = c && onReconsult ? <Reconsult plan={plan} onReconsult={onReconsult} onEdit={onEditConsultation} thinking={thinking} quota={quota} /> : null;
  // 番号：相談から入った時は ① 問い ② 切り口 ③ 形。目的・チャートからは ① 切り口 ② 形
  const qs = questionSet(plan);
  const qStep = c && qs.kind !== 'none' ? 1 : 0;
  const start = () => {
    if (starting || !ready) return;
    setStarting(true);
    track('coach_lead_accepted', { loggedIn: !!auth.session, detail: chosenRecipes(plan).map((x) => x.recipe.id.toLowerCase()).join(',').slice(0, 80) });
    track('one_started', { loggedIn: !!auth.session, detail: `${Math.round((Date.now() - opened.current) / 1000)}s` });
    onNext();
  };
  const cta = (
    <div className={css.oneDecide}>
      <SelectionSummary plan={plan} />
      <button type="button" className={css.primaryBig} disabled={!ready || starting} aria-busy={starting} aria-describedby={!ready ? 'start-why' : undefined} onClick={start}>{t('one.start')}</button>
      {!ready && <p id="start-why" className={css.small}>{t('one.startWhy')}</p>}
      {plan.angles.length > 0 && <ExtraData chosen={chosenRecipes(plan).map((x) => x.recipe)} />}
      <ProUpsell plan={plan} />
      {c && canSwitchToStory(plan) && (
        <button type="button" className={css.oneSecondary} onClick={() => setPlan(expandToStory(plan))}>{t('scope.toStory')}</button>
      )}
    </div>
  );
  return (
    <div className={threeCol ? `${css.coachWork} ${css.coachWork3}` : css.coachWork}>
      <aside className={css.left}>
        {c ? (
          <>
            <div className={css.colHeadRow}>
              <h2 className={css.colHead}>{t('recipes.understanding')}</h2>
              <button type="button" className={css.infoBtn} aria-expanded={info} aria-controls="consult-info" aria-label={t('consult.infoLabel')} onClick={() => setInfo(!info)}>i</button>
            </div>
            {info && (
              <div id="consult-info" className={css.infoBox}>
                <p className={css.small}>{c.classifier === 'ai' ? t('consult.byAi') : t('consult.byRules')}</p>
                <p className={css.small}>{t('coach.aiOnce')}</p>
                <p className={css.small}>{t('coach.noAiAfter')}</p>
              </div>
            )}
            <blockquote className={css.quote}><Highlighted text={c.text} marks={c.focus ?? []} /></blockquote>
            {c.note && <p className={css.small}><b>{t('reconsult.noteLabel')}</b> {c.note}</p>}
            {/* 決めたいこと（Story 用の読み取りがあればそれ、無ければ1枚用の要約） */}
            {c.story?.decisionQuestion
              ? <p className={css.summary}><span className={css.summaryLabel}>{t('scope.decisionLabel')}</span>{c.story.decisionQuestion}</p>
              : <p className={css.summary}><span className={css.summaryLabel}>{t('scope.decisionLabel')}</span>{c.summary}</p>}
            {/* ルール版に戻った時は、その理由だけは出したままにする */}
            {c.classifier !== 'ai' && c.fallback && <p className={css.small}>{t('consult.byRules') + t(`consult.fallback.${c.fallback}`)}</p>}
            {storyMode && <StoryCoachLeft plan={plan} />}
            {/* AI に相談し直す（通常の選択とは分ける。実行の前に回数を確認する） */}
            {!storyMode && reconsult && auth.session && (
              <div className={css.editConsult}>
                <button type="button" className={css.linkBtn} aria-expanded={editOpen} aria-controls="consult-edit" onClick={() => setEditOpen((o) => !o)}>{t('one.editConsult')}</button>
                {editOpen && <div id="consult-edit">{reconsult}</div>}
              </div>
            )}
          </>
        ) : plan.entry === 'CHART' && plan.chart ? (
          <>
            <h2 className={css.colHead}>{t('coach.fromChart')}</h2>
            <p className={css.summary}>{useLabel(registry.charts[plan.chart].label)}</p>
            <p className={css.small}>{t(KEEP_CHOSEN.has(plan.chart) ? 'coach.chartKept' : 'coach.chartFixed')}</p>
          </>
        ) : (
          <>
            <h2 className={css.colHead}>{t('coach.fromPurpose')}</h2>
            <PurposeNames plan={plan} />
          </>
        )}
        {!c && <p className={css.small}>{t('coach.noAiAfter')}</p>}
      </aside>

      <main className={css.center}>
        {clarify ? <Clarify plan={plan} setPlan={setPlan} /> : (
          <>
            {/* Story のおすすめ・確認の間は、1枚の選択を出さない */}
            <ScopeCard plan={plan} setPlan={setPlan} />
            {plan.modeNote === 'storyNeedsAi' && <p className={css.switchNote} role="note">{t('scope.storyNeedsAi')}</p>}
            {!scopeBlocksOneSlide(plan) && <>
              {!plan.angles.length && c && <QuestionSection plan={plan} setPlan={setPlan} set={qs} />}
              {!plan.angles.length && (
                <div className={css.empty}><b>{t('unsupported.heading')}</b><p>{t('unsupported.body', { goal: c ? goalOf(c.classification.primary_goal) : '' })}</p></div>
              )}
              {plan.angles.length === 1 ? (
                <>
                  {/* ① 問いと ② 伝えたいことは、③ をスクロールしても上に見えたままにする（広い画面） */}
                  <div className={css.stickyPicks}>
                    {c && <QuestionSection plan={plan} setPlan={setPlan} set={qs} />}
                    <AngleCoach plan={plan} angle={plan.angles[0]!} index={0} setPlan={setPlan} step={qStep} part="emphasis" />
                  </div>
                  <AngleCoach plan={plan} angle={plan.angles[0]!} index={0} setPlan={setPlan} step={qStep} part="presentation" />
                </>
              ) : (
                <>
                  {c && <QuestionSection plan={plan} setPlan={setPlan} set={qs} />}
                  {plan.angles.map((a, i) => (
                    <AngleCoach key={a.id} plan={plan} angle={a} index={i} setPlan={setPlan} step={qStep} />
                  ))}
                </>
              )}
              {!threeCol && plan.angles.length > 0 && <div className={css.acceptBar}>{cta}</div>}
            </>}
            {c && !threeCol && <Feedback plan={plan} />}
            <Pending />
          </>
        )}
      </main>
      {threeCol && (
        <aside className={css.right} aria-label={t('scope.asideLabel')}>
          {storyMode ? <StoryAside plan={plan} setPlan={setPlan}>{reconsult}<Feedback plan={plan} /></StoryAside>
            : (
              <div className={css.oneAside}>
                {plan.angles.length > 0 && <div className={css.stickyCta}>{cta}</div>}
                <Feedback plan={plan} />
              </div>
            )}
        </aside>
      )}
      {/* スマホ：作り始めるボタンを画面の下に固定する（内容に重ならないよう、下に余白を取る） */}
      {!clarify && !storyMode && plan.angles.length > 0 && (
        <div className={css.mobileCta}>
          <button type="button" className={css.primaryBig} disabled={!ready || starting} onClick={start}>{t('one.start')}</button>
        </div>
      )}
    </div>
  );
}

const useLabel = (x: LocalizedText) => localize(x, useLocale());
function PurposeNames({ plan }: { plan: Plan }) {
  const L = useL();
  return <p className={css.summary}>{plan.angles.map((a) => shortPurpose(L(registry.purposes[a.purpose].label))).join('・')}</p>;
}

/** 番号付きの見出し（① ② ③） */
const NUM = ['①', '②', '③', '④'];

/** ① この1枚で答える問いを選ぶ（選ぶ場所はここ1つ。AI は使わない） */
function QuestionSection({ plan, setPlan, set }: { plan: Plan; setPlan: SetPlan; set: QuestionSet }) {
  const t = useT();
  const L = useL();
  const auth = useAuth();
  if (set.kind === 'none') return null;
  if (set.kind === 'single') {
    return (
      <section className={css.step} aria-labelledby="step-q">
        <h2 id="step-q" className={css.stepHead}>{NUM[0]} {t('one.qHead')}</h2>
        <p className={css.qSingle}>{set.question}</p>
      </section>
    );
  }
  return (
    <section className={css.step} aria-labelledby="step-q">
      <h2 id="step-q" className={css.stepHead}>{NUM[0]} {t('one.qHead')}</h2>
      <p className={css.coachLine}><span className={css.coachLabel}>{t('one.coach')}</span>{t('one.qLead')}</p>
      <div className={css.qGrid} role="radiogroup" aria-labelledby="step-q">
        {set.options.map((o) => {
          const on = set.selected === o.id;
          const rec = set.recommended === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} className={css.qCard}
              onClick={() => { if (on) return; track('one_question_selected', { loggedIn: !!auth.session, detail: rec ? 'recommended' : 'other' }); setPlan(selectQuestion(plan, o.id)); }}>
              <span className={css.cardTop}>
                {rec && <span className={css.recBadge}>{t('one.recommended')}</span>}
                {on && <span className={css.selBadge}><span aria-hidden="true">✓</span> {t('one.selected')}</span>}
              </span>
              <b className={css.qText}>{o.question}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 右：現在の選択（中央の操作に合わせてすぐ変わる） */
function SelectionSummary({ plan }: { plan: Plan }) {
  const t = useT();
  const L = useL();
  const set = questionSet(plan);
  const q = set.kind === 'single' ? set.question : set.kind === 'story' || set.kind === 'reading' ? set.options.find((o) => o.id === set.selected)?.question : null;
  const a = plan.angles[0];
  const pick = a ? selectedProposal(plan, a) : null;
  // チャートから入った時は、使うメインチャートと補完・調整も出す（別案を選んだ時だけメインチャートが替わる）
  const parts = plan.entry === 'CHART' && pick ? chartParts(pick, null) : null;
  const adjust = plan.entry === 'CHART' && pick ? adjustText(pick, t) : null;
  const extra = [parts?.extras ? L(parts.extras) : null, adjust].filter(Boolean).join('／');
  const rows: [string, string | null][] = [
    ...(plan.consultation && q ? [[t('one.sumQ'), q] as [string, string]] : []),
    [t('one.sumE'), a?.emphasis ? L(EMPHASIS_LABEL[a.emphasis]) : null],
    [t('one.sumP'), pick ? L(pick.name ?? registry.recipes[pick.recipe].name) : null],
    ...(parts ? [[t('one.sumMain'), L(parts.main)] as [string, string]] : []),
    ...(parts && extra ? [[t('one.sumExtra'), extra] as [string, string]] : []),
  ];
  return (
    <div className={css.summaryBox}>
      <h2 className={css.sumHead}>{t('one.sumHead')}</h2>
      <dl className={css.sumList} aria-live="polite">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? <span className={css.sumNone}>{t('one.sumNone')}</span>}</dd></div>)}
      </dl>
    </div>
  );
}

/** ② 最も強く伝えたいこと → ③ スライドの形（どちらもその場で選ぶ。AI は使わない） */
function AngleCoach({ plan, angle: a, index, setPlan, step, part = 'both' }: { plan: Plan; angle: Angle; index: number; setPlan: SetPlan; step: number; part?: 'emphasis' | 'presentation' | 'both' }) {
  const t = useT();
  const L = useL();
  const auth = useAuth();
  const rec = angleRecommendation(plan, a);
  const choices = emphasisChoices(plan, a);
  // 計測：おすすめを出した（同じ表示で何度も数えない）
  const sent = useRef<string>('');
  useEffect(() => {
    const key = `${a.id}:${a.emphasis}`;
    if (part === 'presentation' || sent.current === key) return;
    sent.current = key;
    if (!a.emphasis) track('coach_emphasis_shown', { loggedIn: !!auth.session, detail: a.purpose });
    if (rec && !rec.ask) track('coach_lead_shown', { loggedIn: !!auth.session, detail: rec.lead.recipe.toLowerCase() });
  }, [a.id, a.emphasis, a.purpose, rec, auth.session, part]);
  const choose = (e: (typeof choices)[number]) => {
    if (a.emphasis === e) return;
    track('coach_emphasis_selected', { loggedIn: !!auth.session, detail: `${e}:${e === a.coachEmphasis ? 'recommended' : 'other'}` });
    setPlan(setEmphasis(plan, a.id, e));
  };
  const intent = intentOf(plan, a);
  const pick = selectedProposal(plan, a);
  const multi = plan.angles.length > 1;
  const eNum = NUM[step]!, pNum = NUM[step + 1]!;
  return (
    <>
      {part !== 'presentation' && <section className={css.step} aria-labelledby={`q-${a.id}`}>
        <div className={css.angleHead}>
          <h2 id={`q-${a.id}`} className={css.stepHead}>{eNum} {t('one.eHead')}{multi ? `（${shortPurpose(L(registry.purposes[a.purpose].label))}）` : ''}</h2>
          {multi && <button type="button" className={css.linkBtn} onClick={() => setPlan(removeAngle(plan, a.id))}>{t('coach.removeAngle')}</button>}
        </div>
        <div className={css.emphasisRow} role="radiogroup" aria-labelledby={`q-${a.id}`}>
          {choices.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={a.emphasis === e} className={css.emphasis} onClick={() => choose(e)}>
              <span className={css.emLabel}>{a.emphasis === e && <span aria-hidden="true">✓ </span>}{L(EMPHASIS_LABEL[e])}</span>
              {a.coachEmphasis === e && <span className={css.recBadgeSm}>{t('one.recommended')}</span>}
            </button>
          ))}
        </div>
        {!a.emphasis && <p className={css.small}>{t('coach.pickHint')}</p>}
      </section>}

      {part !== 'emphasis' && a.emphasis && (
        <section className={css.step} aria-labelledby={`p-${a.id}`}>
          <h2 id={`p-${a.id}`} className={css.stepHead}>{pNum} {t('one.pHead')}</h2>
          {rec?.ask ? (
            <AskCard plan={plan} angle={a} ask={rec.ask} setPlan={setPlan} />
          ) : rec ? (
            <>
              {activeAnswers(plan, a).map((x) => (
                <p key={x.ask} className={css.small}>
                  {L(ASKS[x.ask].question)} → <b>{L(ASKS[x.ask].options.find((o) => o.id === x.option)?.label ?? { ja: '', en: '' })}</b>{' '}
                  <button type="button" className={css.linkBtn} onClick={() => setPlan(clearAsk(plan, a.id, x.ask))}>{t('coach.askChange')}</button>
                </p>
              ))}
              {rec.note && <p className={css.switchNote} role="note"><span className={css.coachLabel}>{t('one.coach')}</span>{L(rec.note)}</p>}
              {rec.chosenCount != null && plan.chart ? (
                // チャートから入った時：選んだチャートで作る案（先頭が既定選択）→ Coach からの別案（自動で替えない）
                <div role="radiogroup" aria-labelledby={`p-${a.id}`} className={css.pList}>
                  <p className={css.groupHead}>{t('one.chosenGroup', { chart: L(registry.charts[plan.chart].label) })}</p>
                  <PresentationCard proposal={rec.lead} lead={rec.lead} big selected={pick?.recipe === rec.lead.recipe} intent={intent} emphasis={a.emphasis!}
                    badge={rec.fits ? t('one.fits') : undefined} keepChart
                    onSelect={() => { track('one_presentation_selected', { loggedIn: !!auth.session, detail: 'chosen' }); setPlan(setPresentation(plan, a.id, rec.lead.recipe)); }} />
                  {rec.chosenCount > 1 && (
                    <div className={css.pGrid}>
                      {rec.alternatives.slice(0, rec.chosenCount - 1).map((x) => (
                        <PresentationCard key={x.recipe} proposal={x} lead={rec.lead} selected={pick?.recipe === x.recipe} intent={intent} emphasis={a.emphasis!} keepChart
                          onSelect={() => { track('one_presentation_selected', { loggedIn: !!auth.session, detail: `chosen:${x.recipe.toLowerCase()}` }); setPlan(setPresentation(plan, a.id, x.recipe)); }} />
                      ))}
                    </div>
                  )}
                  {rec.alternatives.length > rec.chosenCount - 1 && (
                    <div className={css.coachGroup}>
                      <p className={css.groupHead}>{t('one.coachGroup')}</p>
                      {rec.advice && <p className={css.coachLine}><span className={css.coachLabel}>{t('one.coach')}</span>{L(rec.advice)}</p>}
                      <div className={css.pGrid}>
                        {rec.alternatives.slice(rec.chosenCount - 1).map((x) => (
                          <PresentationCard key={x.recipe} proposal={x} lead={rec.lead} selected={pick?.recipe === x.recipe} intent={intent} emphasis={a.emphasis!} keepChart
                            badge={t('one.coachAdvice')} diff={{ label: t('one.diffFrom', { chart: L(registry.charts[plan.chart!].label) }), text: rec.diff ?? differenceText(rec.lead, x) }}
                            onSelect={() => { track('one_presentation_selected', { loggedIn: !!auth.session, detail: `coach:${x.recipe.toLowerCase()}` }); setPlan(setPresentation(plan, a.id, x.recipe)); }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <div role="radiogroup" aria-labelledby={`p-${a.id}`} className={css.pList}>
                <PresentationCard proposal={rec.lead} lead={rec.lead} big recommended selected={pick?.recipe === rec.lead.recipe} intent={intent} emphasis={a.emphasis!}
                  onSelect={() => { track('one_presentation_selected', { loggedIn: !!auth.session, detail: 'recommended' }); setPlan(setPresentation(plan, a.id, rec.lead.recipe)); }} />
                {rec.alternatives.length > 0 && (
                  <div className={css.pGrid}>
                    {rec.alternatives.map((x) => (
                      <PresentationCard key={x.recipe} proposal={x} lead={rec.lead} selected={pick?.recipe === x.recipe} intent={intent} emphasis={a.emphasis!}
                        diff={{ label: t('coach.diff'), text: differenceText(rec.lead, x) }}
                        onSelect={() => { track('one_presentation_selected', { loggedIn: !!auth.session, detail: x.recipe.toLowerCase() }); setPlan(setPresentation(plan, a.id, x.recipe)); }} />
                    ))}
                  </div>
                )}
              </div>
              )}
            </>
          ) : <p className={css.empty}>{t('recipes.none')}</p>}
        </section>
      )}
      {part === 'both' && index < plan.angles.length - 1 && <hr className={css.angleSep} />}
    </>
  );
}

/** 見せられる内容のタグ（アイコン＋短い文字） */
const ASPECT_ICON: Record<string, string> = {
  trend: 'line', time_change: 'line', growth: 'line', overall: 'line',
  size: 'bar', level: 'bar', rank: 'bar', rank_change: 'bar', benchmark: 'bar',
  mix: 'pie', mix_change: 'pie',
  difference: 'diff', net_change: 'diff', contribution: 'diff',
  correlation: 'dot', position: 'dot',
};
function AspectTag({ id }: { id: AspectId }) {
  const L = useL();
  const k = ASPECT_ICON[id] ?? 'text';
  const path = {
    line: <path d="M2 12 6 7l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    bar: <><rect x="2" y="8" width="3" height="6" rx=".5" fill="currentColor" /><rect x="6.5" y="4" width="3" height="10" rx=".5" fill="currentColor" /><rect x="11" y="6" width="3" height="8" rx=".5" fill="currentColor" /></>,
    pie: <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
    diff: <><path d="M3 11h4M5 9v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M9 5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
    dot: <><circle cx="4" cy="11" r="1.6" fill="currentColor" /><circle cx="8" cy="7" r="1.6" fill="currentColor" /><circle cx="12" cy="4" r="1.6" fill="currentColor" /></>,
    text: <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  }[k];
  return <li className={css.aspectTag}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{path}</svg>{L(registry.aspects[id].label)}</li>;
}

/** ③ のスライドの形のカード。おすすめは大きなプレビューを主役に、ほかの形は同じ並びで小さく。どれもその場で選べる */
function PresentationCard({ proposal: p, lead, big = false, recommended = false, selected, intent, emphasis, onSelect, badge, diff, keepChart = false }: {
  proposal: Proposal; lead: Proposal; big?: boolean; recommended?: boolean; selected: boolean; intent: ReturnType<typeof intentOf>; emphasis: NonNullable<Angle['emphasis']>; onSelect: () => void;
  /** Coach おすすめの代わりに付ける印（「この目的に適しています」「Coachからの助言」） */
  badge?: string;
  /** 「おすすめとの違い｜」「Mekkoとの違い｜」 */
  diff?: { label: string; text: LocalizedText };
  /** チャートから入った時（選んだチャートを替えたように見せる「A → B」を出さない） */
  keepChart?: boolean;
}) {
  const t = useT();
  const L = useL();
  const r = registry.recipes[p.recipe];
  const parts = chartParts(p, keepChart ? null : intent.preferredChart);
  const adjust = adjustText(p, t);
  return (
    <div role="radio" aria-checked={selected} tabIndex={0} className={big ? css.pCardBig : css.pCard}
      onClick={onSelect} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}>
      <div className={css.pHead}>
        <h3 className={css.pName}>{L(p.name ?? r.name)}</h3>
        <div className={css.pBadges}>
          {selected && <span className={css.selBadge}><span aria-hidden="true">✓</span> {t('one.selected')}</span>}
          {recommended && <span className={css.recBadge}>{t('one.recommended')}</span>}
          {badge && <span className={css.recBadge}>{badge}</span>}
          <ul className={css.aspectTags} aria-label={t('one.shows')}>{shows(p).slice(0, 4).map((x) => <AspectTag key={x} id={x} />)}</ul>
        </div>
      </div>
      <DishPreview proposal={p} className={big ? css.previewBig : css.preview} />
      <div className={css.pParts}>
        <p><span>{t('one.mainChart')}｜</span><b>{L(parts.main)}</b></p>
        {parts.extras && <p><span>{t('one.extras')}｜</span><b>{L(parts.extras)}</b></p>}
        {adjust && <p><span>{t('one.adjust')}｜</span><b>{adjust}</b></p>}
        {diff && <p><span>{diff.label}｜</span><b>{L(diff.text)}</b></p>}
      </div>
      {big && (
        <>
          <h4 className={css.okHead}>{t('one.desc')}</h4>
          <p className={css.reason}>{L(r.reason)}</p>
          {recommended && (
            <>
              <h4 className={css.okHead}>{t('coach.why')}</h4>
              <ul className={css.whyList}>{reasonLines(intent, p).map((x, i) => <li key={i}>{L(x)}</li>)}</ul>
            </>
          )}
        </>
      )}
      <Needs recipe={r} />
      {big && <Examples dish={emphasis} recipe={p.recipe} />}
    </div>
  );
}

/** 調整：強調する項目（初期は計算で決めた項目。編集画面で選び直せる） */
function adjustText(p: Proposal, t: ReturnType<typeof useT>): string | null {
  const h = p.controls?.highlight;
  if (typeof h !== 'string' || !h) return null;
  return h === AUTO_HIGHLIGHT ? t('one.adjustAuto') : t('one.adjustItem', { item: h });
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

/**
 * 「提案が意図と違う」：補足を書いて、AI にもう一度読み直してもらう（AI の相談1回として数える）。
 * 元の相談文はそのまま。補足は相談文より優先して読まれる
 */
function Reconsult({ plan, onReconsult, onEdit, thinking, quota }: { plan: Plan; onReconsult: Reconsult; onEdit?: Reconsult; thinking: boolean; quota: ConsultQuota | null }) {
  const t = useT();
  const auth = useAuth();
  const confirm = useConfirm();
  /** AI を使う直前に、回数を使うことを確かめる（取り消せば何も変えない） */
  const okToRun = async (kind: 'note' | 'edit') => {
    track('reconsult_confirm', { loggedIn: !!auth.session, detail: `${kind}:opened` });
    const left = quota?.remaining;
    const body = [t('reconsult.confirmBody'), ...(quota?.limit != null && left != null ? [t('reconsult.confirmLeft', { now: left, after: Math.max(0, left - 1) })] : [])].join('\n');
    const ok = await confirm({ title: t('reconsult.confirmTitle'), body, ok: t('reconsult.confirmOk') });
    track('reconsult_confirm', { loggedIn: !!auth.session, detail: `${kind}:${ok ? 'ok' : 'cancel'}:${quota?.limit != null ? 'limited' : 'unlimited'}` });
    return ok;
  };
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
              if (!(await okToRun('note'))) return;
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
              if (!(await okToRun('edit'))) return;
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
  const [info, setInfo] = useState(false);
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
        {loggedIn && <button type="button" className={css.infoBtn} aria-expanded={info} aria-controls="feedback-info" aria-label={t('feedback.infoLabel')} onClick={() => setInfo(!info)}>i</button>}
        {!loggedIn && <small>{t('feedback.needLogin')}</small>}
      </div>
      {loggedIn && info && <p id="feedback-info" className={css.small}>{t('feedback.privacy')}</p>}
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


/**
 * Story を使えないプランで、相談に問いが複数ある時：Pro でできることを、この相談の問いで具体的に（読み取った問いだけ。結論は作らない）
 */
function ProUpsell({ plan }: { plan: Plan }) {
  const t = useT();
  const locale = useLocale();
  const c = plan.consultation;
  if (storyAllowedNow() || !c?.story || unifiable(c.story.proofNeeds)) return null;
  const qs = oneSlideCandidates(draftOf(plan, locale)!).map((s) => s.question).slice(0, 4);
  if (qs.length < 2) return null;
  const q = (x: string) => (locale === 'ja' ? `「${x}」` : `“${x}”`);
  return <p className={css.small} role="note">{t('scope.proUpsell', { list: qs.map(q).join(locale === 'ja' ? '' : ', '), n: qs.length })}</p>;
}
