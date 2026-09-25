'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { classifyConsultation, summarize } from '@/lib/advisor/classify';
import { consultWithAi } from '@/lib/ai/consult-client';
import { pickClassification } from '@/lib/advisor/pick';
import { REUSE_KEY, addHistory } from '@/lib/repo/history';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { FREE_CONSULT_PER_MONTH } from '@/lib/repo/beta';
import { PURPOSE_IDS, localize, recipesForPurpose, registry, type ChartTypeId, type PurposeId } from '@/registry';
import {
  chartHasRecipes, planFromChart, planFromConsultation, planFromPurposes, purposeHasRecipes, readPlan, writePlan, type Plan,
} from './plan';
import { RecipeScreen } from './RecipeScreen';
import css from './start.module.css';

/** 「Trend（推移）」→「推移」。英語はそのまま */
export const shortPurpose = (label: string) => /（(.+)）/.exec(label)?.[1] ?? label;

const ENTRY_CHARTS: ChartTypeId[] = [
  'line', 'column_trend', 'stacked_column', 'stacked_100', 'bar_rank', 'column_compare', 'clustered_column', 'variance_bar', 'slope', 'mekko', 'bar_100', 'share_pair', 'bar_trend',
  'waterfall', 'driver_bar', 'posneg_bar', 'scatter', 'bubble',
];

/** ① 入り口 → ② 切り口を選ぶ。③ 以降は今はエディタで1枚ずつ作る */
export default function StartFlow() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [thinking, setThinking] = useState(false);
  const auth = useAuth();

  // 途中の計画を戻す（エディタから「② に戻る」で来た時など）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('resume')) setPlan(readPlan());
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded && plan) writePlan(plan); }, [plan, loaded]);

  const step = plan ? 1 : 0;
  const steps = ['start.step.entry', 'start.step.recipes', 'start.step.data', 'start.step.output'] as const;

  function goData(p: Plan | null = plan) {
    if (!p) return;
    writePlan(p);
    router.push('/?plan=1');
  }

  return (
    <div className={css.flow}>
      <div className={css.stepsBar}>
        <ol className={css.steps} aria-label="steps">
          {steps.map((k, i) => (
            <li key={k} aria-current={i === step ? 'step' : undefined} className={i === step ? css.stepOn : i < step ? css.stepDone : css.stepTodo}>{t(k)}</li>
          ))}
        </ol>
        {plan && <button type="button" className="btn" onClick={() => setPlan(null)}>{t('recipes.backToEntry')}</button>}
      </div>
      {!plan ? (
        <Entry
          thinking={thinking}
          onConsult={async (text) => {
            // ログインしていれば AI、だめならルール版（理由は②で小さく出す）
            setThinking(true);
            const out = await consultWithAi(text, auth.session?.access_token ?? null);
            setThinking(false);
            // AI の分類で案が0件ならルール版に切り替える
            const picked = out.source === 'ai' ? pickClassification(out.classification, text) : null;
            const c = picked ? picked.classification : classifyConsultation(text);
            const classifier = picked?.used ?? 'rules';
            const fallback = out.source === 'rules' ? out.fallback : picked?.used === 'rules' ? 'no_match' as const : undefined;
            const s = summarize(text, c, locale);
            const made = planFromConsultation({
              text, classification: c, classifier, ...(fallback ? { fallback } : {}),
              summary: s.consultation_summary, question: s.interpreted_question,
            });
            setPlan(made);
            // ログイン中は相談の履歴に残す（残せなくても相談は続ける）
            if (auth.client && auth.session) {
              const id = await addHistory(auth.client, { text, classifier, classification: c, recommended: made.consultation!.ranked.map((r) => r.recipe) });
              if (id) setPlan((p) => (p?.consultation && p.consultation.text === text ? { ...p, consultation: { ...p.consultation, historyId: id } } : p));
            }
          }}
          onPurposes={(ps) => setPlan(planFromPurposes(ps))}
          onChart={(c) => setPlan(planFromChart(c))}
        />
      ) : (
        <RecipeScreen plan={plan} setPlan={setPlan} onNext={goData} />
      )}
    </div>
  );
}

/** ① 入り口：相談・目的・チャートの3つ */
function Entry({ onConsult, onPurposes, onChart, thinking }: { onConsult: (t: string) => void; onPurposes: (p: PurposeId[]) => void; onChart: (c: ChartTypeId) => void; thinking: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<PurposeId[]>([]);
  const router = useRouter();
  const beta = useBetaAccess();
  // 相談は登録した人だけ（Supabase が未設定の手元の開発では制限なし）
  const canConsult = beta.state.kind === 'active' || beta.state.kind === 'off';
  const goJoin = () => {
    try { if (text.trim()) sessionStorage.setItem(REUSE_KEY, text); } catch { /* 文は戻らないが登録はできる */ }
    router.push('/join?next=/start');
  };
  // マイページの「この相談でもう一度」から来た時は、その文を入れておく（自動では相談しない）
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(REUSE_KEY);
      if (v) { setText(v); sessionStorage.removeItem(REUSE_KEY); document.getElementById('wish')?.focus(); }
    } catch { /* 使えない時は何もしない */ }
  }, []);
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  return (
    <div className={css.entry}>
      <div className={css.entryHead}>
        <h2>{t('start.title')}</h2>
        <p>{t('start.noDataYet')}</p>
      </div>
      <div className={css.entryGrid}>
        <section className={`${css.entryCard} ${css.entryMain}`} aria-labelledby="entry-ai">
          <div className={css.cardTop}><span className={css.pill}>{t('entry.recommended')}</span><span className={css.letter}>A</span></div>
          <h3 id="entry-ai">{t('entry.ai.title')}</h3>
          <p className={css.desc}>{t('entry.ai.desc')}</p>
          <div className={css.labelRow}>
            <label htmlFor="wish" className={css.label}>{t('entry.ai.label')}</label>
            <button type="button" className={css.exampleBtn} onClick={() => setText(t('entry.ai.example'))}>{t('entry.ai.useExample')}</button>
          </div>
          <textarea id="wish" className={css.textarea} value={text} placeholder={t('entry.ai.placeholder')} onChange={(e) => setText(e.target.value)} />
          <p className={css.small}>{t('entry.ai.rule')}</p>
          <p className={css.small}>{t('entry.ai.history')}</p>
          {canConsult ? (
            <button type="button" className={css.primary} disabled={!text.trim() || thinking} aria-busy={thinking} onClick={() => onConsult(text.trim())}>
              {thinking ? t('entry.ai.thinking') : text.trim() ? t('entry.ai.button') : t('entry.ai.needText')}
            </button>
          ) : (
            <>
              <p className={css.small}>{t('entry.ai.joinNote', { n: FREE_CONSULT_PER_MONTH })}</p>
              <button type="button" className={css.primary} onClick={goJoin}>{t('entry.ai.needJoin')}</button>
            </>
          )}
        </section>

        <section className={css.entryCard} aria-labelledby="entry-purpose">
          <div className={css.cardTop}><span className={css.letter}>B</span></div>
          <h3 id="entry-purpose">{t('entry.purpose.title')}</h3>
          <p className={css.desc}>{t('entry.purpose.desc')}</p>
          <div className={css.optionList}>
            {PURPOSE_IDS.map((p) => {
              const ok = purposeHasRecipes(p);
              const on = picked.includes(p);
              const n = recipesForPurpose(p).filter((r) => r.goals[0] === p).length;
              return (
                <button key={p} type="button" className={css.option} aria-pressed={on} disabled={!ok}
                  onClick={() => setPicked((x) => (on ? x.filter((y) => y !== p) : [...x, p]))}>
                  <span className={css.optionRow}><b>{on ? '✓ ' : ''}{shortPurpose(L(registry.purposes[p].label))}</b><small>{ok ? t('entry.purpose.count', { n }) : t('common.soon')}</small></span>
                  <small>{L(registry.purposes[p].question)}</small>
                </button>
              );
            })}
          </div>
          <button type="button" className={css.primary} disabled={!picked.length} onClick={() => onPurposes(PURPOSE_IDS.filter((p) => picked.includes(p)))}>
            {picked.length ? t('entry.purpose.start', { n: picked.length }) : t('entry.purpose.pick')}
          </button>
        </section>

        <section className={css.entryCard} aria-labelledby="entry-chart">
          <div className={css.cardTop}><span className={css.letter}>C</span></div>
          <h3 id="entry-chart">{t('entry.chart.title')}</h3>
          <p className={css.desc}>{t('entry.chart.desc')}</p>
          <div className={css.chartList}>
            {ENTRY_CHARTS.map((c) => {
              const ok = chartHasRecipes(c);
              return (
                <button key={c} type="button" className={css.option} disabled={!ok} onClick={() => onChart(c)}>
                  <b>{L(registry.charts[c].label)}</b>
                  <small>{ok ? shortPurpose(L(registry.purposes[registry.charts[c].purpose].label)) : t('common.soon')}</small>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
