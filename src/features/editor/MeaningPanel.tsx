'use client';

import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { localize, registry, type ChartTypeId, type ControlId } from '@/registry';
import type { MeaningFix, MeaningIssue } from './meaning';
import { isSwapped, type BuilderState } from './state';
import css from '../ui.module.css';

const CUR: Record<string, { ja: string; en: string }> = { JPY: { ja: '円', en: 'yen' }, USD: { ja: 'ドル', en: 'dollars' }, EUR: { ja: 'ユーロ', en: 'euros' }, CNY: { ja: '人民元', en: 'yuan' }, GBP: { ja: 'ポンド', en: 'pounds' } };

/** 表示する列を外す（入れ替えている時は行の絞り込み） */
export function hideNames(s: BuilderState, names: string[]): BuilderState {
  const id: ControlId = isSwapped(s) ? 'items' : 'series';
  const all = id === 'items' ? s.dataset.rows : s.dataset.cols;
  const cur = Array.isArray(s.controls[id]) ? (s.controls[id] as string[]) : all;
  const next = cur.filter((n) => !names.includes(n));
  return { ...s, controls: { ...s.controls, [id]: next.length === all.length ? undefined : next } };
}

/**
 * チャートの意味のチェック（meaning.ts）を、プレビューの上に Coach の言葉で出す。
 * 重大（合計に意味がない など）は赤で、直し方のボタンを並べる。PPT の出力の前にも確かめる
 */
export function MeaningPanel({ issues, state, setState, onConvert, overridden, onOverride }: {
  issues: MeaningIssue[]; state: BuilderState; setState: (f: (s: BuilderState) => BuilderState) => void;
  /** チャートの形を変える（データを持っていく。できなければ理由を出して何も変えない） */
  onConvert: (chart: ChartTypeId) => void;
  /** 重大な注意を「理解した上で使う」にしたか（保存・出力を止めない） */
  overridden: boolean;
  onOverride: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  if (!issues.length) return null;
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const chartLabel = (c: string) => (c in registry.charts ? L(registry.charts[c as ChartTypeId].label) : c);
  const vars = (i: MeaningIssue) => {
    const v = { ...(i.vars ?? {}) };
    if (typeof v.chart === 'string') v.chart = chartLabel(v.chart);
    if (typeof v.list === 'string') v.list = v.list.split('・').map((c) => CUR[c]?.[locale] ?? c).join('・');
    return v;
  };
  const fixLabel = (f: MeaningFix) => (f.kind === 'chart' ? t('meaning.fix.chart', { chart: chartLabel(f.chart) })
    : f.kind === 'hide' ? t('meaning.fix.hide', { names: f.cols.join('・') })
    : f.unit ? t('meaning.fix.unit', { unit: f.unit }) : t('meaning.fix.clearUnit'));
  const apply = (f: MeaningFix) => (f.kind === 'chart' ? onConvert(f.chart)
    : setState((s) => (f.kind === 'hide' ? hideNames(s, f.cols) : { ...s, dataset: { ...s.dataset, unit: f.unit } })));
  const order = { error: 0, warning: 1, info: 2 } as const;
  return (
    <ul className={css.meaningList} aria-label={t('meaning.heading')}>
      {[...issues].sort((a, b) => order[a.level] - order[b.level]).map((i) => (
        <li key={i.code} data-level={i.level}>
          <b className={css.meaningBadge} aria-hidden="true">C</b>
          <span className={css.meaningText}>
            {i.level === 'error' && <strong>{t('meaning.errorLead')}</strong>}
            {t(`meaning.${i.code}` as MessageKey, vars(i))}
          </span>
          {(i.fixes?.length ?? 0) > 0 && (
            <span className={css.meaningFixes}>
              {i.fixes!.map((f, k) => <button key={k} type="button" className="btn" onClick={() => apply(f)}>{fixLabel(f)}</button>)}
            </span>
          )}
          {i.level === 'error' && (
            <span className={css.meaningOverride}>
              {overridden ? t('meaning.overridden') : (
                <label className={css.inlineCheck}><input type="checkbox" checked={false} onChange={onOverride} />{t('meaning.override')}</label>
              )}
            </span>
          )}
          {i.code === 'bridge_mismatch' && !i.vars?.fixed && (
            <span className={css.meaningFixes}>
              <button type="button" className="btn" onClick={() => setState((s) => ({ ...s, controls: { ...s.controls, mismatch: 'autofix_end' } }))}>{t('meaning.fix.autofixEnd')}</button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
