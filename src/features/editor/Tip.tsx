'use client';

import { useId, useState, type ReactNode } from 'react';
import css from '../ui.module.css';

/**
 * 画面をすっきりさせるための「押すと出る説明」（docs/decisions.md「サイドバーを i と C で整理」）。
 * ・info（i）：知っていれば便利な説明。灰色の小さな i
 * ・coach（C）：そのまま進めると意図どおりにならないこと（見本のままなど）。色つきの短い札「C 見本のまま」。
 *   押すと、理由と直し方（ボタン）を出す。長い文はいつも出しておかない
 * ボタンと説明は別の場所に置けるよう、フックで返す（ボタンは見出しの横、説明は入力欄の下）
 */
export function useTip(kind: 'info' | 'coach', label: string, short?: string) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = (
    <button type="button" className={kind === 'info' ? css.infoBtn : css.coachBtn} aria-label={short ? `${short}：${label}` : label}
      aria-expanded={open} aria-controls={id} title={label} onClick={() => setOpen((v) => !v)}>
      {kind === 'info' ? 'i' : <><b aria-hidden="true">C</b>{short && <span>{short}</span>}</>}
    </button>
  );
  const panel = (children: ReactNode) => (open ? <div id={id} className={kind === 'info' ? css.infoText : css.coachText} role={kind === 'coach' ? 'note' : undefined}>{children}</div> : null);
  return { open, button, panel };
}

/** 見出し＋ i（説明はその下）。よく使う形 */
export function InfoLabel({ text, label, children, className }: { text: ReactNode; label: string; children: ReactNode; className?: string }) {
  const tip = useTip('info', label);
  return (
    <div className={className}>
      <span className={css.headRow}>{text}{tip.button}</span>
      {tip.panel(children)}
    </div>
  );
}
