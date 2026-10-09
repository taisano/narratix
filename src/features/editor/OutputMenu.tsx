'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import css from '../ui.module.css';

/**
 * ヘッダーの「出力」：押すとメニューが開き、PPT を出力する／メールで送る を選ぶ（今後 Excel データ入りの ZIP などもここに足せる）。
 * 外を押すか Esc で閉じる。出力できない間（スライドが無い・確認待ち）は項目を押せない
 */
export function OutputMenu({ disabled, busy, title, onDownload, onSend, up = false, wrapClass, buttonClass }: {
  disabled: boolean; busy: boolean; title?: string; onDownload: () => void; onSend: () => void;
  /** 下の固定バーで使う時：メニューを上に開く */
  up?: boolean; wrapClass?: string; buttonClass?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [open]);
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <span className={`${css.outWrap} ${wrapClass ?? ''}`} ref={ref}>
      <button type="button" className={buttonClass ?? css.primary} disabled={disabled} aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen((o) => !o)}>
        {busy ? t('action.downloading') : t('action.output')} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <span className={`${css.outMenu} ${up ? css.outMenuUp : ''}`} role="menu">
          <button type="button" role="menuitem" onClick={pick(onDownload)}>{t('action.downloadPptx')}</button>
          <button type="button" role="menuitem" onClick={pick(onSend)}>{t('share.button')}</button>
        </span>
      )}
    </span>
  );
}
