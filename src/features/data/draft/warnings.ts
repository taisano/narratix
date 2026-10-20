import type { CheckResult } from '@/features/editor/dataCheck';
import { kindOf, primaryMetricOf, type ColumnRoleMap } from './columnRoles';
import type { TableProfile } from './profile';

/**
 * 作る前の指摘：貼った表と列の使い方から、スライドを作る前に知らせておくこと（コードが決める。AI は使わない）。
 * 止めはしない（「このまま作る」か「列の使い方を直す」を選べる）。
 *  warn＝数字の意味が変わりうること（確かめてほしい）／note＝読み込みの時に自動でしたこと（知らせるだけ）
 */
export interface DraftWarning { key: string; level: 'warn' | 'note'; vars: Record<string, string | number> }

/** 貼り付けの診断（checkPaste）の項目のうち、下書きで知らせるもの。キーは i18n（無ければ check.*） */
const FROM_CHECK: Record<string, { key: string; level: 'warn' | 'note' }> = {
  unreadable: { key: 'check.unreadable', level: 'warn' },
  excelErrors: { key: 'check.excelErrors', level: 'warn' },
  unitConflict: { key: 'check.unitConflict', level: 'warn' },
  unitPartial: { key: 'check.unitPartial', level: 'warn' },
  outlier: { key: 'check.outlier', level: 'warn' },
  european: { key: 'check.european', level: 'warn' },
  large: { key: 'check.large', level: 'warn' },
  dupCols: { key: 'check.dupCols', level: 'warn' },
  totalRows: { key: 'draft.warn.totalRows', level: 'note' },
  totalCols: { key: 'draft.warn.totalCols', level: 'note' },
  titleRows: { key: 'draft.warn.titleRows', level: 'note' },
  noteRows: { key: 'draft.warn.noteRows', level: 'note' },
  percentMix: { key: 'draft.warn.percentMix', level: 'note' },
  unitMix: { key: 'draft.warn.unitMix', level: 'note' },
  missing: { key: 'check.missing', level: 'note' },
};

export const FEW_ITEMS = 3;

export function draftWarnings(check: CheckResult, map: ColumnRoleMap, profile: TableProfile): DraftWarning[] {
  const out: DraftWarning[] = [];
  const seen = new Set<string>();
  for (const i of check.issues) {
    const m = FROM_CHECK[i.code];
    if (!m || seen.has(i.code)) continue;
    seen.add(i.code);
    out.push({ key: m.key, level: m.level, vars: i.vars ?? {} });
  }
  // 項目が少ない（順位・大小・関係は、3つ以上あると読み取りやすい）
  const hasItem = map.assignments.some((a) => a.role === 'item');
  if (hasItem && !map.time && profile.rowCount > 0 && profile.rowCount < FEW_ITEMS) out.push({ key: 'draft.warn.fewItems', level: 'warn', vars: { n: profile.rowCount } });
  // 水準の指標が複数ある時、どれを主にしたか（AI・規則の推定の時だけ。ユーザーが選んだ時は知らせない）
  const levels = map.assignments.filter((a) => a.role === 'metric' && kindOf(a) === 'level');
  const primary = primaryMetricOf(map);
  if (map.source !== 'user' && levels.length >= 2 && primary != null) {
    const name = profile.columns.find((c) => c.col === primary)?.header;
    if (name) out.push({ key: 'draft.warn.primaryGuess', level: 'note', vars: { name } });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1));
}
