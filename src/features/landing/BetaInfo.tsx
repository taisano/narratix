'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import { FREE_CONSULT_PER_MONTH, FREE_PPT_PER_MONTH } from '@/lib/repo/beta';
import css from './landing.module.css';

/** 「ベータ版について詳しく」：無料で使える範囲と、利用条件・プライバシーの要点（登録画面と同じ文） */
export function BetaInfoButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" className={css.textLink} onClick={() => setOpen(true)}>{t('landing.beta.more')}</button>
      <dialog ref={ref} className={css.dialog} onClose={() => setOpen(false)} aria-labelledby="beta-info-title">
        <h2 id="beta-info-title" className={css.h3}>{t('landing.beta.dialogTitle')}</h2>
        <p className={css.bodySm}>{t('beta.lead')}</p>
        <ul className={css.dialogList}>
          <li>{t('beta.free.consult', { n: FREE_CONSULT_PER_MONTH })}</li>
          <li>{t('beta.free.ppt', { n: FREE_PPT_PER_MONTH })}</li>
          <li>{t('beta.free.save')}</li>
        </ul>
        <h3 className={css.dialogSub}>{t('beta.termsSummary')}</h3>
        <ul className={css.dialogList}>
          {(['t1', 't2', 't3', 't4', 't5'] as const).map((k) => <li key={k}>{t(`beta.terms.${k}`)}</li>)}
        </ul>
        <div className={css.dialogButtons}>
          <button type="button" className={css.secondary} onClick={() => setOpen(false)}>{t('account.close')}</button>
        </div>
      </dialog>
    </>
  );
}
