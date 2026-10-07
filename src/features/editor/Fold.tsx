'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import css from '../ui.module.css';

const KEY = 'chart-advisor:folds';

function readFolds(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}

/**
 * 見出しで開け閉めできるサイドバーの欄。開閉はこのブラウザに覚えておく
 * （使わない欄を閉じておけば、サイドバーを長くスクロールしなくて済む）。
 */
export function Fold({ id, title, defaultOpen = true, closeSignal, openSignal, children }: {
  id: string; title: ReactNode; defaultOpen?: boolean;
  /** この値が変わったら閉じる（選んだ後に欄を畳む。開閉の記憶は変えない） */
  closeSignal?: unknown;
  /** この値が変わったら開く（「編集対象」で選んだ欄へ誘導する。開閉の記憶は変えない＝ユーザーが畳んでも次回は畳んだまま） */
  openSignal?: unknown;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const first = useRef(true);
  const firstOpen = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOpen(false);
  }, [closeSignal]);
  useEffect(() => {
    if (firstOpen.current) { firstOpen.current = false; return; }
    setOpen(true);
  }, [openSignal]);
  useEffect(() => {
    const v = readFolds()[id];
    if (typeof v === 'boolean') setOpen(v);
  }, [id]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(KEY, JSON.stringify({ ...readFolds(), [id]: next })); } catch { /* 保存できなくても動く */ }
  };
  return (
    <details id={`fold-${id}`} className={css.fold} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) toggle(o); }}>
      <summary className={css.foldHead}><h2>{title}</h2></summary>
      <div className={css.foldBody}>{children}</div>
    </details>
  );
}
