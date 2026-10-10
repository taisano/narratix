'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useT, type MessageKey } from '@/i18n/ui';
import { getBetaOverview, setBetaCap, type BetaOverview } from '@/lib/repo/admin';
import { useAuth } from '../shell/AppShell';
import css from './admin.module.css';

const date = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { dateStyle: 'medium' });

/** ベータの枠：人数・順番待ちの一覧・枠の変更（空いた分は、登録の早い順に自動で繰り上げ）。繰り上げた人のメールは、ご案内用に表示する */
export function BetaCapPanel() {
  const t = useT();
  const auth = useAuth();
  const [ov, setOv] = useState<BetaOverview | null>(null);
  const [cap, setCap] = useState('');
  const [promoted, setPromoted] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!auth.client) return;
    getBetaOverview(auth.client).then((o) => { setOv(o); setCap(String(o.cap)); }).catch((e: Error) => setError(e.message));
  }, [auth.client]);

  async function apply(e: FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(cap));
    if (!auth.client || !Number.isFinite(n) || n < 0) return;
    setBusy(true); setError(null);
    try {
      const r = await setBetaCap(auth.client, n);
      setPromoted(r.promoted);
      setOv(await getBetaOverview(auth.client));
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    if (!promoted) return;
    try { await navigator.clipboard.writeText(promoted.join(', ')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* コピーできなかった時は、表示した文字を選んで使う */ }
  }

  if (!ov) return error ? <p className={css.error} role="alert">{error}</p> : <p>{t('my.loading')}</p>;
  const occ = (k: string) => (k === 'unknown' ? t('admin.j.unknown') : t(`beta.survey.occupation.${k}` as MessageKey));
  const ref = (k: string) => (k === 'unknown' ? t('admin.j.unknown') : t(`beta.survey.referral.${k}` as MessageKey));
  return (
    <div>
      <ul className={css.cards}>
        <li><b>{ov.cap}</b><span>{t('admin.cap.cap')}</span></li>
        <li><b>{ov.active}</b><span>{t('admin.cap.active')}</span></li>
        <li><b>{ov.waitlist}</b><span>{t('admin.cap.waitlist')}</span></li>
      </ul>
      <form onSubmit={apply} className={css.capForm}>
        <label>{t('admin.cap.change')}<input type="number" className={css.sortInput} value={cap} min={0} max={100000} onChange={(e) => setCap(e.target.value)} /></label>
        <button type="submit" className={css.csvBtnPlain} disabled={busy}>{t('admin.cap.apply')}</button>
      </form>
      <p className={css.note}>{t('admin.cap.note')}</p>
      {error && <p className={css.error} role="alert">{error}</p>}
      {promoted && (
        <div className={css.item}>
          <p className={css.message}><b>{t('admin.cap.promoted', { n: promoted.length })}</b></p>
          {promoted.length > 0 && (
            <>
              <p className={css.note}>{t('admin.cap.promotedNote')}</p>
              <textarea readOnly className={css.emails} rows={3} value={promoted.join(', ')} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className={css.csvBtnPlain} onClick={copy}>{copied ? t('share.service.copied') : t('admin.cap.copy')}</button>
            </>
          )}
        </div>
      )}
      <h3 className={css.h3}>{t('admin.cap.queue')}</h3>
      {ov.queue.length === 0 ? <p className={css.empty}>{t('admin.cap.queueEmpty')}</p> : (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr><th>#</th><th>{t('admin.cap.joined')}</th><th>{t('beta.survey.occupation')}</th><th>{t('beta.survey.referral')}</th></tr></thead>
            <tbody>{ov.queue.map((q) => <tr key={q.pos}><td>{q.pos}</td><td>{date(q.joined_at)}</td><th scope="row">{occ(q.occupation)}</th><th scope="row">{ref(q.referral)}</th></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
