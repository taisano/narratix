'use client';

import { localize, type ControlDef } from '@/registry';
import { useLocale } from '@/i18n/ui';
import css from '../ui.module.css';

type Props = {
  def: ControlDef;
  value: unknown;
  onChange: (v: unknown) => void;
  /** data_select の候補 */
  candidates?: string[];
  /** data_select で未指定の時の表示（例：最後の行（2025）） */
  emptyLabel?: string;
};

/** レジストリの定義から、設定の入力欄を1つ作る（選択肢・オンオフ・データからの選択） */
export function ControlField({ def, value, onChange, candidates = [], emptyLabel }: Props) {
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const label = L(def.label);
  const current = value ?? def.defaultValue;

  if (def.type === 'text') {
    return (
      <label className={css.field}>
        <span>{label}</span>
        <input className={css.input} value={typeof value === 'string' ? value : ''} placeholder={emptyLabel} onChange={(e) => onChange(e.target.value || undefined)} />
      </label>
    );
  }
  if (def.type === 'toggle') {
    return (
      <label className={css.check}>
        <input type="checkbox" checked={current === true} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }
  if (def.type === 'select') {
    const opts = def.options ?? [];
    const short = opts.length <= 3 && opts.every((o) => L(o.label).length <= 6);
    return (
      <div className={css.field}>
        <span>{label}</span>
        {short ? (
          <div className={css.seg} role="group" aria-label={label}>
            {opts.map((o) => (
              <button key={o.value} type="button" aria-pressed={current === o.value} onClick={() => onChange(o.value)}>{L(o.label)}</button>
            ))}
          </div>
        ) : (
          <select className={css.select} aria-label={label} value={String(current ?? '')} onChange={(e) => onChange(e.target.value)}>
            {opts.map((o) => <option key={o.value} value={o.value}>{L(o.label)}</option>)}
          </select>
        )}
      </div>
    );
  }
  if (def.type === 'data_select') {
    const v = typeof value === 'string' && candidates.includes(value) ? value : '';
    return (
      <label className={css.field}>
        <span>{label}</span>
        <select className={css.select} value={v} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{emptyLabel ?? '—'}</option>
          {candidates.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    );
  }
  return null;
}
