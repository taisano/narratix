'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/i18n/ui';
import css from '../ui.module.css';
import cf from './confirm.module.css';

/**
 * 消す・置き換えるなど、取り返しのつきにくい操作の前の確認。
 * const confirm = useConfirm(); if (await confirm({ title, body, ok })) { … }
 * Esc と「やめる」で取り消し。はじめは「やめる」にフォーカス（Enter で消さないように）
 */
export interface ConfirmOptions {
  title: string;
  body?: string;
  /** 実行ボタンの文言（例：削除する） */
  ok: string;
  /** 赤いボタンにする（削除など） */
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const c = useContext(ConfirmContext);
  // 枠の外（テストなど）では、ブラウザの確認で代わりにする
  return c ?? (async (o) => (typeof window !== 'undefined' ? window.confirm(`${o.title}\n${o.body ?? ''}`) : true));
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), []);
  const close = (v: boolean) => { req?.resolve(v); setReq(null); };
  useEffect(() => {
    if (!req) return;
    cancelRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <div className={cf.overlay} onClick={() => close(false)}>
          <div className={cf.box} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.body ? 'confirm-body' : undefined} onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className={cf.title}>{req.title}</h2>
            {req.body && <p id="confirm-body" className={cf.body}>{req.body}</p>}
            <div className={cf.buttons}>
              <button ref={cancelRef} type="button" className="btn" onClick={() => close(false)}>{t('confirm.cancel')}</button>
              <button type="button" className={req.danger ? cf.danger : css.primary} onClick={() => close(true)}>{req.ok}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
