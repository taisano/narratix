'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/ui';
import css from './update-notice.module.css';

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const EVERY_MS = 10 * 60 * 1000;

/**
 * 新しい版が公開されたら、開いたままの古いタブに知らせる（勝手には再読み込みしない。保存してから押してもらう）。
 * タブに戻った時と、10分ごとに確かめる。開発中（dev）は確かめない
 */
export function UpdateNotice() {
  const t = useT();
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (MINE === 'dev') return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const j = (await r.json()) as { build?: string };
        if (!stop && j.build && j.build !== 'dev' && j.build !== MINE) setStale(true);
      } catch { /* 通信できない時は何もしない */ }
    };
    const id = window.setInterval(check, EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => { stop = true; window.clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (!stale) return null;
  return (
    <div className={css.bar} role="status">
      <span>{t('update.available')}</span>
      <button type="button" className={css.reload} onClick={() => window.location.reload()}>{t('update.reload')}</button>
      <button type="button" className={css.close} aria-label={t('update.later')} onClick={() => setStale(false)}>×</button>
    </div>
  );
}
