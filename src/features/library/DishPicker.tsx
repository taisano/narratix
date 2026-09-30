'use client';

import { useLocale, useT } from '@/i18n/ui';
import { localize, registry, type PurposeId } from '@/registry';
import { EMPHASES, EMPHASIS_LABEL, type EmphasisId } from '../start/coach';
import { dishOfSlide, setSlideDish, suggestDish } from '../start/dishTag';
import type { ProjectState } from '../editor/project';
import { purposeName } from '../shared/facets';
import css from '../ui.module.css';

/**
 * 管理者だけ：見本のスライドごとに「伝えたいこと」（料理 ID）を付ける。
 * 付けると、② で同じ伝えたいこと・同じチャートを選んだ人に「見本」として出る。付いていなければ、料理の表からの推定を出す
 */
export function DishPicker({ project, setProject }: { project: ProjectState; setProject: (p: ProjectState) => void }) {
  const t = useT();
  const locale = useLocale();
  const groups = (Object.keys(EMPHASES) as PurposeId[]).filter((p) => EMPHASES[p].length);
  return (
    <div className={css.field}>
      <span>{t('library.dishHead')}</span>
      <p className={css.hint}>{t('library.dishNote')}</p>
      {project.slides.map((s, i) => {
        const now = dishOfSlide(s);
        const guess = now ? null : suggestDish(s);
        return (
          <div key={s.id} className={css.field}>
            <label className={css.hint} htmlFor={`dish-${s.id}`}>{t('library.dishSlide', { n: i + 1, title: s.title || localize(registry.charts[s.chart].label, locale) })}</label>
            <select id={`dish-${s.id}`} className={css.input} value={now ?? ''}
              onChange={(e) => setProject(setSlideDish(project, i, (e.target.value || null) as EmphasisId | null))}>
              <option value="">{t('library.dishNone')}</option>
              {groups.map((p) => (
                <optgroup key={p} label={purposeName(p, locale)}>
                  {EMPHASES[p].map((d) => <option key={d} value={d}>{localize(EMPHASIS_LABEL[d], locale)}</option>)}
                </optgroup>
              ))}
            </select>
            {guess && (
              <p className={css.hint}>
                {t('library.dishGuess', { name: localize(EMPHASIS_LABEL[guess], locale) })}{' '}
                <button type="button" className={css.linkBtn} onClick={() => setProject(setSlideDish(project, i, guess))}>{t('library.dishUse')}</button>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
