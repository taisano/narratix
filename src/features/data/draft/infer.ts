import type { Assignment, ColumnRoleMap } from './columnRoles';
import type { ColumnProfile, TableProfile } from './profile';
import { compareKindOfHeader, coreOf, valueKindOfHeader } from './vocab';
import { validateRoleMap } from './validate';

export type NeedsManualReason =
  | 'no_numeric' | 'multiple_time_columns' | 'multiple_item_candidates' | 'multiple_series_candidates'
  | 'mixed_series_units' | 'compare_partner_unclear' | 'no_row_labels' | 'unreadable';

export type InferResult =
  | { status: 'ok'; map: ColumnRoleMap }
  | { status: 'needs_manual'; reasons: NeedsManualReason[] };

const isNum = (c: ColumnProfile) => c.kind === 'number' || c.kind === 'percent' || c.kind === 'currency';

/**
 * 規則による列対応の推定（AI が使えない・検証で全部が捨てられた時）。
 * 迷ったら埋めない：確信が持てない時は needs_manual を返し、画面でユーザーに選んでもらう
 */
export function inferRoles(profile: TableProfile): InferResult {
  const cols = profile.columns;
  const manual = (...reasons: NeedsManualReason[]): InferResult => ({ status: 'needs_manual', reasons });
  const assignments: Assignment[] = [];
  let time: ColumnRoleMap['time'];

  const dateCols = cols.filter((c) => c.isTimeLike);
  if (profile.timeAcrossColumns) {
    time = { orientation: 'columns', at: profile.timeAcrossColumns.cols, periodKind: profile.timeAcrossColumns.periodKind };
  } else if (dateCols.length === 1) {
    time = { orientation: 'rows', at: [dateCols[0]!.col], periodKind: dateCols[0]!.periodKind ?? 'unknown' };
  } else if (dateCols.length > 1) return manual('multiple_time_columns');
  const timeAt = new Set(time?.at ?? []);

  const rest = cols.filter((c) => !timeAt.has(c.col));
  const texts = rest.filter((c) => c.kind === 'text');
  const nums = time?.orientation === 'columns' ? [] : rest.filter(isNum);
  if (time?.orientation !== 'columns' && nums.length === 0) return manual('no_numeric');

  // 項目・系列・グループ（文字の列）
  const rowNamesText = texts.find((c) => c.isRowNames);
  if (time?.orientation === 'rows') {
    const cats = texts.filter((c) => c.distinctClass !== 'unique');
    if (cats.length > 1) return manual('multiple_series_candidates');
    if (cats[0]) assignments.push({ col: cats[0].col, role: 'series' });
  } else {
    const uniques = texts.filter((c) => c.distinctClass === 'unique');
    const item = rowNamesText && rowNamesText.distinctClass === 'unique' ? rowNamesText : uniques.length === 1 ? uniques[0] : undefined;
    if (!item) return uniques.length > 1 ? manual('multiple_item_candidates') : manual('no_row_labels');
    assignments.push({ col: item.col, role: 'item' });
    for (const c of texts) if (c.col !== item.col) assignments.push({ col: c.col, role: 'group' });
  }

  // 数値の列
  const wide = time?.orientation === 'rows' && !assignments.some((a) => a.role === 'series') && nums.length >= 2 && nums.every((c) => !c.headerSafe);
  if (wide) {
    const f = nums[0]!;
    if (nums.some((c) => c.kind !== f.kind || c.unit !== f.unit)) return manual('mixed_series_units');
    for (const c of nums) assignments.push({ col: c.col, role: 'seriesValue' });
  } else {
    const levels: ColumnProfile[] = [];
    const compares: { c: ColumnProfile; kind: NonNullable<ReturnType<typeof compareKindOfHeader>> }[] = [];
    for (const c of nums) {
      const hv = valueKindOfHeader(c.header, c.kind === 'percent' ? 'percent' : 'number');
      const ck = hv.valueKind === 'level' ? compareKindOfHeader(c.header) : null;
      if (ck) compares.push({ c, kind: ck });
      else {
        if (hv.valueKind === 'level') levels.push(c);
        assignments.push({ col: c.col, role: 'metric', valueKind: c.unit === 'pp' && hv.valueKind === 'level' ? 'deltaPoint' : hv.valueKind });
      }
    }
    for (const { c, kind } of compares) {
      const same = levels.filter((l) => l.unit === c.unit);
      const core = coreOf(c.header);
      const byCore = core ? same.filter((l) => coreOf(l.header) === core) : [];
      const partner = byCore.length === 1 ? byCore[0] : same.length === 1 ? same[0] : undefined;
      if (!partner && same.length > 1) return manual('compare_partner_unclear');
      assignments.push(partner
        ? { col: c.col, role: 'compare', valueKind: 'level', compareKind: kind, compareOf: partner.col }
        : { col: c.col, role: 'metric', valueKind: 'level' });
    }
  }
  if (!time && !assignments.some((a) => a.role === 'item')) return manual('no_row_labels');

  const v = validateRoleMap(profile, { version: 1, ...(time ? { time } : {}), assignments }, 'rules');
  return v.status === 'ok' ? { status: 'ok', map: v.map } : manual('unreadable');
}
