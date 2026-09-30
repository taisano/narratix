'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import type { Locale } from '@/registry';
import { canUseStory, planOf } from '@/lib/ai/plans';
import { saveStory } from '@/lib/repo/stories';
import { track } from '@/lib/ab/track';
import { useAuth } from '../shell/AppShell';
import type { Plan } from '../start/plan';
import { decideScope, type ScopeDecision, type ScopeReason } from './scope';
import { storyFromReading } from './questionMap';
import { sizeAdvice } from './storyOps';
import { NeedPicker, QuestionList } from './StoryOverview';
import type { StoryState } from './model';
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
  // Story の時は、画面を真ん中（StoryCenter）と右（StoryAside）に分けて出す（RecipeScreen）
  if (s.scope === 'STORY_FLOW') return <StoryCenter plan={plan} setPlan={setPlan} reasons={s.reasons} />;
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

/** ② で編集中の Story の下書き（まだ保存していない）。無ければ相談の読み取りから作る */
export function draftOf(plan: Plan, locale: Locale): StoryState | null {
  const c = plan.consultation;
  if (!c?.story) return null;
  return plan.storyDraft ?? storyFromReading(c.text, c.story, locale);
}

/**
 * ② の真ん中（見る場所）：おすすめの理由、決めたいこと、想定される質問と流れ（その場で並べ替え・まとめる・置き場所など）、
 * 下に問いの選び直し。決める（Story を始める）のは右（StoryAside）
 */
export function StoryCenter({ plan, setPlan, reasons }: { plan: Plan; setPlan: (p: Plan) => void; reasons: ScopeDecision['reasons'] }) {
  const t = useT();
  const locale = useLocale();
  const c = plan.consultation!;
  const reading = c.story!;
  const draft = draftOf(plan, locale)!;
  const change = (next: StoryState) => setPlan({ ...plan, storyDraft: next });
  const size = sizeAdvice(draft);
  return (
    <section className={sc.card} aria-labelledby="scope-head">
      <div className={sc.head}>
        <span className={sc.badge} aria-hidden="true">C</span>
        <div>
          <p className={sc.kicker}>{t('scope.kicker')}</p>
          <h2 id="scope-head" className={sc.title}>{t('scope.storyTitle')}</h2>
          <p className={sc.why}>{whyText(t, locale, reasons, c.focus ?? [])}</p>
        </div>
      </div>
      {(reading.decisionQuestion || reading.primaryBarrier) && (
        <dl className={sc.context}>
          {reading.decisionQuestion && <><dt>{t('scope.decisionLabel')}</dt><dd>{reading.decisionQuestion}</dd></>}
          {reading.primaryBarrier && <><dt>{t('scope.barrierLabel')}</dt><dd>{reading.primaryBarrier}</dd></>}
        </dl>
      )}
      <div className={sc.flowHead}>
        <h3 className={sc.flowTitle}>{t('scope.flowTitle')}</h3>
        <p className={sc.coachTip}><span className={sc.badgeSm} aria-hidden="true">C</span>{t('scope.flowTip')}</p>
      </div>
      {size.level !== 'ideal' && <p className={sc.lead}>{t(`story.size.${size.level}`, { n: size.main })}</p>}
      <QuestionList story={draft} onChange={change} draft />
      <NeedPicker story={draft} onChange={change} lead={t('story.pickLead')} suggested={reading.proofNeeds}
        onReset={plan.storyDraft ? () => setPlan({ ...plan, storyDraft: null }) : undefined} resetLabel={t('scope.rechooseReset')} />
    </section>
  );
}

/** ② の右（決める場所）：この Story から始める（ここで初めて保存）、別の進め方。children に「提案が意図と違う時は」 */
export function StoryAside({ plan, setPlan, children }: { plan: Plan; setPlan: (p: Plan) => void; children?: React.ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = draftOf(plan, locale)!;
  const size = sizeAdvice(draft);

  async function start() {
    if (!auth.client || !auth.session) { setError(t('scope.needLogin')); return; }
    setBusy(true); setError(null);
    try {
      const id = await saveStory(auth.client, null, draft);
      track('story_started', { loggedIn: true, detail: String(size.main) });
      router.push(`/story?id=${id}`);
    } catch (e) {
      setError(t('scope.saveError', { message: (e as Error).message ?? String(e) }));
      setBusy(false);
    }
  }

  return (
    <div className={sc.aside}>
      <div className={sc.decide}>
        <p className={sc.decideHead}>{t('scope.decideHead', { n: size.main })}</p>
        <button type="button" className={sc.primaryFull} disabled={busy || size.main === 0} aria-busy={busy} onClick={() => void start()}>{busy ? t('scope.starting') : t('scope.start')}</button>
        {error && <p className={sc.error} role="alert">{error}</p>}
        <p className={sc.lead}>{t('scope.noData')}</p>
        <details className={sc.other}>
          <summary>{t('scope.other')}</summary>
          <button type="button" className={sc.link} onClick={() => { track('story_scope_switched', { loggedIn: !!auth.session, detail: 'to_one' }); setPlan({ ...plan, scopeChoice: 'one' }); }}>
            {t('scope.toOne')}
          </button>
        </details>
      </div>
      {children}
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
