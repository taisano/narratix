import { useT } from '@/i18n/ui';
import type { ColumnRoleMap } from '../data/draft/columnRoles';
import css from './draft.module.css';

/** KPI カードの比較先：直前の期間／前年の同じ期間。月次・四半期の表で、前年の行がある時だけ出す */
export function KpiBasis({ map, rows, onApply }: { map: ColumnRoleMap; rows: number; onApply: (map: ColumnRoleMap) => void }) {
  const t = useT();
  const kind = map.time?.orientation === 'rows' ? map.time.periodKind : null;
  const lag = kind === 'month' ? 12 : kind === 'quarter' ? 4 : 0;
  if (!lag || rows <= lag) return null;
  const v = map.kpiBasis ?? 'previous';
  return (
    <label className={css.note} data-testid="kpi-basis">
      {t('draft.kpiBasis.label')}{' '}
      <select aria-label={t('draft.kpiBasis.label')} value={v} onChange={(e) => onApply({ ...map, kpiBasis: e.target.value as 'previous' | 'yearAgo', source: 'user' })}>
        <option value="previous">{t('draft.kpiBasis.previous')}</option>
        <option value="yearAgo">{t(kind === 'quarter' ? 'draft.kpiBasis.yearAgoQ' : 'draft.kpiBasis.yearAgo')}</option>
      </select>
    </label>
  );
}
