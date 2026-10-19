'use client';

import { useMemo } from 'react';
import { useT } from '@/i18n/ui';
import { analyzeTable } from '@/features/data/draft/session';
import css from './draft.module.css';

/** 入口の「表を貼る（任意）」。貼った表をその場で読み、行数・列数か、読めない理由を見せる。AI に送る内容の説明も、ここ（ボタンの近く）に出す */
export function DraftPaste({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const a = useMemo(() => (value.trim() ? analyzeTable(value) : null), [value]);
  return (
    <details className={css.paste} open={!!value.trim() || undefined}>
      <summary>{t('draft.title')}</summary>
      <div className={css.pasteBody}>
        <p className={css.pasteLead}>{t('draft.lead')}</p>
        <textarea className={css.area} value={value} placeholder={t('draft.placeholder')} aria-label={t('draft.title')} onChange={(e) => onChange(e.target.value)} />
        {a?.ok && <p className={css.ok} role="status">{t('draft.read', { rows: a.profile.rowCount, cols: a.profile.colCount })}</p>}
        {a && !a.ok && <p className={css.err} role="alert">{t(a.reason === 'too_large' ? 'draft.err.too_large' : 'draft.err.unreadable')}</p>}
        {value.trim() && <button type="button" className={css.link} onClick={() => onChange('')}>{t('draft.clear')}</button>}
        <p className={css.sends}>{t('privacy.aiSends')}</p>
      </div>
    </details>
  );
}

/** 貼った表が使える状態か（空は「使わない」で OK） */
export const draftUsable = (v: string): boolean => !v.trim() || analyzeTable(v).ok;
