'use client';

import { useEffect, useRef, useState } from 'react';
import css from '../ui.module.css';

/** 「…」のメニュー（使う頻度の低い操作をまとめる）。外を押すか Esc で閉じる */
export function MoreMenu({ label, items, up = false }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[]; /** 上に開く（はみ出しを切るカードの下端など） */ up?: boolean }) {
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
  if (!items.length) return null;
  return (
    <span className={css.moreWrap} ref={ref}>
      <button type="button" className={css.moreBtn} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>…</button>
      {open && (
        <span className={`${css.moreMenu} ${up ? css.moreUp : ''}`} role="menu">
          {items.map((m) => (
            <button key={m.label} type="button" role="menuitem" data-danger={m.danger || undefined} onClick={() => { setOpen(false); m.onClick(); }}>{m.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
