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

/** いくつかの中から選ぶ確認（例：表の型を替える時、今の表から作る／前の中身に戻す／見本から作る） */
export interface ChooseOptions {
  title: string;
  body?: string;
  choices: { value: string; label: string; note?: string }[];
}

type Req = { title: string; body?: string; ok?: string; danger?: boolean; choices?: ChooseOptions['choices']; resolve: (v: string | null) => void };
const ConfirmContext = createContext<((o: Omit<Req, 'resolve'>) => Promise<string | null>) | null>(null);

export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const c = useContext(ConfirmContext);
  // 枠の外（テストなど）では、ブラウザの確認で代わりにする
  if (!c) return async (o) => (typeof window !== 'undefined' ? window.confirm(`${o.title}\n${o.body ?? ''}`) : true);
  return async (o) => (await c(o)) === 'ok';
}

/** 選んだ値（やめたら null） */
export function useChoose(): (o: ChooseOptions) => Promise<string | null> {
  const c = useContext(ConfirmContext);
  if (!c) return async (o) => o.choices[0]?.value ?? null;
  return (o) => c(o);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [req, setReq] = useState<Req | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirm = useCallback((o: Omit<Req, 'resolve'>) => new Promise<string | null>((resolve) => setReq({ ...o, resolve })), []);
  const close = (v: string | null) => { req?.resolve(v); setReq(null); };
  useEffect(() => {
    if (!req) return;
    cancelRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <div className={cf.overlay} onClick={() => close(null)}>
          <div className={cf.box} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.body ? 'confirm-body' : undefined} onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className={cf.title}>{req.title}</h2>
            {req.body && <p id="confirm-body" className={cf.body}>{req.body}</p>}
            {req.choices && (
              <div className={cf.choices}>
                {req.choices.map((c) => (
                  <button key={c.value} type="button" className={cf.choice} onClick={() => close(c.value)}>
                    <b>{c.label}</b>{c.note && <small>{c.note}</small>}
                  </button>
                ))}
              </div>
            )}
            <div className={cf.buttons}>
              <button ref={cancelRef} type="button" className="btn" onClick={() => close(null)}>{t('confirm.cancel')}</button>
              {!req.choices && <button type="button" className={req.danger ? cf.danger : css.primary} onClick={() => close('ok')}>{req.ok}</button>}
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
