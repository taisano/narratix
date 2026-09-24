'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { MessageKey } from '@/i18n/ui';

const KEY = 'chart-advisor:split';
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.88;
const STEP = 0.05;

/** スライドとデータの大きさの切り替え（スライドが占める割合） */
export const SPLIT_PRESETS: { key: MessageKey; value: number }[] = [
  { key: 'pane.slideLarge', value: 0.8 },
  { key: 'pane.even', value: 0.55 },
  { key: 'pane.dataLarge', value: 0.3 },
];
const DEFAULT = 0.62;

export const clampSplit = (v: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v));

/**
 * 右側（スライドとデータ）を上下に分ける境目。ドラッグ・矢印キー・ボタンで動かし、このブラウザに覚えておく。
 * ダブルクリックで半々に戻す。
 */
export function useSplit() {
  const [value, setValue] = useState(DEFAULT);
  const ref = useRef<HTMLElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(KEY));
      if (Number.isFinite(v) && v > 0) setValue(clampSplit(v));
    } catch { /* 保存がなくても動く */ }
  }, []);

  const set = useCallback((v: number) => {
    const next = clampSplit(v);
    setValue(next);
    try { localStorage.setItem(KEY, String(next)); } catch { /* 何もしない */ }
  }, []);

  const fromPointer = (clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0) set((clientY - r.top) / r.height);
  };

  const handleProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => { if (dragging.current) fromPointer(e.clientY); },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      dragging.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onDoubleClick: () => set(0.55),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const map: Record<string, number> = { ArrowUp: value - STEP, ArrowDown: value + STEP, Home: SPLIT_MIN, End: SPLIT_MAX };
      if (e.key in map) { e.preventDefault(); set(map[e.key]!); }
    },
  };

  const style: CSSProperties = { gridTemplateRows: `minmax(0, ${value}fr) auto minmax(0, ${1 - value}fr)` };
  return { value, set, ref, handleProps, style };
}
