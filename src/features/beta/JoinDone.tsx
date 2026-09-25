'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useT } from '@/i18n/ui';
import css from '../ui.module.css';

/** 登録が終わった（または登録済み）：?next= の画面へ戻る（無ければ「新しく作る」） */
export function JoinDone() {
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(next && next.startsWith('/') ? next : '/start');
  }, [router]);
  return <p className={css.note}>{t('my.loading')}</p>;
}
