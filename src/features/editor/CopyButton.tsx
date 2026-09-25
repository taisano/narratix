'use client';

import { useState } from 'react';
import { useT } from '@/i18n/ui';
import css from './grid.module.css';

/** 表をタブ区切りでクリップボードに入れる（Excel やスプレッドシートにそのまま貼れる） */
export function CopyButton({ text, label }: { text: () => string; label: string }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');
  const copy = async () => {
    const s = text();
    try {
      await navigator.clipboard.writeText(s);
      setState('done');
    } catch {
      // 古いブラウザ・権限がない時：隠した入力欄を選んでコピー
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      setState(ok ? 'done' : 'error');
    }
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => void copy()}>{label}</button>
      {state === 'done' && <span className={css.copied} role="status">{t('grid.copied')}</span>}
      {state === 'error' && <span className={css.longNote} role="status">{t('grid.copyFailed')}</span>}
    </>
  );
}
