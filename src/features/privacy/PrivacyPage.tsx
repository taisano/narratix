'use client';

import Link from 'next/link';
import { useT, type MessageKey } from '@/i18n/ui';
import { FeedbackButton } from '../feedback/Feedback';
import css from './privacy.module.css';

/**
 * データの取り扱い（ベータ版）。今の作りで守れていることだけを書く（docs/decisions.md）。
 * 詳しい法的な文書（プライバシーポリシー）は、一般公開の前に専門家に確認してもらう
 */
const SECTIONS: { key: string; items: number }[] = [
  { key: 'data', items: 4 },
  { key: 'consult', items: 3 },
  { key: 'operator', items: 2 },
  { key: 'improve', items: 3 },
  { key: 'account', items: 4 },
];

export default function PrivacyPage() {
  const t = useT();
  return (
    <main className={css.wrap}>
      <p className={css.kicker}>BETA</p>
      <h1 className={css.h1}>{t('privacy.title')}</h1>
      <p className={css.lead}>{t('privacy.lead')}</p>
      <ul className={css.points}>
        {([1, 2, 3] as const).map((n) => <li key={n}>{t(`privacy.point${n}` as MessageKey)}</li>)}
      </ul>
      {SECTIONS.map((s) => (
        <section key={s.key} className={css.section} aria-labelledby={`pv-${s.key}`}>
          <h2 id={`pv-${s.key}`} className={css.h2}>{t(`privacy.${s.key}.title` as MessageKey)}</h2>
          <ul className={css.list}>
            {Array.from({ length: s.items }, (_, i) => <li key={i}>{t(`privacy.${s.key}.${i + 1}` as MessageKey)}</li>)}
          </ul>
        </section>
      ))}
      <p className={css.note}>{t('privacy.betaNote')}</p>
      <p className={css.note}>{t('privacy.contact')} <FeedbackButton className={css.linkBtn} source="privacy" /></p>
      <p className={css.note}><Link href="/start" className={css.linkBtn}>{t('privacy.back')}</Link></p>
    </main>
  );
}
