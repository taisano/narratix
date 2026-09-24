'use client';

import { useMemo } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { localize, registry } from '@/registry';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import type { Evaluation } from './preview';
import type { ProjectState } from './project';
import css from '../ui.module.css';

/**
 * スライドの一覧（プロジェクトの全スライドを並べる）。押した1枚を下で大きく表示して調整する。
 * 複製・削除・並べ替えは、選んでいるスライドに効く。
 */
export function SlideStrip({ project, results, onSelect, onDuplicate, onRemove, onMove }: {
  project: ProjectState;
  results: Evaluation[];
  onSelect: (i: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const thumbs = useMemo(
    () => results.map((r, i) => (r.scene && !r.warnings.some((w) => w.key === 'warn.no_data') ? sceneToSvg(r.scene, { title: project.slides[i]?.title ?? '' }) : null)),
    [results, project.slides],
  );
  const n = project.slides.length;
  const cur = project.current;

  return (
    <div className={css.strip}>
      <ol className={css.stripList} aria-label={t('slides.label')}>
        {project.slides.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={css.stripItem} aria-current={i === cur ? 'true' : undefined} onClick={() => onSelect(i)}
              title={s.title}>
              <span className={css.stripThumb}>
                {thumbs[i] ? <span dangerouslySetInnerHTML={{ __html: thumbs[i]! }} /> : <span className={css.stripNone}>{t('slides.problem')}</span>}
              </span>
              <span className={css.stripText}>
                <b>{i + 1}</b>
                <span>{s.recipe ? localize(registry.recipes[s.recipe].name, locale) : localize(registry.charts[s.chart].label, locale)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className={css.stripTools} role="group" aria-label={t('slides.tools')}>
        <button type="button" className="btn" onClick={onDuplicate}>{t('slides.add')}</button>
        <button type="button" className="btn" disabled={cur === 0} onClick={() => onMove(-1)} aria-label={t('slides.left')}>←</button>
        <button type="button" className="btn" disabled={cur === n - 1} onClick={() => onMove(1)} aria-label={t('slides.right')}>→</button>
        <button type="button" className="btn" disabled={n <= 1} onClick={onRemove}>{t('slides.remove')}</button>
      </div>
    </div>
  );
}
