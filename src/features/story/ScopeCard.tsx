'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { localize, registry } from '@/registry';
import { canUseStory, planOf } from '@/lib/ai/plans';
import { saveStory } from '@/lib/repo/stories';
import { track } from '@/lib/ab/track';
import { useAuth } from '../shell/AppShell';
import type { Plan } from '../start/plan';
import { decideScope, type ScopeDecision } from './scope';
import { aimedQuestionMap, storyFromReading } from './questionMap';
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
  const map = aimedQuestionMap(reading, locale);
  const main = map.filter((q) => q.routeRole !== 'AIMED.DECISION');
  const reasonKeys = reasons.map((r) => `scope.reason.${r}`).filter((k): k is MessageKey => k in REASON_KEYS);
  const focus = c.focus ?? [];

  async function start() {
    if (!auth.client || !auth.session) { setError(t('scope.needLogin')); return; }
    setBusy(true); setError(null);
    try {
      const story = storyFromReading(c.text, reading, locale);
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
          {reasonKeys.length > 0 && <p className={sc.why}>{reasonKeys.map((k) => t(k)).join(locale === 'ja' ? '。' : '. ')}{locale === 'ja' ? '。' : '.'}{focus.length > 0 && <> {t('scope.basedOn', { words: focus.map((f) => (locale === 'ja' ? `「${f}」` : `“${f}”`)).join(' ') })}</>}</p>}
        </div>
      </div>
      {hasContext && (
        <dl className={sc.context}>
          {reading.decisionQuestion && <><dt>{t('scope.decisionLabel')}</dt><dd>{reading.decisionQuestion}</dd></>}
          {reading.primaryBarrier && <><dt>{t('scope.barrierLabel')}</dt><dd>{reading.primaryBarrier}</dd></>}
        </dl>
      )}
      <h3 className={sc.sub}>{t('scope.questions')}</h3>
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

const REASON_KEYS: Record<string, true> = Object.fromEntries(
  ['EXPLICIT_ONE', 'EXPLICIT_MULTIPLE', 'ONE_PROOF', 'MANY_PROOFS', 'RECOGNITION', 'DEEP_YES', 'ANSWER_FACT', 'ANSWER_REASON'].map((r) => [`scope.reason.${r}`, true]),
);
