'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useT } from '@/i18n/ui';
import { getPlanInterest, getPlanOverview, setPlanLimits, setUserPlan, type PlanInterest, type PlanOverview } from '@/lib/repo/admin';
import { PLAN_NAMES } from '@/lib/ai/plans';
import { useAuth } from '../shell/AppShell';
import css from './admin.module.css';

const FEELS = ['high', 'fair', 'low', 'none'] as const;
const PLANS = ['pro', 'team'] as const;
const planName = (p: string) => (p === 'pro' || p === 'team' || p === 'free' ? PLAN_NAMES[p].ja : p);

/** プラン：関心と価格感の集計、手動でのプラン切り替え（手動入金の運用）、無料枠の回数 */
export function PlansPanel() {
  const t = useT();
  const auth = useAuth();
  const [interest, setInterest] = useState<PlanInterest | null>(null);
  const [ov, setOv] = useState<PlanOverview | null>(null);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro' | 'team'>('pro');
  const [lim, setLim] = useState({ freeSlide: '', plusSlide: '', freeExport: '', plusExport: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!auth.client) return;
    try {
      const [i, o] = await Promise.all([getPlanInterest(auth.client), getPlanOverview(auth.client)]);
      setInterest(i); setOv(o); setLim({ freeSlide: String(o.settings.free_slide_limit), plusSlide: String(o.settings.plus_slide_limit), freeExport: String(o.settings.free_export_limit), plusExport: String(o.settings.plus_export_limit) });
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auth.client]);

  async function change(e: FormEvent) {
    e.preventDefault();
    if (!auth.client || !email.trim()) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const ok = await setUserPlan(auth.client, email.trim(), plan);
      setMsg(ok ? t('admin.plans.changed', { email: email.trim(), plan: planName(plan) }) : t('admin.plans.notFound'));
      if (ok) { setEmail(''); await load(); }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function limits(e: FormEvent) {
    e.preventDefault();
    const v = { freeSlide: Math.round(Number(lim.freeSlide)), plusSlide: Math.round(Number(lim.plusSlide)), freeExport: Math.round(Number(lim.freeExport)), plusExport: Math.round(Number(lim.plusExport)) };
    if (!auth.client || Object.values(v).some((x) => !Number.isFinite(x) || x < 0)) return;
    setBusy(true); setError(null); setMsg(null);
    try { await setPlanLimits(auth.client, v); setMsg(t('admin.plans.limitsSaved')); await load(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!interest || !ov) return error ? <p className={css.error} role="alert">{error}</p> : <p>{t('my.loading')}</p>;
  const n = (plan: string, feel: string) => interest.byFeel.filter((r) => r.plan === plan && r.feel === feel).reduce((a, r) => a + r.n, 0);
  const feelLabel = (f: (typeof FEELS)[number]) => (f === 'none' ? t('admin.plans.feelNone') : t(`plans.feel.${f}`));
  return (
    <div>
      <h3 className={css.h3}>{t('admin.plans.interest')}</h3>
      <ul className={css.cards}>
        <li><b>{interest.users}</b><span>{t('admin.plans.users')}</span></li>
        {PLANS.map((p) => <li key={p}><b>{interest.byPlan[p] ?? 0}</b><span>{planName(p)}</span></li>)}
      </ul>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead><tr><th>{t('admin.plans.plan')}</th>{FEELS.map((f) => <th key={f}>{feelLabel(f)}</th>)}</tr></thead>
          <tbody>{PLANS.map((p) => <tr key={p}><th scope="row">{planName(p)}</th>{FEELS.map((f) => <td key={f}>{n(p, f)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className={css.note}>{t('admin.plans.interestNote')}</p>

      <h3 className={css.h3}>{t('admin.plans.change')}</h3>
      <form onSubmit={change} className={css.capForm}>
        <label>{t('admin.plans.email')}<input type="email" className={css.sortInput} value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>{t('admin.plans.plan')}
          <select className={css.sortInput} value={plan} onChange={(e) => setPlan(e.target.value as 'free' | 'pro' | 'team')}>
            {(['free', 'pro', 'team'] as const).map((p) => <option key={p} value={p}>{planName(p)}</option>)}
          </select>
        </label>
        <button type="submit" className={css.csvBtnPlain} disabled={busy}>{t('admin.plans.apply')}</button>
      </form>
      <p className={css.note}>{t('admin.plans.changeNote')}</p>
      {msg && <p className={css.message} role="status">{msg}</p>}
      {error && <p className={css.error} role="alert">{error}</p>}
      {ov.paid.length > 0 && (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr><th>{t('admin.plans.email')}</th><th>{t('admin.plans.plan')}</th></tr></thead>
            <tbody>{ov.paid.map((r, i) => <tr key={i}><th scope="row">{r.email ?? '—'}</th><td>{planName(r.plan)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <h3 className={css.h3}>{t('admin.plans.limits')}</h3>
      <form onSubmit={limits} className={css.capForm}>
        <label>{t('admin.plans.limitFreeSlide')}<input type="number" className={css.sortInput} value={lim.freeSlide} min={0} max={100000} onChange={(e) => setLim({ ...lim, freeSlide: e.target.value })} /></label>
        <label>{t('admin.plans.limitPlusSlide')}<input type="number" className={css.sortInput} value={lim.plusSlide} min={0} max={100000} onChange={(e) => setLim({ ...lim, plusSlide: e.target.value })} /></label>
        <label>{t('admin.plans.limitFreeExport')}<input type="number" className={css.sortInput} value={lim.freeExport} min={0} max={100000} onChange={(e) => setLim({ ...lim, freeExport: e.target.value })} /></label>
        <label>{t('admin.plans.limitPlusExport')}<input type="number" className={css.sortInput} value={lim.plusExport} min={0} max={100000} onChange={(e) => setLim({ ...lim, plusExport: e.target.value })} /></label>
        <button type="submit" className={css.csvBtnPlain} disabled={busy}>{t('admin.plans.apply')}</button>
      </form>
      <p className={css.note}>{t('admin.plans.limitsNote', { day1: ov.settings.daily_slide, day2: ov.settings.daily_story })}</p>
    </div>
  );
}
