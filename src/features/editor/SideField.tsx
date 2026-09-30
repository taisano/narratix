'use client';

import { useT, type MessageKey } from '@/i18n/ui';
import { sideBlock, sideOf, sideOverflow, sidesFor, withSide, type Side } from './sides';
import type { BuilderState } from './state';
import { useTip } from './Tip';
import css from '../ui.module.css';

/**
 * 補完パーツの「右側に並べる（付け合わせ）」：なし／増加額（差分バー）／伸び率（CAGR の表）。
 * 主役のチャートの右 1/3 に、同じデータから計算した補足を置く。チャートを替えても、使えるものは引き継ぐ
 */
export function SideField({ state: s, update }: { state: BuilderState; update: (patch: Partial<BuilderState>) => void }) {
  const t = useT();
  const tip = useTip('info', t('side.info'));
  const options = sidesFor(s.chart);
  if (!options.length) return null;
  const now = sideOf(s);
  const pick = (side: Side) => {
    const next = withSide(s, side);
    // レシピ・表示する部品に加えて、変わったもの（既定の設定・2つの指標の見本）も渡す
    update({
      recipe: next.recipe ?? null, hiddenParts: next.hiddenParts ?? [],
      ...(next.controls !== s.controls ? { controls: next.controls } : {}),
      ...(next.dataset !== s.dataset ? { dataset: next.dataset, title: next.title, source: next.source } : {}),
    });
  };
  return (
    <div className={css.compGroup}>
      <h3 className={`${css.compHead} ${css.labelRow}`}>{t('side.head')}{tip.button}</h3>
      {tip.panel(t('side.infoText'))}
      <div role="radiogroup" aria-label={t('side.head')}>
        {options.map((o) => {
          const block = sideBlock(s, o);
          return (
            <div key={o}>
              <label className={css.check}>
                <input type="radio" name="side" checked={now === o} disabled={!!block && now !== o} onChange={() => pick(o)} />
                <span>{t((s.chart === 'bar_rank' && o !== 'none' ? `side.${o}Rank` : `side.${o}`) as MessageKey)}</span>
              </label>
              {block && <p className={css.hint}>{t(`side.block.${block}` as MessageKey)}</p>}
            </div>
          );
        })}
      </div>
      {(() => {
        const over = sideOverflow(s, now);
        if (!over) return null;
        return (
          <p className={css.hintWarn}>
            {t('side.overflow', { n: over.count, max: over.max })}{' '}
            <button type="button" className={css.linkBtn} onClick={() => update({ controls: { ...s.controls, top_n: '5' } })}>{t('side.topFive')}</button>
          </p>
        );
      })()}
    </div>
  );
}
