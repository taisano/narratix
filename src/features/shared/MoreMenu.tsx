'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import css from '../ui.module.css';

/** 「…」のメニュー（使う頻度の低い操作をまとめる）。外を押すか Esc で閉じる */
export function MoreMenu({ label, items, up = false }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[]; /** 上に開く（はみ出しを切るカードの下端など） */ up?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  // 幅の狭い欄や、はみ出しを切る欄に置いた「…」でも切れないよう、画面に固定して開き、画面の内側に収める
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const btn = ref.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!btn || !m) return;
    const left = Math.max(8, Math.min(btn.right - m.width, window.innerWidth - m.width - 8));
    const top = up ? Math.max(8, btn.top - m.height - 4) : Math.min(btn.bottom + 4, Math.max(8, window.innerHeight - m.height - 8));
    setPos({ top, left });
  }, [open, up]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [open]);
  if (!items.length) return null;
  return (
    <span className={css.moreWrap} ref={ref}>
      <button type="button" className={css.moreBtn} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>…</button>
      {open && (
        <span ref={menuRef} className={`${css.moreMenu} ${up ? css.moreUp : ''}`} style={{ position: 'fixed', zIndex: 1000, right: 'auto', bottom: 'auto', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }} role="menu">
          {items.map((m) => (
            <button key={m.label} type="button" role="menuitem" data-danger={m.danger || undefined} onClick={() => { setOpen(false); m.onClick(); }}>{m.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
