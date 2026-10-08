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
export function Fold({ id, title, defaultOpen = true, closeSignal, compact = false, compactOpen = false, onCompactToggle, children }: {
  id: string; title: ReactNode; defaultOpen?: boolean;
  /** この値が変わったら閉じる（選んだ後に欄を畳む。開閉の記憶は変えない） */
  closeSignal?: unknown;
  /** コンパクト表示では親が開く欄を1つだけ管理する。 */
  compact?: boolean; compactOpen?: boolean; onCompactToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOpen(false);
  }, [closeSignal]);
  useEffect(() => {
    const v = readFolds()[id];
    if (typeof v === 'boolean') setOpen(v);
  }, [id]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(KEY, JSON.stringify({ ...readFolds(), [id]: next })); } catch { /* 保存できなくても動く */ }
  };
  const shownOpen = compact ? compactOpen : open;
  return (
    <details id={`fold-${id}`} className={css.fold} open={shownOpen} onToggle={(e) => {
      const o = (e.currentTarget as HTMLDetailsElement).open;
      if (o === shownOpen) return;
      if (compact) onCompactToggle?.(o); else toggle(o);
    }}>
      <summary className={css.foldHead}><h2>{title}</h2></summary>
      <div className={css.foldBody}>{children}</div>
    </details>
  );
}
