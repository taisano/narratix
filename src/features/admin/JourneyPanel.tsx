'use client';

import { useMemo, useState } from 'react';
import { useT, type MessageKey } from '@/i18n/ui';
import type { JourneyRow } from '@/lib/repo/admin';
import { chartStats, crossUsers, frequencyByUser, groupFlows, groupMetrics, metricsOf, toCsv, type FreqBucket, type GroupRow } from './journeyStats';
import css from './admin.module.css';

const SHOWN_FLOWS = 50;
const date = (iso: string) => new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'medium' });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** 利用の流れ：同意した人の記録の集計（職種・きっかけ・使用頻度ごと）と、1つ1つの流れ。管理者だけ */
export function JourneyPanel({ rows }: { rows: JourneyRow[] | null }) {
  const t = useT();
  const [view, setView] = useState<'stats' | 'flows'>('stats');
  const data = useMemo(() => {
    if (!rows) return null;
    const freq = frequencyByUser(rows);
    return {
      total: metricsOf(rows),
      byOcc: groupMetrics(rows, (r) => (r.occupation || 'unknown')),
      byRef: groupMetrics(rows, (r) => (r.referral || 'unknown')),
      byFreq: groupMetrics(rows, (r) => freq.get(r.anon_id) ?? 'd1'),
      cross: crossUsers(rows, (r) => r.occupation || 'unknown', (r) => r.referral || 'unknown'),
      charts: chartStats(rows),
      flows: groupFlows(rows),
    };
  }, [rows]);

  if (!rows || !data) return <p>{t('my.loading')}</p>;
  if (!rows.length) return <p className={css.empty}>{t('admin.j.empty')}</p>;

  const occ = (k: string) => (k === 'unknown' ? t('admin.j.unknown') : t(`beta.survey.occupation.${k}` as MessageKey));
  const ref = (k: string) => (k === 'unknown' ? t('admin.j.unknown') : t(`beta.survey.referral.${k}` as MessageKey));
  const freq = (k: string) => t(`admin.j.freq.${k as FreqBucket}` as MessageKey);

  function download() {
    const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows!)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `journey-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className={css.lead}>{t('admin.j.lead', { n: rows.length })}</p>
      <div className={css.subtabs} role="group">
        <button type="button" aria-pressed={view === 'stats'} onClick={() => setView('stats')}>{t('admin.j.viewStats')}</button>
        <button type="button" aria-pressed={view === 'flows'} onClick={() => setView('flows')}>{t('admin.j.viewFlows')}（{data.flows.length}）</button>
        <button type="button" className={css.csvBtn} onClick={download}>{t('admin.j.csv')}</button>
      </div>
      {view === 'stats' ? (
        <>
          <ul className={css.cards}>
            {([['users', data.total.users], ['flows', data.total.flows], ['consults', data.total.consults], ['saves', data.total.saves], ['exports', data.total.exports]] as const).map(([k, v]) => (
              <li key={k}><b>{v}</b><span>{t(`admin.j.m.${k}` as MessageKey)}</span></li>
            ))}
            <li><b>{pct(data.total.pickedRecommended, data.total.picked)}</b><span>{t('admin.j.m.recommended')}</span></li>
          </ul>
          <Group title={t('admin.j.byOcc')} rows={data.byOcc} label={occ} />
          <Group title={t('admin.j.byRef')} rows={data.byRef} label={ref} />
          <Group title={t('admin.j.byFreq')} rows={data.byFreq} label={freq} />
          <h3 className={css.h3}>{t('admin.j.cross')}</h3>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead><tr><th />{data.cross.cols.map((c) => <th key={c}>{ref(c)}</th>)}</tr></thead>
              <tbody>{data.cross.rows.map((r) => (
                <tr key={r}><th scope="row">{occ(r)}</th>{data.cross.cols.map((c) => <td key={c}>{data.cross.n[`${r}|${c}`] ?? ''}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          <h3 className={css.h3}>{t('admin.j.charts')}</h3>
          <p className={css.lead}>{t('admin.j.complementRate', { rate: pct(data.charts.withComplement, data.charts.saves), n: data.charts.saves })}</p>
          <p>{data.charts.charts.map(([k, n]) => `${k} ${n}`).join(' ／ ') || '—'}</p>
          <p>{data.charts.complements.map(([k, n]) => `${k} ${n}`).join(' ／ ') || '—'}</p>
        </>
      ) : (
        <ul className={css.list}>
          {data.flows.slice(0, SHOWN_FLOWS).map((f) => (
            <li key={f.key} className={css.item}>
              <div className={css.meta}>
                <b>{f.anon.slice(0, 6)}</b>
                <span>{date(f.start)}</span>
                <span>{f.occupation ? occ(f.occupation) : t('admin.j.unknown')}</span>
                <span>{f.referral ? ref(f.referral) : t('admin.j.unknown')}</span>
              </div>
              <ol className={css.timeline}>
                {f.events.map((e) => (
                  <li key={e.id}>
                    <time>{new Date(e.occurred_at).toLocaleTimeString('ja-JP')}</time>
                    <span><EventLine e={e} /></span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
          {data.flows.length > SHOWN_FLOWS && <li className={css.empty}>{t('admin.j.more', { n: SHOWN_FLOWS })}</li>}
        </ul>
      )}
    </div>
  );
}

function Group({ title, rows, label }: { title: string; rows: GroupRow[]; label: (k: string) => string }) {
  const t = useT();
  return (
    <>
      <h3 className={css.h3}>{title}</h3>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead><tr><th />{(['users', 'flows', 'consults', 'saves', 'exports', 'recommended'] as const).map((k) => <th key={k}>{t(`admin.j.m.${k}` as MessageKey)}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{label(r.key)}</th>
              <td>{r.metrics.users}</td><td>{r.metrics.flows}</td><td>{r.metrics.consults}</td><td>{r.metrics.saves}</td><td>{r.metrics.exports}</td>
              <td>{pct(r.metrics.pickedRecommended, r.metrics.picked)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function EventLine({ e }: { e: JourneyRow }) {
  const t = useT();
  const p = e.payload;
  const list = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[]).join(', ') : '');
  if (e.kind === 'consult') return <><b>{t('admin.j.k.consult')}</b> <q className={css.q}>{String(p.text ?? '')}</q> <small>{[p.classifier, p.entry, p.mode, list('recipes')].filter(Boolean).join(' / ')}</small></>;
  if (e.kind === 'chart_saved') return <><b>{t('admin.j.k.saved')}</b> <small>{t('admin.j.shape', { slides: String(p.slides ?? '-'), rows: String(p.rows ?? '-'), cols: String(p.cols ?? '-'), periods: String(p.periods ?? '-') })} / {list('charts')} / {list('recipes')} / {list('complements') || '—'}</small></>;
  if (e.kind === 'export') return <b>{t('admin.j.k.export', { slides: String(p.slides ?? '-') })}</b>;
  return <small>{String(p.name ?? e.kind)}{p.detail ? ` · ${String(p.detail)}` : ''}</small>;
}
