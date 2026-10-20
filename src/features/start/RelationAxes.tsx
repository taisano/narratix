import { useState } from 'react';
import { useT } from '@/i18n/ui';
import type { ColumnRoleMap } from '../data/draft/columnRoles';
import { relationBinding } from '../data/draft/columnRoles';
import type { TableProfile } from '../data/draft/profile';
import css from './draft.module.css';

/** 関係（散布図・バブル）の X・Y・大きさを入れ替える。列の使い方（共通の列対応）は変えず、この形だけの割り当てを決める */
export function RelationAxes({ map, columns, onApply }: { map: ColumnRoleMap; columns: TableProfile['columns']; onApply: (map: ColumnRoleMap) => void }) {
  const t = useT();
  const b = relationBinding(map);
  const metrics = map.assignments.filter((a) => a.role === 'metric').map((a) => a.col).sort((a, b2) => a - b2);
  const name = (c: number) => columns[c]?.header || t('draft.col', { n: c + 1 });
  const [open, setOpen] = useState(false);
  if (!b || b.x == null || b.y == null || metrics.length < 2) return null;
  const x = b.x, y = b.y, size = b.size;
  const set = (n: { x: number; y: number; size?: number }) => onApply({ ...map, relation: n, source: 'user' });
  const pickX = (v: number) => set({ x: v, y: v === y ? x : y, ...(size != null && size !== v ? { size } : {}) });
  const pickY = (v: number) => set({ x, y: v, ...(size != null && size !== v ? { size } : {}) });
  const pickS = (v: number | null) => set({ x, y, ...(v != null ? { size: v } : {}) });
  return (
    <div className={css.picker} data-testid="relation-axes">
      {!open ? (
        <button type="button" className={css.link} onClick={() => setOpen(true)}>{t('draft.axes.open')}</button>
      ) : (
        <>
          <p className={css.note}>{t('draft.axes.lead')}</p>
          <div className={css.pickRow}>
            <span className={css.colName}>{t('draft.axes.x')}</span>
            <select aria-label={t('draft.axes.x')} value={x} onChange={(e) => pickX(Number(e.target.value))}>{metrics.map((c) => <option key={c} value={c}>{name(c)}</option>)}</select>
          </div>
          <div className={css.pickRow}>
            <span className={css.colName}>{t('draft.axes.y')}</span>
            <select aria-label={t('draft.axes.y')} value={y} onChange={(e) => pickY(Number(e.target.value))}>{metrics.filter((c) => c !== x).map((c) => <option key={c} value={c}>{name(c)}</option>)}</select>
          </div>
          <div className={css.pickRow}>
            <span className={css.colName}>{t('draft.axes.size')}</span>
            <select aria-label={t('draft.axes.size')} value={size ?? ''} onChange={(e) => pickS(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">{t('draft.axes.none')}</option>
              {metrics.filter((c) => c !== x && c !== y).map((c) => <option key={c} value={c}>{name(c)}</option>)}
            </select>
          </div>
          <div>
            <button type="button" className={css.link} onClick={() => set({ x: y, y: x, ...(size != null ? { size } : {}) })}>{t('draft.axes.swap')}</button>
            {' '}<button type="button" className={css.link} onClick={() => setOpen(false)}>{t('editor.draftFix.close')}</button>
          </div>
        </>
      )}
    </div>
  );
}
