'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import type { FacetOption } from './facets';
import css from './filter-bar.module.css';

export interface FilterFacet {
  key: string;
  label: string;
  options: FacetOption[];
  value: string[];
  onChange: (v: string[]) => void;
}

/**
 * 絞り込みの欄（目的 ▾・チャート ▾・タグ ▾）。押すと選択肢が開き、いくつでも選べる（欄の中は「どれか」）。
 * パソコンではボタンの下に小さく開き、スマホでは画面の下から大きく開く（「N件を表示」で閉じる）。
 * 選んだ条件は下の行に「× で外せる印」として並べる
 */
export function FilterBar({ facets, resultCount, onClear }: { facets: FilterFacet[]; resultCount: number; onClear: () => void }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const baseId = useId();

  // 外側を押す・Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const visible = facets.filter((f) => f.options.length > 0 || f.value.length > 0);
  const chosen = visible.flatMap((f) => f.value.map((v) => ({ f, v, label: f.options.find((o) => o.value === v)?.label ?? v })));
  if (!visible.length) return null;

  return (
    <div className={css.bar} ref={root}>
      <div className={css.buttons} role="group" aria-label={t('filter.label')}>
        {visible.map((f) => {
          const id = `${baseId}-${f.key}`;
          const summary = f.value.length === 1 ? `：${f.options.find((o) => o.value === f.value[0])?.label ?? f.value[0]}` : f.value.length > 1 ? `（${f.value.length}）` : '';
          const isOpen = open === f.key;
          return (
            <div key={f.key} className={css.item}>
              <button type="button" className={`${css.button} ${f.value.length ? css.on : ''}`} aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : f.key)}>
                <span className={css.buttonText}>{f.label}{summary}</span><span aria-hidden="true" className={css.caret}>▾</span>
              </button>
              {isOpen && (
                <>
                  <div className={css.backdrop} aria-hidden="true" onClick={() => setOpen(null)} />
                  <div id={id} className={css.panel} role="dialog" aria-label={f.label}>
                    <div className={css.panelHead}>
                      <span>{f.label}</span>
                      {f.value.length > 0 && <button type="button" className={css.linkBtn} onClick={() => f.onChange([])}>{t('filter.none')}</button>}
                    </div>
                    <ul className={css.options}>
                      {f.options.map((o) => {
                        const on = f.value.includes(o.value);
                        return (
                          <li key={o.value}>
                            <label className={css.option}>
                              <input type="checkbox" checked={on} onChange={() => f.onChange(on ? f.value.filter((v) => v !== o.value) : [...f.value, o.value])} />
                              <span className={css.optionLabel}>{o.label}</span>
                              <span className={css.count}>{o.count}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <button type="button" className={css.done} onClick={() => setOpen(null)}>{t('filter.show', { n: resultCount })}</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {chosen.length > 0 && (
        <div className={css.chosen}>
          {chosen.map(({ f, v, label }) => (
            <button key={`${f.key}:${v}`} type="button" className={css.chip} aria-label={t('filter.remove', { name: label })} onClick={() => f.onChange(f.value.filter((x) => x !== v))}>
              {label}<span aria-hidden="true"> ×</span>
            </button>
          ))}
          <button type="button" className={css.linkBtn} onClick={onClear}>{t('filter.clear')}</button>
        </div>
      )}
    </div>
  );
}
