'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import { previewSvg } from '../editor/preview';
import { viewOf, type ProjectState } from '../editor/project';
import v from './viewer.module.css';

/**
 * 「見る」：チャート・ストーリーのスライドを、画面いっぱいに1枚ずつ大きく見せる（流れを見るため）。
 * 次へ・前へは ‹ ›・矢印キー・横スワイプ。右上の × か Esc で閉じる。スマホではブラウザの全画面にする（できる時だけ）。
 * 描くのは今の枚と前後の1枚だけ（重くならないように）
 */
export function SlideViewer({ project, title, start = 0, onClose }: { project: ProjectState; title: string; start?: number; onClose: () => void }) {
  const t = useT();
  const total = project.slides.length;
  const [at, setAt] = useState(Math.max(0, Math.min(total - 1, start)));
  const [seen, setSeen] = useState<Set<number>>(() => new Set([at - 1, at, at + 1].filter((i) => i >= 0 && i < total)));
  const root = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const svgs = useMemo(() => {
    const out = new Map<number, string | null>();
    for (const i of seen) { try { out.set(i, previewSvg(viewOf(project, i))); } catch { out.set(i, null); } }
    return out;
  }, [project, seen]);

  const go = (i: number, smooth = true) => {
    const el = strip.current;
    const k = Math.max(0, Math.min(total - 1, i));
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  };
  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (k !== at) setAt(k);
    const want = [k - 1, k, k + 1].filter((i) => i >= 0 && i < total && !seen.has(i));
    if (want.length) setSeen((prev) => new Set([...prev, ...want]));
  };

  useEffect(() => {
    // 開いた枚へ（アニメーションなし）。後ろの画面はスクロールさせない
    go(at, false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // スマホ：ブラウザの全画面にする（対応していない時はこのまま画面いっぱいの重ね表示）
    const phone = window.matchMedia('(max-width: 700px)').matches;
    if (phone && root.current?.requestFullscreen && !document.fullscreenElement) root.current.requestFullscreen().catch(() => {});
    root.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 全画面を Esc などで抜けた時は、見る画面も閉じる
  useEffect(() => {
    let was = false;
    const onFs = () => { if (document.fullscreenElement) was = true; else if (was) onClose(); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, onClose]);
  // 画面の向き・大きさが変わったら、今の枚に合わせ直す
  useEffect(() => {
    const fit = () => go(at, false);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  return (
    <div ref={root} className={v.overlay} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <div className={v.head}>
        <b className={v.title}>{title}</b>
        <button type="button" className={v.close} aria-label={t('account.close')} title={t('account.close')} onClick={onClose}>×</button>
      </div>
      <div className={v.stage}>
        <div ref={strip} className={v.strip} onScroll={onScroll}>
          {Array.from({ length: total }, (_, i) => {
            const svg = svgs.get(i);
            return (
              <div key={i} className={v.item} aria-hidden={i !== at} aria-label={t('my.slideAt', { n: i + 1, total })}>
                <div className={v.frame}>
                  {svg ? <div className={v.svg} dangerouslySetInnerHTML={{ __html: svg }} /> : svg === null ? <span className={v.none}>{t('my.thumbError')}</span> : <span className={v.none} />}
                </div>
              </div>
            );
          })}
        </div>
        {at > 0 && <button type="button" className={`${v.nav} ${v.prev}`} aria-label={t('my.prevSlide')} onClick={() => go(at - 1)}>‹</button>}
        {at < total - 1 && <button type="button" className={`${v.nav} ${v.next}`} aria-label={t('my.nextSlide')} onClick={() => go(at + 1)}>›</button>}
      </div>
      <div className={v.foot} aria-live="polite">
        {t('my.slideAt', { n: at + 1, total })}
        {/* スマホを縦に持っている時だけ：横にすると大きく見られる */}
        <span className={v.rotate}>{t('my.rotateHint')}</span>
      </div>
    </div>
  );
}
