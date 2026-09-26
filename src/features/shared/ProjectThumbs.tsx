'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import { previewSvg } from '../editor/preview';
import { viewOf, type ProjectState } from '../editor/project';
import th from './thumbs.module.css';

/**
 * プロジェクトの縮小表示（マイページ・Library のカード）。複数枚は、横にスクロール（または ‹ ›）で各スライドを見られる。
 * 見た枚から描く（重くならないように）。href があれば押すと開く、onOpen があれば押した枚数を渡す
 */
export function ProjectThumbs({ project, href, onOpen, label, badge }: {
  project: ProjectState | null; href?: string; onOpen?: (index: number) => void; label: string; badge?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const total = project?.slides.length ?? 0;
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const svgs = useMemo(() => {
    const out = new Map<number, string | null>();
    if (!project) return out;
    for (const i of seen) { try { out.set(i, previewSvg(viewOf(project, i))); } catch { out.set(i, null); } }
    return out;
  }, [project, seen]);
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(total - 1, i)) * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (k !== at) setAt(k);
    if (!seen.has(k) || (k + 1 < total && !seen.has(k + 1))) setSeen((prev) => new Set([...prev, k, Math.min(total - 1, k + 1)]));
  };
  const body = (i: number) => {
    const svg = svgs.get(i);
    return svg ? <div className={th.svg} dangerouslySetInnerHTML={{ __html: svg }} /> : svg === null ? <span className={th.none}>{t('my.thumbError')}</span> : <span className={th.none} />;
  };
  const aria = (i: number) => `${label}${total > 1 ? `（${i + 1} / ${total}）` : ''}`;
  return (
    <div className={th.thumb}>
      <div ref={ref} className={th.strip} onScroll={onScroll}>
        {Array.from({ length: Math.max(1, total) }, (_, i) => (
          href ? <Link key={i} href={href} className={th.item} aria-label={aria(i)}>{body(i)}</Link>
            : <button key={i} type="button" className={th.item} aria-label={aria(i)} onClick={() => onOpen?.(i)}>{body(i)}</button>
        ))}
      </div>
      {badge && <span className={th.badge}>{badge}</span>}
      {total > 1 && (
        <>
          <span className={th.count}>{t('my.slideAt', { n: at + 1, total })}</span>
          {at > 0 && <button type="button" className={`${th.nav} ${th.prev}`} aria-label={t('my.prevSlide')} onClick={() => go(at - 1)}>‹</button>}
          {at < total - 1 && <button type="button" className={`${th.nav} ${th.next}`} aria-label={t('my.nextSlide')} onClick={() => go(at + 1)}>›</button>}
        </>
      )}
    </div>
  );
}
