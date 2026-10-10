'use client';

import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { localize, registry, type ChartTypeId } from '@/registry';
import type { Dashboard, Kn } from '@/lib/repo/admin';
import css from './admin.module.css';

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 縦の棒（日ごと・月ごと）。値が0でも棒の場所は出す */
function Bars({ rows, label, title }: { rows: { key: string; n: number }[]; label: (k: string) => string; title: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className={css.bars} role="img" aria-label={title}>
      {rows.map((r, i) => (
        <div key={r.key} className={css.barCol} title={`${label(r.key)}：${r.n}`}>
          <span className={css.barNum}>{r.n || ''}</span>
          <span className={css.bar} style={{ height: `${(r.n / max) * 100}%` }} />
          <span className={css.barLbl}>{i % Math.ceil(rows.length / 10) === 0 || i === rows.length - 1 ? label(r.key) : ''}</span>
        </div>
      ))}
    </div>
  );
}

/** 横の棒（割合）。合計に対する % と件数 */
function Share({ rows, label, total }: { rows: Kn[]; label: (k: string) => string; total: number }) {
  if (!rows.length) return <p className={css.empty}>—</p>;
  return (
    <ul className={css.share}>
      {rows.map((r) => (
        <li key={r.k}>
          <span className={css.shareName}>{label(r.k)}</span>
          <span className={css.shareTrack}><span className={css.shareFill} style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} /></span>
          <span className={css.shareVal}>{pct(r.n, total)}<small>（{r.n}）</small></span>
        </li>
      ))}
    </ul>
  );
}

/** ダッシュボード：登録数・利用者数（日次・月次）・職種の割合・作られた数・チャート種類。件数だけで、中身は見ない */
export function DashboardPanel({ data }: { data: Dashboard | null }) {
  const t = useT();
  const locale = useLocale();
  if (!data) return <p>{t('my.loading')}</p>;
  const today = data.dau[data.dau.length - 1]?.n ?? 0;
  const occ = (k: string) => (k === 'unknown' ? t('admin.j.unknown') : t(`beta.survey.occupation.${k}` as MessageKey));
  const ref = (k: string) => (k === 'unknown' ? t('admin.j.unknown') : t(`beta.survey.referral.${k}` as MessageKey));
  const chart = (k: string) => { const c = registry.charts[k as ChartTypeId]; return c ? localize(c.label, locale) : k; };
  const modeKey: Record<string, MessageKey> = { one_slide: 'entry.mode.one', story: 'entry.mode.story', coach_recommend: 'entry.mode.coach' };
  const mode = (k: string) => (modeKey[k] ? t(modeKey[k]) : k);
  const occTotal = data.by_occupation.reduce((a, r) => a + r.n, 0);
  const chartTotal = data.slides_by_chart.reduce((a, r) => a + r.n, 0);
  const modeTotal = data.creation_modes.reduce((a, r) => a + r.n, 0);
  const cards: [string, string | number][] = [
    [t('admin.d.registered'), data.members.total],
    [t('admin.d.today'), today],
    [t('admin.d.week'), data.active_7d],
    [t('admin.d.month'), data.active_30d],
    [t('admin.d.charts'), data.decks.charts],
    [t('admin.d.stories'), data.decks.stories],
    [t('admin.d.consults'), data.usage.consults],
    [t('admin.d.exports'), data.usage.ppt_exports],
  ];
  return (
    <div>
      <p className={css.lead}>{t('admin.d.lead', { at: new Date(data.generated_at).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
      <ul className={css.cards}>{cards.map(([k, v]) => <li key={k}><b>{v}</b><span>{k}</span></li>)}</ul>
      <p className={css.note}>{t('admin.d.members', { active: data.members.active, waitlist: data.members.waitlist })}</p>

      <h3 className={css.h3}>{t('admin.d.dau')}</h3>
      <Bars rows={data.dau.map((r) => ({ key: r.d, n: r.n }))} label={shortDay} title={t('admin.d.dau')} />
      <h3 className={css.h3}>{t('admin.d.mau')}</h3>
      <Bars rows={data.mau.map((r) => ({ key: r.m, n: r.n }))} label={(k) => `${Number(k.slice(5, 7))}月`} title={t('admin.d.mau')} />
      <h3 className={css.h3}>{t('admin.d.signups')}</h3>
      <Bars rows={data.signups_daily.map((r) => ({ key: r.d, n: r.n }))} label={shortDay} title={t('admin.d.signups')} />

      <div className={css.twoCol}>
        <div><h3 className={css.h3}>{t('admin.j.byOcc')}</h3><Share rows={data.by_occupation} label={occ} total={occTotal} /></div>
        <div><h3 className={css.h3}>{t('admin.j.byRef')}</h3><Share rows={data.by_referral} label={ref} total={occTotal} /></div>
      </div>
      <div className={css.twoCol}>
        <div>
          <h3 className={css.h3}>{t('admin.d.modes')}</h3>
          <Share rows={data.creation_modes} label={mode} total={modeTotal} />
          <p className={css.note}>{t('admin.d.modesNote')}</p>
        </div>
        <div>
          <h3 className={css.h3}>{t('admin.d.chartTypes')}</h3>
          <Share rows={data.slides_by_chart} label={chart} total={chartTotal} />
          <p className={css.note}>{t('admin.d.chartTypesNote', { n: chartTotal })}</p>
        </div>
      </div>
      <p className={css.note}>{t('admin.d.activeNote')}</p>
    </div>
  );
}
