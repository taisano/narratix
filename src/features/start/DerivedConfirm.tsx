import { useT } from '@/i18n/ui';
import type { ParsedTable } from '@/features/editor/dataCheck';
import type { ColumnRoleMap } from '../data/draft/columnRoles';
import { withDerivedState } from '../data/draft/derive';
import css from './draft.module.css';

const headerOf = (t: ParsedTable, col: number): string => {
  const off = t.hasRowNames ? 1 : 0;
  if (t.hasRowNames && col === 0) return t.corner ?? '';
  return (t.hasColNames ? t.cols[col - off] : '') || `#${col + 1}`;
};

/** 差分しか無い表で、前年などの値を「現在 − 差」で計算して使うかを、ユーザーが確認する（確認するまで候補に使わない） */
export function DerivedConfirm({ map, table, onApply }: { map: ColumnRoleMap; table: ParsedTable; onApply: (map: ColumnRoleMap) => void }) {
  const t = useT();
  const specs = withDerivedState(table, map);
  if (!specs.length) return null;
  const s = specs[0]!;
  const vars = { level: headerOf(table, s.level), delta: headerOf(table, s.delta) };
  const set = (confirmed: boolean) => onApply({ ...map, derived: specs.map((x, i) => (i === 0 ? { ...x, confirmed } : x)), source: 'user' });
  return (
    <div className={css.note} data-testid="derived-confirm">
      <p>{t(s.confirmed ? 'draft.derived.on' : 'draft.derived.ask', vars)}</p>
      <button type="button" className={s.confirmed ? css.link : css.make} onClick={() => set(!s.confirmed)}>{t(s.confirmed ? 'draft.derived.off' : 'draft.derived.use')}</button>
    </div>
  );
}
