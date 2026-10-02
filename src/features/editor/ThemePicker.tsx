'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  ACCENT_COLORS, DEEP_OCEAN_TEAL, EXECUTIVE_PLUM, PALETTES, PASTEL_POP_FACE,
  QUIET_STEEL_BLUE, THEME_IDS, WARM_MARKET, themeIdOf, type AccentId, type ThemeId,
} from '@/engine/theme';
import { canUseColorThemes, planOf, type PlanId } from '@/lib/ai/plans';
import { localize, registry, type ChartTypeId } from '@/registry';
import { useLocale, useT } from '@/i18n/ui';
import css from '../ui.module.css';

/** 見本の色（default は今の並びの先頭7色、ほかは各テーマの7色） */
const SWATCH: Record<ThemeId, readonly string[]> = {
  default: PALETTES.default!.series.slice(0, 7),
  quiet_steel_blue: QUIET_STEEL_BLUE,
  deep_ocean_teal: DEEP_OCEAN_TEAL,
  executive_plum: EXECUTIVE_PLUM,
  warm_market: WARM_MARKET,
  pastel_pop: PASTEL_POP_FACE,
};
/** Plus の機能（基本のテーマ default 以外） */
const PLUS_THEMES: ThemeId[] = THEME_IDS.filter((id) => id !== 'default');
/** 項目ごとに色を塗り分けるチャート（7つを超えた時の注意を出す） */
const MULTI_COLOR_CHARTS: ChartTypeId[] = ['mekko', 'stacked_100', 'stacked_column', 'line', 'column_trend', 'bar_trend', 'bar_100', 'slope', 'slope_pair', 'rank_slope', 'share_pair'];

/**
 * 配色のテーマ。保存するのはテーマの ID だけ（controls.palette）。
 * 「行と列の入れ替え」と同じく、押すと一覧が開くボタン（テーマが増えても縦に長くならない）。一覧には色の見本を出す。
 * プランはまだ画面に届いていないので基本（free）として判定する。ベータ中は全員が使える（plans.ts BETA_OPEN_PLUS）
 */
export function ThemePicker({ value, onChange, chart, items, plan }: {
  value: unknown; onChange: (v: ThemeId | undefined) => void; chart: ChartTypeId; items: number; plan?: PlanId;
}) {
  const t = useT();
  const cur = themeIdOf(value);
  const allowed = canUseColorThemes(planOf(plan));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const locked = (id: ThemeId) => PLUS_THEMES.includes(id) && !allowed;

  // 一覧の外を押したら閉じる
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);

  const openList = () => { setActive(Math.max(0, THEME_IDS.indexOf(cur))); setOpen(true); };
  const pick = (id: ThemeId) => {
    if (locked(id)) return;
    onChange(id === 'default' ? undefined : id);
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(THEME_IDS.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(THEME_IDS.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(THEME_IDS[active]!); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const Swatch = ({ id }: { id: ThemeId }) => (
    <span className={css.swatches} aria-hidden="true">{SWATCH[id].map((c) => <i key={c} style={{ background: c }} />)}</span>
  );
  const Name = ({ id }: { id: ThemeId }) => (
    <span>{t(`field.theme.${id}`)}{PLUS_THEMES.includes(id) && <span className={css.plus}>{t('plan.plus')}</span>}</span>
  );

  return (
    <div className={css.field} ref={root}>
      <span id={`${listId}-label`}>{t('field.theme')}</span>
      <div className={css.themeSelect}>
        <button ref={button} type="button" className={css.themeButton} aria-haspopup="listbox" aria-expanded={open}
          aria-labelledby={`${listId}-label ${listId}-value`} aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${THEME_IDS[active]}` : undefined}
          onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}>
          <Swatch id={cur} />
          <span id={`${listId}-value`} className={css.themeValue}><Name id={cur} /></span>
          <span className={css.caret} aria-hidden="true" />
        </button>
        {open && (
          <ul id={listId} role="listbox" aria-labelledby={`${listId}-label`} className={css.themeMenu}>
            {THEME_IDS.map((id, i) => (
              <li key={id} id={`${listId}-${id}`} role="option" aria-selected={cur === id} aria-disabled={locked(id) || undefined}
                data-active={i === active} className={css.themeItem} title={locked(id) ? t('plan.locked') : undefined}
                onPointerEnter={() => setActive(i)} onClick={() => pick(id)}>
                <Swatch id={id} />
                <Name id={id} />
                <small>{locked(id) ? t('plan.locked') : t(`field.theme.${id}.note`)}</small>
              </li>
            ))}
            {allowed && <li role="presentation" className={css.themeFoot}>{t('plan.plus')}：{t('plan.betaFree')}</li>}
          </ul>
        )}
      </div>
      {cur !== 'default' && items > 7 && MULTI_COLOR_CHARTS.includes(chart) && (
        <p className={css.fieldWarn} role="status">{t('field.theme.tooMany', { n: String(items) })}</p>
      )}
    </div>
  );
}

/** 強調の色（Plus）。強調した項目だけこの色にし、ほかはテーマの色のまま。保存するのは色の ID だけ */
export function AccentPicker({ value, onChange, plan }: {
  value: unknown; onChange: (v: AccentId) => void; plan?: PlanId;
}) {
  const t = useT();
  const locale = useLocale();
  const allowed = canUseColorThemes(planOf(plan));
  // 選んでいなければ（古い「なし」も）紺
  const cur: AccentId = typeof value === 'string' && value in ACCENT_COLORS ? (value as AccentId) : 'navy';
  const labelOf = (id: string) => localize(registry.controls.highlight_color.options!.find((o) => o.value === id)!.label, locale);
  return (
    <div className={css.field}>
      <span>{t('field.highlightColor')}</span>
      <div className={css.accentRow} role="group" aria-label={t('field.highlightColor')}>
        {(Object.keys(ACCENT_COLORS) as AccentId[]).map((id) => {
          const locked = !allowed && id !== 'navy';
          return (
            <button key={id} type="button" className={css.accentChip} style={{ background: ACCENT_COLORS[id] }}
              aria-pressed={cur === id} disabled={locked} aria-label={labelOf(id)} title={locked ? t('plan.locked') : labelOf(id)}
              onClick={() => onChange(id)} />
          );
        })}
      </div>
      <p className={css.accentNote}>{t('field.highlightColor.note')}</p>
    </div>
  );
}
