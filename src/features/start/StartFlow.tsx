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
import { PURPOSE_IDS, localize, registry, type ChartTypeId, type PurposeId } from '@/registry';
import {
  chartHasRecipes, planFromChart, planFromConsultation, planFromPurposes, purposeHasRecipes, readPlan, writePlan, type Plan,
} from './plan';
import { RecipeScreen } from './RecipeScreen';
import css from './start.module.css';
import e from './entry.module.css';
import { track } from '@/lib/ab/track';
import { CONSULT_MAX_CHARS } from '@/lib/ai/consult';

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
    track('angle_selection_completed', { loggedIn: !!auth.session, detail: p.entry.toLowerCase() });
    router.push('/editor?plan=1');
  }

  return (
    <div className={css.flow}>
      <div className={css.stepsBar}>
        <ol className={css.steps} aria-label="steps">
          {steps.map((k, i) => (
            <li key={k} aria-current={i === step ? 'step' : undefined} className={i === step ? css.stepOn : i < step ? css.stepDone : css.stepTodo}>{t(k)}</li>
          ))}
        </ol>
        <span className={css.stepsMobile}>{t('start.stepOf', { n: step + 1, total: steps.length, name: t(steps[step]!).replace(/^[①②③④]\s*/, '') })}</span>
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

/** ① 入り口：相談（いちばん強く）→ 目的 → チャート（閉じた補助の経路）。docs/landing-ab-guide.md 7章 */
function Entry({ onConsult, onPurposes, onChart, thinking }: { onConsult: (t: string) => void; onPurposes: (p: PurposeId[]) => void; onChart: (c: ChartTypeId) => void; thinking: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<PurposeId[]>([]);
  const [chartsOpen, setChartsOpen] = useState(false);
  const router = useRouter();
  const beta = useBetaAccess();
  const auth = useAuth();
  // 相談は登録した人だけ（Supabase が未設定の手元の開発では制限なし）
  const canConsult = beta.state.kind === 'active' || beta.state.kind === 'off';
  const goJoin = () => {
    try { if (text.trim()) sessionStorage.setItem(REUSE_KEY, text); } catch { /* 文は戻らないが登録はできる */ }
    router.push('/join?next=/start&for=consult');
  };
  useEffect(() => {
    // マイページの「この相談でもう一度」から来た時は、その文を入れておく（自動では相談しない）
    try {
      const v = sessionStorage.getItem(REUSE_KEY);
      if (v) { setText(v); sessionStorage.removeItem(REUSE_KEY); document.getElementById('wish')?.focus(); }
    } catch { /* 使えない時は何もしない */ }
    // 紹介トップの「PreBuilt チャートを見る」から来た時は、チャートの一覧を開いてそこへ
    if (window.location.hash === '#chart-library') {
      setChartsOpen(true);
      requestAnimationFrame(() => document.getElementById('chart-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []);
  useEffect(() => {
    if (auth.session !== undefined) track('start_view', { loggedIn: !!auth.session, oncePerPage: true });
  }, [auth.session]);
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const over = text.length > CONSULT_MAX_CHARS;
  return (
    <div className={e.entry}>
      <header className={e.intro}>
        <p className={e.kicker}>START WITH YOUR STORY</p>
        <h1 className={e.h1}>{t('start.title')}</h1>
        <p className={e.lead}>{t('start.noDataYet')}</p>
      </header>

      {/* 第一推奨：相談 */}
      <section className={e.consult} aria-labelledby="entry-ai">
        <div className={e.consultCopy}>
          <span className={e.badge}>{t('entry.recommended')}</span>
          <p className={e.num}>01</p>
          <h2 id="entry-ai" className={e.h2}>{t('entry.ai.title')}</h2>
          <p className={e.desc}>{t('entry.ai.desc')}</p>
          <div className={e.promise}>
            <span className={e.coachDot} aria-hidden="true">C</span>
            <p><b>{t('entry.ai.promiseTitle')}</b><br />{t('entry.ai.promise')}</p>
          </div>
        </div>
        <div className={e.consultInput}>
          <label htmlFor="wish" className={e.label}>{t('entry.ai.label')}</label>
          <textarea id="wish" className={e.textarea} value={text} placeholder={t('entry.ai.placeholder')} onChange={(ev) => setText(ev.target.value)} aria-describedby="wish-count" />
          <div className={e.inputRow}>
            <button type="button" className={e.linkBtn} onClick={() => setText(t('entry.ai.example'))}>{t('entry.ai.useExample')}</button>
            <span id="wish-count" className={over ? e.countOver : e.count}>{text.length} / {CONSULT_MAX_CHARS}</span>
          </div>
          {canConsult ? (
            <button type="button" className={e.primary} disabled={!text.trim() || over || thinking} aria-busy={thinking} onClick={() => { track('start_consultation_selected', { loggedIn: !!auth.session }); onConsult(text.trim()); }}>
              {thinking ? t('entry.ai.thinking') : t('entry.ai.button')}<span aria-hidden="true">→</span>
            </button>
          ) : (
            <>
              <button type="button" className={e.primary} onClick={goJoin}>{t('entry.ai.needJoin')}<span aria-hidden="true">→</span></button>
              <p className={e.small}>{t('entry.ai.joinNote', { n: FREE_CONSULT_PER_MONTH })}</p>
            </>
          )}
          <details className={e.privacy}>
            <summary>{t('entry.ai.privacyShort')} <span className={e.more}>{t('entry.ai.privacyMore')}</span></summary>
            <p>{t('entry.ai.rule')}</p>
            <p>{t('entry.ai.history')}</p>
          </details>
        </div>
      </section>

      {/* 第二推奨：目的 */}
      <section className={e.purposes} aria-labelledby="entry-purpose">
        <div className={e.sectionHead}>
          <p className={e.num}>02</p>
          <div>
            <h2 id="entry-purpose" className={e.h2}>{t('entry.purpose.title')}</h2>
            <p className={e.desc}>{t('entry.purpose.desc')}</p>
          </div>
        </div>
        <div className={e.purposeGrid} role="group" aria-label={t('entry.purpose.title')}>
          {PURPOSE_IDS.map((p) => {
            const ok = purposeHasRecipes(p);
            const on = picked.includes(p);
            return (
              <button key={p} type="button" className={e.purpose} aria-pressed={ok ? on : undefined} disabled={!ok}
                onClick={() => setPicked((x) => (on ? x.filter((y) => y !== p) : [...x, p]))}>
                <span className={e.purposeTop}>
                  <span className={e.purposeLabel}>{shortPurpose(L(registry.purposes[p].label))}</span>
                  {ok ? <span className={e.check} aria-hidden="true">{on ? '✓' : ''}</span> : <span className={e.soon}>{t('common.soon')}</span>}
                </span>
                <strong className={e.purposeQ}>{L(registry.purposes[p].question)}</strong>
              </button>
            );
          })}
        </div>
        <div className={e.purposeAction}>
          <button type="button" className={e.secondary} disabled={!picked.length} onClick={() => { track('start_purpose_selected', { loggedIn: !!auth.session, detail: PURPOSE_IDS.filter((p) => picked.includes(p)).join(',') }); onPurposes(PURPOSE_IDS.filter((p) => picked.includes(p))); }}>
            {picked.length ? t('entry.purpose.start', { n: picked.length }) : t('entry.purpose.pick')}
          </button>
        </div>
      </section>

      {/* 補助の経路：チャートから（閉じておく） */}
      <section className={e.charts} id="chart-library" aria-labelledby="entry-chart">
        <details open={chartsOpen} onToggle={(ev) => {
          const open = (ev.currentTarget as HTMLDetailsElement).open;
          setChartsOpen(open);
          if (open) track('start_chart_library_opened', { loggedIn: !!auth.session, oncePerPage: true });
        }}>
          <summary className={e.chartsSummary}>
            <span>
              <b id="entry-chart">{t('entry.chart.title')}</b>
              <small>{t('entry.chart.sub')}</small>
            </span>
            <span className={e.plus} aria-hidden="true">＋</span>
          </summary>
          <div className={e.chartsBody}>
            <p className={e.desc}>{t('entry.chart.desc')}</p>
            <div className={e.chartList}>
              {ENTRY_CHARTS.map((c) => {
                const ok = chartHasRecipes(c);
                return (
                  <button key={c} type="button" className={e.chart} disabled={!ok} onClick={() => onChart(c)}>
                    <b>{L(registry.charts[c].label)}</b>
                    <small>{ok ? shortPurpose(L(registry.purposes[registry.charts[c].purpose].label)) : t('common.soon')}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
