'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import css from '../ui.module.css';

/** 「…」のメニュー（使う頻度の低い操作をまとめる）。外を押すか Esc で閉じる */
export function MoreMenu({ label, items, up = false }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[]; /** 上に開く（はみ出しを切るカードの下端など） */ up?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  // 左端で切れる時は、左揃えで開く（幅の狭い左の欄に置いた「…」）
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    if (!open) { setFlip(false); return; }
    const r = menuRef.current?.getBoundingClientRect();
    if (r && r.left < 8) setFlip(true);
  }, [open]);
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
        <span ref={menuRef} className={`${css.moreMenu} ${up ? css.moreUp : ''}`} style={flip ? { left: 0, right: 'auto' } : undefined} role="menu">
          {items.map((m) => (
            <button key={m.label} type="button" role="menuitem" data-danger={m.danger || undefined} onClick={() => { setOpen(false); m.onClick(); }}>{m.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
