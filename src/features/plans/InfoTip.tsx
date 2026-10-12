'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import css from './plans.module.css';

/**
 * 項目名の横の「ⓘ」。押す（タップ・Enter・Space）と説明が開く。hover には頼らない。
 * Esc・外側のクリック・閉じるボタンで閉じ、閉じたらアイコンにフォーカスを戻す。
 * 表は横スクロールの枠の中なので、説明は画面に固定（fixed）で出して切れないようにする。
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const t = useT();
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;

  const close = (focus = true) => { setPos(null); if (focus) btn.current?.focus(); };
  const toggle = () => {
    if (open) return close();
    const r = btn.current!.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 32);
    setPos({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 16)) });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const n = e.target as Node;
      if (!pop.current?.contains(n) && !btn.current?.contains(n)) close(false);
    };
    const onMove = () => close(false); // スクロール・サイズ変更でずれるので閉じる
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    pop.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className={css.info} aria-label={t('plans.info.label', { name: label })} aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <div ref={pop} id={id} role="dialog" aria-label={label} className={css.pop} style={{ top: pos.top, left: pos.left }}>
          <p>{text}</p>
          <button type="button" className={css.popClose} onClick={() => close()}>{t('account.close')}</button>
        </div>
      )}
    </>
  );
}
