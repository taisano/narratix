'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import type { Locale } from '@/registry/locale';
import { classifyConsultation, summarize } from '@/lib/advisor/classify';
import { consultWithAi, readConsultCache, writeConsultCache } from '@/lib/ai/consult-client';
import { pickClassification } from '@/lib/advisor/pick';
import { REUSE_KEY, addHistory } from '@/lib/repo/history';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { FREE_CONSULT_PER_MONTH } from '@/lib/repo/beta';
import { PURPOSE_IDS, localize, registry, type ChartTypeId, type PurposeId } from '@/registry';
import {
  chartHasRecipes, planFromChart, planFromConsultation, planFromPurpose, purposeHasRecipes, readPlan, recommendationState, writePlan, type Plan,
} from './plan';
import { RecipeScreen } from './RecipeScreen';
import { inOneSlideFlow } from '../story/ScopeCard';
import { applyCreationMode, modeOutcome, oneSlideOf } from '../story/creationMode';
import { EntryModes, readEntryDraft, writeEntryDraft } from './EntryModes';
import { canUseStory } from '@/lib/ai/plans';
import type { CreationMode } from '@/registry';
import { readStored } from '../editor/storage';
import { viewOf } from '../editor/project';
import { isSampleData } from '../editor/fromRecipe';
import { dataConditions } from '../editor/dishConditions';
import type { Conditions } from './dishes';

/** 編集画面に入れたデータ（見本でなければ）から、一品料理のデータの条件 */
function storedDataConditions(): Conditions | undefined {
  const s = readStored().state;
  if (!s) return undefined;
  const v = viewOf(s, s.current);
  return isSampleData(v) ? undefined : dataConditions(v).conditions;
}
import css from './start.module.css';
import e from './entry.module.css';
import { CATALOG_FIRST, CATALOG_ORDER, type ChartThumbs } from './chart-catalog';
import { track } from '@/lib/ab/track';
import { CONSULT_MAX_CHARS } from '@/lib/ai/consult';
import { quotaOf, readConsultQuota, type ConsultQuota } from '@/lib/repo/quota';

/** 「Trend（推移）」→「推移」。英語はそのまま */
/** 括弧で囲む（日本語は全角、英語は半角） */
const paren = (x: string, locale: string) => (locale === 'ja' ? `（${x}）` : ` (${x})`);

export const shortPurpose = (label: string) => /（(.+)）/.exec(label)?.[1] ?? label;


/** ① 入り口 → ② 切り口を選ぶ。③ 以降は今はエディタで1枚ずつ作る */
export default function StartFlow({ thumbs }: { thumbs?: Record<Locale, ChartThumbs> }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [thinking, setThinking] = useState(false);
  const auth = useAuth();
  // 今月の AI 相談の残り回数（ログイン中だけ。相談のたびにサーバーの返事で更新する）
  const [quota, setQuota] = useState<ConsultQuota | null>(null);
  const uid = auth.session?.user.id;
  // Story（複数枚・Coach にまかせる）を使えるプランか。ベータの間は全員（BETA_OPEN_STORY）
  const storyAllowed = canUseStory(quota?.plan ?? 'free');
  useEffect(() => {
    let alive = true;
    if (!auth.client || !uid) { setQuota(null); return; }
    void readConsultQuota(auth.client, uid).then((q) => { if (alive) setQuota(q); });
    return () => { alive = false; };
  }, [auth.client, uid]);

  // 途中の計画を戻す（エディタから「② に戻る」で来た時など）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // 編集画面から戻った時は、入れたデータを保ったまま伝え方だけを選び直す（AI は使わない）
    // 入れたデータから一品料理の条件（期間の数・内訳か・絶対値か・CAGR を出せるか など）も分かる
    if (q.get('resume')) { const p = readPlan(); setPlan(p ? { ...p, keepData: true, dataConditions: storedDataConditions() } : null); }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded && plan) writePlan(plan); }, [plan, loaded]);

  /**
   * 相談する：ログインしていれば AI、だめならルール版（理由は②で小さく出す）。
   * note があれば「提案を見て書き足した補足」付きで出し直す（AI の相談1回として数える）。
   * keep＝相談文を直して出し直す時：AI の新しい提案が返るまで今の提案を消さず、AI が使えなければ今の提案をそのまま残す
   */
  async function consult(text: string, note?: string, keep = false, mode?: CreationMode): Promise<boolean> {
    // 同じ人・同じ相談文・同じ言語・同じプロンプトの版なら、前の AI の結果を使う（AI を呼ばない）。書き足して出し直す時は呼ぶ
    const cached = note ? null : readConsultCache(uid, text, locale);
    // 「入り口に戻る」から同じ相談文・同じ入口で戻ってきた時は、前の選択（問い・切り口・形）をそのまま戻す（AI は呼ばない）
    const prev = !note && !keep && cached ? readPlan() : null;
    if (prev?.consultation?.text === text && prev.creationMode === (mode ?? plan?.creationMode ?? 'COACH_RECOMMEND')) { setPlan(prev); return true; }
    setThinking(!cached);
    const out = cached ?? await consultWithAi(text, auth.session?.access_token ?? null, undefined, undefined, note, locale);
    setThinking(false);
    if (!cached && out.source === 'ai' && !note) writeConsultCache(uid, text, locale, out);
    if (note && out.source === 'ai') track('coach_ai_rerun', { loggedIn: true });
    if (!cached && out.source === 'ai' && quota) setQuota({ ...quota, ...quotaOf(quota.limit == null ? quota.used + 1 : quota.limit - (out.remaining ?? 0), quota.limit) });
    if (out.source === 'rules' && out.fallback === 'limit' && quota?.limit != null) setQuota({ ...quota, ...quotaOf(quota.limit, quota.limit) });
    // 出し直し（補足・相談文の修正）で AI が使えなかった時は、今の提案をそのままにする
    if ((note || keep) && out.source !== 'ai') return false;
    // AI の分類で案が0件ならルール版に切り替える
    const picked = out.source === 'ai' ? pickClassification(out.classification, text) : null;
    const c = picked ? picked.classification : classifyConsultation(text);
    const classifier = picked?.used ?? 'rules';
    const fallback = out.source === 'rules' ? out.fallback : picked?.used === 'rules' ? 'no_match' as const : undefined;
    const s = summarize(text, c, locale);
    const reading = out.source === 'ai' && picked?.used === 'ai' ? out.reading : null;
    const made = planFromConsultation({
      text, classification: c, classifier, ...(fallback ? { fallback } : {}),
      summary: s.consultation_summary, question: s.interpreted_question,
      ...(reading ? { focus: reading.focus, alternative: reading.alternative, reading: 'primary' as const, story: reading.story ?? null } : {}),
      ...(note ? { note } : {}),
    });
    const prevHistory = plan?.consultation?.text === text ? plan.consultation.historyId : undefined;
    if (prevHistory && made.consultation) made.consultation.historyId = prevHistory;
    // 入口で選んだ形（1枚／Story／Coach）を当てはめる。出し直しは前と同じ形のまま。
    // 1枚の流れで出し直した時は、出し直した後も1枚のまま（ストーリーのおすすめに戻さない）
    const m = mode ?? plan?.creationMode ?? 'COACH_RECOMMEND';
    setPlan((note || keep) && plan && inOneSlideFlow(plan) ? { ...oneSlideOf(made, locale), creationMode: m } : applyCreationMode(made, m, locale, storyAllowed));
    // ログイン中は相談の履歴に残す（出し直しは同じ相談なので残さない。残せなくても相談は続ける）
    if (!note && auth.client && auth.session) {
      const id = await addHistory(auth.client, { text, classifier, classification: c, recommended: recommendationState(made).recommended_recipe_ids });
      if (id) setPlan((p) => (p?.consultation && p.consultation.text === text ? { ...p, consultation: { ...p.consultation, historyId: id } } : p));
    }
    return true;
  }

  // ② にいる間は履歴を1つ積む：ブラウザの「戻る」で入り口へ戻る（目的・チャートの押し間違いを戻せる）
  const inRecipes = !!plan;
  useEffect(() => {
    if (!inRecipes) return;
    if ((window.history.state as { nxStep?: number } | null)?.nxStep !== 2) window.history.pushState({ ...(window.history.state ?? {}), nxStep: 2 }, '');
    const onPop = () => setPlan(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [inRecipes]);
  /** 入り口に戻る（積んだ履歴があれば、ブラウザの戻ると同じ動きにする） */
  const backToEntry = () => {
    if ((window.history.state as { nxStep?: number } | null)?.nxStep === 2) window.history.back();
    else setPlan(null);
  };

  const step = plan ? 1 : 0;
  const steps = ['start.step.entry', 'start.step.recipes', 'start.step.data', 'start.step.output'] as const;

  function goData(p: Plan | null = plan) {
    if (!p) return;
    writePlan(p);
    track('angle_selection_completed', { loggedIn: !!auth.session, detail: p.entry.toLowerCase() });
    if (p.creationMode) track('entry_mode_outcome', { loggedIn: !!auth.session, detail: modeOutcome(p, 'one') });
    router.push('/editor?plan=1');
  }

  return (
    <div className={css.flow}>
      <div className={css.stepsBar}>
        <ol className={css.steps} aria-label="steps">
          {steps.map((k, i) => (
            <li key={k} aria-current={i === step ? 'step' : undefined} className={i === step ? css.stepOn : i < step ? css.stepDone : css.stepTodo}>
              {/* ① を押すと入り口へ戻る（「入り口に戻る」と同じ） */}
              {i === 0 && plan ? <button type="button" className={css.stepBack} onClick={backToEntry}>{t(k)}</button> : t(k)}
            </li>
          ))}
        </ol>
        <span className={css.stepsMobile}>{t('start.stepOf', { n: step + 1, total: steps.length, name: t(steps[step]!).replace(/^[①②③④]\s*/, '') })}</span>
        {plan && <button type="button" className="btn" onClick={backToEntry}>{t('recipes.backToEntry')}</button>}
      </div>
      {!plan ? (
        <Entry
          thinking={thinking}
          onConsult={(text, mode) => void consult(text, undefined, false, mode)}
          quota={quota}
          storyAllowed={storyAllowed}
          thumbs={thumbs?.[locale] ?? {}}
          onPurpose={(p) => setPlan(planFromPurpose(p))}
          onChart={(c) => setPlan(planFromChart(c))}
        />
      ) : (
        <RecipeScreen plan={plan} setPlan={setPlan} onNext={goData} onReconsult={(note) => consult(plan.consultation!.text, note)} onEditConsultation={(text) => consult(text, undefined, true)} thinking={thinking} quota={quota} />
      )}
    </div>
  );
}

/** ① 入り口：相談（いちばん強く）→ 目的 → チャート（閉じた補助の経路）。docs/landing-ab-guide.md 7章 */
function Entry({ onConsult, onPurpose, onChart, thinking, quota, thumbs, storyAllowed }: { onConsult: (t: string, mode: CreationMode) => void; onPurpose: (p: PurposeId) => void; onChart: (c: ChartTypeId) => void; thinking: boolean; quota: ConsultQuota | null; thumbs: Partial<Record<ChartTypeId, string>>; storyAllowed: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [text, setText0] = useState('');
  const [lastMode, setLastMode] = useState<CreationMode | null>(null);
  // 入れた相談文と最後に押した入口は、このタブの間は残す（戻る・再読み込み・Pro の説明を開いても消えない）
  const setText = (v: string) => { setText0(v); writeEntryDraft({ text: v, mode: lastMode }); };
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
      else { const d = readEntryDraft(); if (d) { setText0(d.text); setLastMode(d.mode); } }
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
            <EntryModes text={text} disabled={!text.trim() || over} thinking={thinking} storyAllowed={storyAllowed} lastMode={lastMode}
              onRun={(mode) => {
                track('start_consultation_selected', { loggedIn: !!auth.session, detail: mode.toLowerCase() });
                setLastMode(mode); writeEntryDraft({ text, mode });
                onConsult(text.trim(), mode);
              }} />
          ) : (
            <>
              <button type="button" className={e.primary} onClick={goJoin}>{t('entry.ai.needJoin')}<span aria-hidden="true">→</span></button>
              <p className={e.small}>{t('entry.ai.joinNote', { n: FREE_CONSULT_PER_MONTH })}</p>
            </>
          )}
          {canConsult && quota && <QuotaLine quota={quota} />}
          <details className={e.privacy}>
            <summary>{t('entry.ai.privacyShort')} <span className={e.more}>{t('entry.ai.privacyMore')}</span></summary>
            <p>{t('entry.ai.rule')}</p>
            <p>{t('entry.ai.history')}</p>
            <p><Link href="/privacy" className={e.linkBtn}>{t('privacy.link')}</Link></p>
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
        {/* 目的は1つだけ。押したらすぐ ② へ（チャートを押した時と同じ。ほかの目的は ② で「一緒に見せる案」として出す） */}
        <div className={e.purposeGrid} role="group" aria-label={t('entry.purpose.title')}>
          {PURPOSE_IDS.map((p) => {
            const ok = purposeHasRecipes(p);
            return (
              <button key={p} type="button" className={e.purpose} disabled={!ok}
                onClick={() => { track('start_purpose_selected', { loggedIn: !!auth.session, detail: p }); onPurpose(p); }}>
                <span className={e.purposeTop}>
                  <span className={e.purposeLabel}>{shortPurpose(L(registry.purposes[p].label))}</span>
                  {ok ? <span className={e.purposeGo} aria-hidden="true">→</span> : <span className={e.soon}>{t('common.soon')}</span>}
                </span>
                <strong className={e.purposeQ}>{L(registry.purposes[p].question)}</strong>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3つ目の経路：チャートから（カタログ。Excel・PowerPoint で作りにくいものから並べ、見本の絵を見せる） */}
      <section className={e.charts} id="chart-library" aria-labelledby="entry-chart">
        <div className={e.sectionHead}>
          <p className={e.num}>03</p>
          <div>
            <h2 id="entry-chart" className={e.h2}>{t('entry.chart.title')}</h2>
            <p className={e.desc}>{t('entry.chart.desc')}</p>
          </div>
        </div>
        <ul className={e.catalog}>
          {CATALOG_ORDER.filter((c) => chartHasRecipes(c)).slice(0, chartsOpen ? undefined : CATALOG_FIRST).map((c) => (
            <li key={c}>
              <button type="button" className={e.catalogCard} onClick={() => onChart(c)}>
                <span className={e.catalogThumb} aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbs[c] ?? '' }} />
                <span className={e.catalogName}>
                  <b>{L(registry.charts[c].label)}</b>
                  <small>{paren(shortPurpose(L(registry.purposes[registry.charts[c].purpose].label)), locale)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!chartsOpen && CATALOG_ORDER.filter((c) => chartHasRecipes(c)).length > CATALOG_FIRST && (
          <button type="button" className={e.linkBtn} onClick={() => { setChartsOpen(true); track('start_chart_library_opened', { loggedIn: !!auth.session, oncePerPage: true }); }}>
            {t('entry.chart.showAll', { n: CATALOG_ORDER.filter((c) => chartHasRecipes(c)).length })}
          </button>
        )}
        <p className={e.small}>{t('entry.chart.dummy')}</p>
      </section>
    </div>
  );
}

/** 今月の AI 相談の残り回数。使い切ったら、ルール版で続けられることも伝える */
export function QuotaLine({ quota, className }: { quota: ConsultQuota; className?: string }) {
  const t = useT();
  if (quota.limit == null) return <p className={className ?? e.quota}>{t('quota.unlimited')}</p>;
  const out = quota.remaining === 0;
  return (
    <p className={`${className ?? e.quota} ${out ? e.quotaOut : ''}`} aria-live="polite">
      {t('quota.remaining', { n: quota.remaining ?? 0, limit: quota.limit })}
      <span className={e.quotaNote}>{out ? t('quota.out') : t('quota.reset')}</span>
    </p>
  );
}
