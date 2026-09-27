'use client';

import { ACCENT_COLORS, PALETTES, QUIET_STEEL_BLUE, THEME_IDS, themeIdOf, type AccentId, type ThemeId } from '@/engine/theme';
import { canUseColorThemes, planOf, type PlanId } from '@/lib/ai/plans';
import { localize, registry, type ChartTypeId } from '@/registry';
import { useLocale, useT } from '@/i18n/ui';
import css from '../ui.module.css';

/** 見本の色（default は今の並びの先頭7色、Quiet Steel Blue は7段階） */
const SWATCH: Record<ThemeId, readonly string[]> = {
  default: PALETTES.default!.series.slice(0, 7),
  quiet_steel_blue: QUIET_STEEL_BLUE,
};
/** Plus の機能（基本のテーマ default 以外） */
const PLUS_THEMES: ThemeId[] = ['quiet_steel_blue'];
/** 項目ごとに色を塗り分けるチャート（7つを超えた時の注意を出す） */
const MULTI_COLOR_CHARTS: ChartTypeId[] = ['mekko', 'stacked_100', 'stacked_column', 'line', 'column_trend', 'bar_trend', 'bar_100', 'slope', 'slope_pair', 'share_pair'];

/**
 * 配色のテーマ。保存するのはテーマの ID だけ（controls.palette）。
 * プランはまだ画面に届いていないので基本（free）として判定する。ベータ中は全員が使える（plans.ts BETA_OPEN_PLUS）
 */
export function ThemePicker({ value, onChange, chart, items, plan }: {
  value: unknown; onChange: (v: ThemeId | undefined) => void; chart: ChartTypeId; items: number; plan?: PlanId;
}) {
  const t = useT();
  const cur = themeIdOf(value);
  const allowed = canUseColorThemes(planOf(plan));
  return (
    <div className={css.field}>
      <span>{t('field.theme')}</span>
      <div className={css.themeList} role="group" aria-label={t('field.theme')}>
        {THEME_IDS.map((id) => {
          const plus = PLUS_THEMES.includes(id);
          const locked = plus && !allowed;
          return (
            <button key={id} type="button" className={css.themeOpt} aria-pressed={cur === id} disabled={locked}
              title={locked ? t('plan.locked') : undefined}
              onClick={() => onChange(id === 'default' ? undefined : id)}>
              <span className={css.swatches} aria-hidden="true">{SWATCH[id].map((c) => <i key={c} style={{ background: c }} />)}</span>
              <span>{t(`field.theme.${id}`)}{plus && <span className={css.plus}>{t('plan.plus')}</span>}</span>
              <small>{t(`field.theme.${id}.note`)}</small>
            </button>
          );
        })}
      </div>
      {allowed && <p className={css.axisNow}>{t('plan.plus')}：{t('plan.betaFree')}</p>}
      {cur === 'quiet_steel_blue' && items > 7 && MULTI_COLOR_CHARTS.includes(chart) && (
        <p className={css.fieldWarn} role="status">{t('field.theme.tooMany', { n: String(items) })}</p>
      )}
    </div>
  );
}

/** 強調の色（Plus）。強調した項目だけこの色にし、ほかはテーマの色のまま。保存するのは色の ID だけ */
export function AccentPicker({ value, onChange, hasHighlight, plan }: {
  value: unknown; onChange: (v: AccentId | undefined) => void; hasHighlight: boolean; plan?: PlanId;
}) {
  const t = useT();
  const locale = useLocale();
  const allowed = canUseColorThemes(planOf(plan));
  const cur = typeof value === 'string' && value in ACCENT_COLORS ? (value as AccentId) : null;
  const off = !hasHighlight || !allowed;
  const labelOf = (id: string) => localize(registry.controls.highlight_color.options!.find((o) => o.value === id)!.label, locale);
  return (
    <div className={css.field}>
      <span>{t('field.highlightColor')}<span className={css.plus}>{t('plan.plus')}</span></span>
      <div className={css.accentRow} role="group" aria-label={t('field.highlightColor')}>
        <button type="button" className={css.accentNone} aria-pressed={!cur} disabled={off} onClick={() => onChange(undefined)}
          title={t('field.highlightColor.noneNote')}>{t('field.highlightColor.none')}</button>
        {(Object.keys(ACCENT_COLORS) as AccentId[]).map((id) => (
          <button key={id} type="button" className={css.accentChip} style={{ background: ACCENT_COLORS[id] }}
            aria-pressed={cur === id} disabled={off} aria-label={labelOf(id)} title={allowed ? labelOf(id) : t('plan.locked')}
            onClick={() => onChange(id)} />
        ))}
      </div>
      <p className={css.accentNote}>{!hasHighlight ? t('field.highlightColor.needs') : !allowed ? t('plan.locked') : cur ? t('field.highlightColor.note') : t('field.highlightColor.noneNote')}</p>
    </div>
  );
}
