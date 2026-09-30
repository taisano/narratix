'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { PROOF_NEEDS, localize, registry, type ProofNeedId, type StoryReading } from '@/registry';
import { canUseStory, planOf } from '@/lib/ai/plans';
import { saveStory } from '@/lib/repo/stories';
import { track } from '@/lib/ab/track';
import { useAuth } from '../shell/AppShell';
import type { Plan } from '../start/plan';
import { decideScope, type ScopeDecision, type ScopeReason } from './scope';
import { aimedQuestionMap, candidateNeeds, storyFromReading } from './questionMap';
import css from '../start/start.module.css';
import sc from './scope.module.css';

/**
 * ② の一番上：1枚で伝えるか、Story として組み立てるか（docs/story-spec.md 5.8）。
 * おすすめを1つ大きく出し、別の進め方は閉じておく。判断できない時は一問だけ聞く（5.7）。
 * ここでは AI を呼ばない（相談の時の読み取りだけを使う）
 */

// TODO(story): ベータが終わったら、ログイン中の人のプラン（user_plans）を読む。今は BETA_OPEN_STORY で全員が使える
const STORY_ALLOWED = canUseStory(planOf(null));

/** 今の進め方（ユーザーが選び直していれば、それを優先） */
export function scopeOf(plan: Plan): ScopeDecision & { chosen: boolean } {
  const d = decideScope(plan.consultation?.story, STORY_ALLOWED, plan.scopeAnswer);
  if (plan.scopeChoice === 'one') return { scope: 'ONE_SLIDE_STORY', reasons: d.reasons, chosen: true };
  if (plan.scopeChoice === 'story' && plan.consultation?.story) return { scope: 'STORY_FLOW', reasons: d.reasons, chosen: true };
  return { ...d, chosen: false };
}

/** Story のおすすめ・確認を出している間は、1枚の提案（重視点・見せ方）を出さない */
export const scopeBlocksOneSlide = (plan: Plan): boolean => {
  const s = scopeOf(plan);
  return s.scope === 'STORY_FLOW' || s.scope === 'CLARIFY';
};

export function ScopeCard({ plan, setPlan }: { plan: Plan; setPlan: (p: Plan) => void }) {
  const t = useT();
  const c = plan.consultation;
  if (!c?.story) return null;
  const s = scopeOf(plan);
  if (s.scope === 'CLARIFY') return <DepthAsk plan={plan} setPlan={setPlan} />;
  if (s.scope === 'STORY_FLOW') return <StoryLead plan={plan} setPlan={setPlan} reasons={s.reasons} />;
  // 1枚：Story を作れる時だけ、閉じた別の進め方として Story を残す
  return (
    <>
      {s.scope === 'MULTIPLE_QUESTIONS' && <p className={css.switchNote} role="note">{t('scope.multiple')}</p>}
      {plan.scopeChoice === 'one' ? (
        <p className={css.small}>{t('scope.oneChosen')} <button type="button" className={css.linkBtn} onClick={() => setPlan({ ...plan, scopeChoice: undefined })}>{t('scope.backToStory')}</button></p>
      ) : STORY_ALLOWED && (
        <details className={sc.other}>
          <summary>{t('scope.other')}</summary>
          <button type="button" className={sc.link} onClick={() => { track('story_scope_switched', { loggedIn: true, detail: 'to_story' }); setPlan({ ...plan, scopeChoice: 'story' }); }}>
            {t('scope.toStory')}
          </button>
        </details>
      )}
    </>
  );
}

function StoryLead({ plan, setPlan, reasons }: { plan: Plan; setPlan: (p: Plan) => void; reasons: ScopeDecision['reasons'] }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = plan.consultation!;
  const reading = c.story!;
  // 想定する Question を選び直した時の proof_needs（null＝相談の読み取りのまま）。AI は使わない（5.9）
  const [chosen, setChosen] = useState<ProofNeedId[] | null>(null);
  const [rechoosing, setRechoosing] = useState(false);
  const map = aimedQuestionMap(chosen ? { ...reading, proofNeeds: chosen } : reading, locale);
  const main = map.filter((q) => q.routeRole !== 'AIMED.DECISION');
  const focus = c.focus ?? [];

  async function start() {
    if (!auth.client || !auth.session) { setError(t('scope.needLogin')); return; }
    setBusy(true); setError(null);
    try {
      const story = storyFromReading(c.text, reading, locale, chosen ?? undefined);
      const id = await saveStory(auth.client, null, story);
      track('story_started', { loggedIn: true, detail: String(story.slides.length) });
      router.push(`/story?id=${id}`);
    } catch (e) {
      setError(t('scope.saveError', { message: (e as Error).message ?? String(e) }));
      setBusy(false);
    }
  }

  const decision = map.find((q) => q.routeRole === 'AIMED.DECISION')!;
  const hasContext = !!(reading.decisionQuestion || reading.primaryBarrier);
  return (
    <section className={sc.card} aria-labelledby="scope-head">
      <div className={sc.head}>
        <span className={sc.badge} aria-hidden="true">C</span>
        <div>
          <p className={sc.kicker}>{t('scope.kicker')}</p>
          <h2 id="scope-head" className={sc.title}>{t('scope.storyTitle')}</h2>
          <p className={sc.why}>{whyText(t, locale, reasons, focus)}</p>
        </div>
      </div>
      {hasContext && (
        <dl className={sc.context}>
          {reading.decisionQuestion && <><dt>{t('scope.decisionLabel')}</dt><dd>{reading.decisionQuestion}</dd></>}
          {reading.primaryBarrier && <><dt>{t('scope.barrierLabel')}</dt><dd>{reading.primaryBarrier}</dd></>}
        </dl>
      )}
      <div className={sc.subRow}>
        <h3 className={sc.sub}>{t('scope.questions')}</h3>
        <button type="button" className={sc.link} aria-expanded={rechoosing} onClick={() => setRechoosing(!rechoosing)}>{t('scope.rechoose')}</button>
      </div>
      {rechoosing && <Rechoose reading={reading} chosen={chosen ?? reading.proofNeeds} onChange={setChosen} onDone={() => setRechoosing(false)} onReset={() => { setChosen(null); setRechoosing(false); }} />}
      <ol className={sc.questions}>
        {main.map((q) => (
          <li key={q.id} className={sc.q}>
            <div>
              <p className={sc.qText}>{q.question}</p>
              {q.questionPriority === 'CONDITIONAL' && <p className={sc.qNote}>{t('scope.conditional')}</p>}
              {q.referenceRecipes.length > 0 && <p className={sc.qNote}>{t('scope.recipes', { names: q.referenceRecipes.slice(0, 2).map((r) => localize(registry.recipes[r].name, locale)).join(locale === 'ja' ? '／' : ' / ') })}</p>}
            </div>
          </li>
        ))}
        <li className={`${sc.q} ${sc.qLast}`}>
          <div>
            <p className={sc.qText}>{decision.question}</p>
            <p className={sc.qNote}>{t('scope.decisionRole')}</p>
          </div>
        </li>
      </ol>
      <div className={sc.foot}>
        <button type="button" className={sc.primary} disabled={busy} aria-busy={busy} onClick={() => void start()}>{busy ? t('scope.starting') : t('scope.start')}</button>
        <p className={sc.note}>{t('scope.noData')}</p>
        {error && <p className={sc.error} role="alert">{error}</p>}
      </div>
      <details className={sc.other}>
        <summary>{t('scope.other')}</summary>
        <button type="button" className={sc.link} onClick={() => { track('story_scope_switched', { loggedIn: !!auth.session, detail: 'to_one' }); setPlan({ ...plan, scopeChoice: 'one' }); }}>
          {t('scope.toOne')}
        </button>
      </details>
    </section>
  );
}

const ROLE_LABEL: Record<string, MessageKey> = { 'AIMED.IMPACT': 'story.role.impact', 'AIMED.MISMATCH': 'story.role.mismatch', 'AIMED.EXPLANATION': 'story.role.explanation' };

/** 想定する Question を選び直す：proof_needs を役割ごとに選ぶ（相談から読み取ったものに印）。選ぶとすぐ上の並びが変わる */
function Rechoose({ reading, chosen, onChange, onDone, onReset }: { reading: StoryReading; chosen: readonly ProofNeedId[]; onChange: (n: ProofNeedId[]) => void; onDone: () => void; onReset: () => void }) {
  const t = useT();
  const locale = useLocale();
  const list = candidateNeeds(reading);
  const roles = [...new Set(list.map((x) => x.role))];
  const toggle = (n: ProofNeedId) => onChange(chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n]);
  return (
    <div className={sc.rechoose}>
      <p className={sc.note}>{t('scope.rechooseLead')}</p>
      {roles.map((role) => (
        <div key={role} className={sc.group}>
          <p className={sc.groupHead}>{t(ROLE_LABEL[role]!)}</p>
          <div className={sc.chips}>
            {list.filter((x) => x.role === role).map((x) => (
              <button key={x.need} type="button" className={sc.chip} aria-pressed={chosen.includes(x.need)} onClick={() => toggle(x.need)}>
                <b>{localize(PROOF_NEEDS[x.need].question, locale)}</b>
                {x.suggested && <small>{t('scope.fromConsult')}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className={sc.rechooseFoot}>
        <button type="button" className={sc.secondary} onClick={onDone}>{t('scope.rechooseDone')}</button>
        <button type="button" className={sc.link} onClick={onReset}>{t('scope.rechooseReset')}</button>
      </div>
    </div>
  );
}

/** 意図の深さを一問だけ聞く。答えたら追加の質問をせずに進める */
function DepthAsk({ plan, setPlan }: { plan: Plan; setPlan: (p: Plan) => void }) {
  const t = useT();
  const opts = [
    { v: 'fact' as const, label: t('scope.askFact'), note: t('scope.askFactNote') },
    { v: 'reason' as const, label: t('scope.askReason'), note: t('scope.askReasonNote') },
  ];
  return (
    <section className={sc.card} aria-labelledby="scope-ask">
      <h2 id="scope-ask" className={css.coachHead}>{t('scope.askTitle')}</h2>
      <p className={css.askQ}>{t('scope.askQ')}</p>
      <div className={css.askOptions}>
        {opts.map((o) => (
          <button key={o.v} type="button" className={css.askOption} onClick={() => { track('story_scope_answered', { loggedIn: true, detail: o.v }); setPlan({ ...plan, scopeAnswer: o.v }); }}>
            <b>{o.label}</b><small>{o.note}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * おすすめの理由を、相談の言葉を入れた1〜2文にする（理由のコードを「。」で並べない）。
 * 例：「市場全体の回復」「市場差」と、確かめたいことが複数あり、判断までつなげたいご相談です。…
 */
export function whyText(t: (k: MessageKey, v?: Record<string, string | number>) => string, locale: string, reasons: readonly ScopeReason[], focus: readonly string[]): string {
  const has = (r: ScopeReason) => reasons.includes(r);
  if (has('EXPLICIT_MULTIPLE')) return t('scope.why.explicit');
  if (has('ANSWER_REASON')) return t('scope.why.answer');
  const words = focus.length
    ? t('scope.why.words', { words: focus.map((f) => (locale === 'ja' ? `「${f}」` : `“${f}”`)).join(locale === 'ja' ? '' : ', ') })
    : '';
  const key = has('MANY_PROOFS') && has('DEEP_YES') ? 'scope.why.manyDeep' : has('MANY_PROOFS') ? 'scope.why.many' : has('DEEP_YES') ? 'scope.why.deep' : 'scope.why.manyDeep';
  return t(key, { words });
}
