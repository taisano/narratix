'use client';

import { useEffect, useState, type ReactNode } from 'react';
import css from '../ui.module.css';

const KEY = 'chart-advisor:folds';

function readFolds(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}

/**
 * 見出しで開け閉めできるサイドバーの欄。開閉はこのブラウザに覚えておく
 * （使わない欄を閉じておけば、サイドバーを長くスクロールしなくて済む）。
 */
export function Fold({ id, title, defaultOpen = true, children }: { id: string; title: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const v = readFolds()[id];
    if (typeof v === 'boolean') setOpen(v);
  }, [id]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(KEY, JSON.stringify({ ...readFolds(), [id]: next })); } catch { /* 保存できなくても動く */ }
  };
  return (
    <details className={css.fold} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) toggle(o); }}>
      <summary className={css.foldHead}><h2>{title}</h2></summary>
      <div className={css.foldBody}>{children}</div>
    </details>
  );
}
