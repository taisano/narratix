'use client';

import { useT, type MessageKey } from '@/i18n/ui';
import { formBlock, formOf, formsFor, sideBlock, sideOf, sideOverflow, sidesFor, withSide, type Side, type SideForm } from './sides';
import { recipeOf, sideRatioOf, type BuilderState } from './state';
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
      {/* 左右の幅（お皿の構成）：主役 2/3・付け合わせ 1/3 ／ 左右 1/2 */}
      {now !== 'none' && (() => {
        const half = (sideRatioOf(s, recipeOf(s)?.view.layout.ratios?.[0]) ?? 0.67) <= 0.5;
        return (
          <div className={css.field}>
            <span className={css.labelRow}>{t('side.ratioHead')}</span>
            <div className={css.seg} role="group" aria-label={t('side.ratioHead')}>
              <button type="button" aria-pressed={!half} onClick={() => update({ controls: { ...s.controls, side_ratio: 'two_thirds' } })}>{t('side.ratio.two_thirds')}</button>
              <button type="button" aria-pressed={half} onClick={() => update({ controls: { ...s.controls, side_ratio: 'half' } })}>{t('side.ratio.half')}</button>
            </div>
          </div>
        );
      })()}
      {/* 形の切り替え（中身は同じ。差分バー ⇄ 増減表 ⇄ ウォーターフォール、CAGR の表 ⇄ 伸び率の横棒） */}
      {(() => {
        const forms = formsFor(s, now);
        const cur = formOf(s, now);
        if (!forms.length || !cur) return null;
        const blocked = forms.map((f) => formBlock(s, f)).find((b, i) => b && forms[i] === 'waterfall');
        return (
          <div className={css.field}>
            <span className={css.labelRow}>{t('side.formHead')}</span>
            <div className={css.seg} role="group" aria-label={t('side.formHead')}>
              {forms.map((f: SideForm) => (
                <button key={f} type="button" aria-pressed={cur === f} disabled={!!formBlock(s, f) && cur !== f}
                  onClick={() => update({ controls: { ...s.controls, side_form: f } })}>{t(`side.form.${now}.${f}` as MessageKey)}</button>
              ))}
            </div>
            <p className={css.hint}>{t(`side.formHint.${now}.${cur}` as MessageKey)}</p>
            {blocked && <p className={css.hint}>{t(`side.formBlock.${blocked}` as MessageKey)}</p>}
          </div>
        );
      })()}
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
