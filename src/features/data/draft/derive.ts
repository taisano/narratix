import type { ParsedTable } from '@/features/editor/dataCheck';
import { coreOf } from './vocab';
import { kindOf, type Assignment, type ColumnRoleMap, type DerivedSpec } from './columnRoles';

/**
 * 算出値（差分から逆算した水準）。「前年差」しか無い表で、前年の値を 現在 − 前年差 で求める。
 * 貼った値ではないので、ユーザーが確認するまで候補に使わない（docs §27）。計算はコードが行い、AI には頼まない。
 */
const header = (t: ParsedTable, col: number): string => {
  const off = t.hasRowNames ? 1 : 0;
  if (t.hasRowNames && col === 0) return t.corner ?? '';
  return t.hasColNames ? t.cols[col - off] ?? '' : '';
};

const isLevel = (a: Assignment) => a.role === 'metric' && kindOf(a) === 'level';
const isDelta = (a: Assignment) => a.role === 'metric' && (kindOf(a) === 'deltaAbsolute' || kindOf(a) === 'deltaPoint');
const unitsFit = (l: Assignment, d: Assignment) => (l.unit ?? '') === (d.unit ?? '') || (kindOf(d) === 'deltaPoint' && (l.unit === '%' || !l.unit) && (d.unit === 'pp' || !d.unit));

/** 差分の列から、水準の列との組を見つける（比べる列が既にある水準・時間つきの表は対象外）。確認前（confirmed: false）の状態で返す */
export function proposeDerived(t: ParsedTable, map: ColumnRoleMap): DerivedSpec[] {
  if (map.time || !map.assignments.some((a) => a.role === 'item')) return [];
  const a = map.assignments;
  const withCompare = new Set(a.filter((x) => x.role === 'compare' && x.compareOf != null).map((x) => x.compareOf!));
  const levels = a.filter((x) => isLevel(x) && !withCompare.has(x.col));
  const out: DerivedSpec[] = [];
  const used = new Set<number>();
  for (const d of a.filter(isDelta)) {
    const fit = levels.filter((l) => unitsFit(l, d) && !used.has(l.col));
    const core = coreOf(header(t, d.col));
    const byCore = core ? fit.filter((l) => coreOf(header(t, l.col)) === core) : [];
    const partner = byCore.length === 1 ? byCore[0] : fit.length === 1 ? fit[0] : undefined;
    if (!partner) continue;
    used.add(partner.col);
    out.push({ kind: 'priorLevelFromDelta', level: partner.col, delta: d.col, confirmed: false });
  }
  return out;
}

/** 保存済みの確認状態を引き継ぐ：今の表から見つかる組のうち、確認済みのものは confirmed のまま */
export function withDerivedState(t: ParsedTable, map: ColumnRoleMap): DerivedSpec[] {
  const prev = map.derived ?? [];
  return proposeDerived(t, map).map((p) => ({ ...p, confirmed: prev.some((x) => x.level === p.level && x.delta === p.delta && x.confirmed) }));
}

/** 確認済みで、列が今の割り当てに実在する算出の組 */
export const confirmedDerived = (map: Pick<ColumnRoleMap, 'assignments' | 'derived' | 'time'>): DerivedSpec[] => {
  if (map.time) return [];
  const has = (c: number, f: (a: Assignment) => boolean) => map.assignments.some((a) => a.col === c && f(a));
  return (map.derived ?? []).filter((d) => d.confirmed && has(d.level, isLevel) && has(d.delta, isDelta));
};

/** 算出した基準の行の見出し（「前年（算出）」） */
export function derivedLabel(deltaHeader: string): string {
  const base = /前年|昨年|yoy|ly|py/i.test(deltaHeader) ? '前年' : /前期|前月|前回/.test(deltaHeader) ? '前期' : '基準';
  return `${base}（算出）`;
}

/** 現在 − 差。浮動小数の誤差が出ないよう、元の桁に丸める */
export function priorFrom(cur: number | null, delta: number | null, decimals: number): number | null {
  if (cur == null || delta == null) return null;
  const k = 10 ** decimals;
  return Math.round((cur - delta) * k) / k;
}
