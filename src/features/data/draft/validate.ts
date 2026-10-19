import { AiRoleResponseSchema, kindOf, type Assignment, type ColumnRoleMap, type TimeDef } from './columnRoles';
import type { TableProfile } from './profile';
import { valueKindOfHeader } from './vocab';

export type DropReason =
  | 'out_of_range' | 'duplicate_col' | 'not_numeric' | 'not_text' | 'extra_item' | 'not_time_like' | 'bad_time'
  | 'covered_by_time' | 'unit_mismatch' | 'compare_not_level' | 'compare_no_partner' | 'bad_primary' | 'bad_hint' | 'bad_derived' | 'time_role_ignored';
export interface Dropped { col?: number; reason: DropReason }

export type ValidateResult =
  | { status: 'ok'; map: ColumnRoleMap; dropped: Dropped[] }
  | { status: 'undetermined'; reason: 'schema' | 'no_metric'; dropped: Dropped[] };

const NUMERIC = new Set(['number', 'percent', 'currency']);

/**
 * 列対応の検証（zod の形の検査 + 表の特徴との突き合わせ）。
 * 形が不正なら全体を「判断不能」にする。意味の違反は、その割り当てだけ捨てて続ける。単位はコードが決める（AI の値は使わない）。
 * 全部が捨てられたら判断不能（規則による推定→手動指定へ進む）
 */
export function validateRoleMap(profile: TableProfile, input: unknown, source: ColumnRoleMap['source']): ValidateResult {
  const parsed = AiRoleResponseSchema.safeParse(input);
  if (!parsed.success) return { status: 'undetermined', reason: 'schema', dropped: [] };
  const r = parsed.data;
  const dropped: Dropped[] = [];
  const col = (c: number) => profile.columns[c];
  const taken = new Set<number>();
  let time: TimeDef | undefined;

  // 時間の定義
  if (r.time) {
    const t = r.time;
    const ok = t.at.every((c) => c >= 0 && c < profile.colCount);
    if (!ok) dropped.push({ reason: 'out_of_range' });
    else if (t.orientation === 'rows') {
      const c = col(t.at[0]!)!;
      if (t.at.length !== 1) dropped.push({ reason: 'bad_time' });
      else if (!c.isTimeLike) dropped.push({ col: c.col, reason: 'not_time_like' });
      else time = { orientation: 'rows', at: [c.col], periodKind: c.periodKind ?? t.periodKind };
    } else {
      const tc = profile.timeAcrossColumns;
      if (!tc || t.at.length < 2 || !t.at.every((c) => tc.cols.includes(c))) dropped.push({ reason: 'bad_time' });
      else time = { orientation: 'columns', at: [...t.at].sort((a, b) => a - b), periodKind: tc.periodKind };
    }
  }

  // 割り当て
  const out: Assignment[] = [];
  let hasItem = false;
  for (const a of r.assignments) {
    const c = col(a.col);
    if (!c) { dropped.push({ col: a.col, reason: 'out_of_range' }); continue; }
    if (taken.has(a.col)) { dropped.push({ col: a.col, reason: 'duplicate_col' }); continue; }
    if (a.role === 'time') {
      // 時間は time で表す。割り当てに書かれていたら、time が無い時だけ採る
      if (!time && c.isTimeLike) { time = { orientation: 'rows', at: [c.col], periodKind: c.periodKind ?? 'unknown' }; }
      else dropped.push({ col: a.col, reason: 'time_role_ignored' });
      continue;
    }
    if (time && time.at.includes(a.col)) { dropped.push({ col: a.col, reason: 'covered_by_time' }); continue; }
    const numericRole = a.role === 'metric' || a.role === 'seriesValue' || a.role === 'compare';
    if (numericRole && !NUMERIC.has(c.kind)) { dropped.push({ col: a.col, reason: 'not_numeric' }); continue; }
    if ((a.role === 'item' || a.role === 'series' || a.role === 'group') && c.kind !== 'text' && !(a.role === 'item' && c.kind === 'date')) { dropped.push({ col: a.col, reason: 'not_text' }); continue; }
    if (a.role === 'item') {
      if (hasItem) { dropped.push({ col: a.col, reason: 'extra_item' }); continue; }
      hasItem = true;
    }
    taken.add(a.col);
    const unit = c.unit;
    const next: Assignment = { col: a.col, role: a.role, ...(unit ? { unit } : {}) };
    if (numericRole) {
      const fromHeader = valueKindOfHeader(c.header, c.kind === 'percent' ? 'percent' : 'number').valueKind;
      let vk = a.valueKind ?? fromHeader;
      if (c.unit === 'pp' && vk === 'level') vk = 'deltaPoint';
      next.valueKind = vk;
      if (a.role === 'compare') {
        if (vk !== 'level') { next.role = 'metric'; dropped.push({ col: a.col, reason: 'compare_not_level' }); }
        else { next.compareKind = a.compareKind ?? 'other'; if (a.compareOf != null) next.compareOf = a.compareOf; }
      }
    }
    out.push(next);
  }

  // seriesValue は同じ型・単位のものだけ（食い違うものは捨てる）
  const sv = out.filter((a) => a.role === 'seriesValue');
  if (sv.length > 1) {
    const first = col(sv[0]!.col)!;
    for (const a of sv.slice(1)) {
      const c = col(a.col)!;
      if (c.kind !== first.kind || c.unit !== first.unit) {
        dropped.push({ col: a.col, reason: 'unit_mismatch' });
        out.splice(out.indexOf(a), 1);
      }
    }
  }

  // compare：比べる相手（水準の指標）が実在する時だけ。無ければ水準の指標に戻す
  const levelMetrics = () => out.filter((a) => a.role === 'metric' && kindOf(a) === 'level');
  for (const a of out.filter((x) => x.role === 'compare')) {
    const partnerOk = (p?: number) => p != null && p !== a.col && levelMetrics().some((m) => m.col === p && m.unit === a.unit);
    if (!partnerOk(a.compareOf)) {
      const cands = levelMetrics().filter((m) => m.unit === a.unit && m.col !== a.col);
      if (cands.length === 1) a.compareOf = cands[0]!.col;
      else { a.role = 'metric'; delete a.compareOf; delete a.compareKind; dropped.push({ col: a.col, reason: 'compare_no_partner' }); }
    }
  }

  const metricCols = out.filter((a) => a.role === 'metric' || a.role === 'seriesValue').map((a) => a.col);
  const hasMetric = metricCols.length > 0 || time?.orientation === 'columns';
  if (!hasMetric) return { status: 'undetermined', reason: 'no_metric', dropped };

  const primaryMetric = r.primaryMetric != null && metricCols.includes(r.primaryMetric) ? r.primaryMetric : undefined;
  if (r.primaryMetric != null && primaryMetric == null) dropped.push({ col: r.primaryMetric, reason: 'bad_primary' });
  const h = r.hints ?? {};
  const hint = (c?: number) => (c != null && metricCols.includes(c) ? c : undefined);
  for (const [k, v] of Object.entries(h)) if (v != null && hint(v) == null) dropped.push({ col: v, reason: 'bad_hint' }), void k;
  const hints = { ...(hint(h.secondaryMetric) != null ? { secondaryMetric: hint(h.secondaryMetric)! } : {}), ...(hint(h.scaleMetric) != null ? { scaleMetric: hint(h.scaleMetric)! } : {}) };

  const map: ColumnRoleMap = {
    version: 1,
    ...(time ? { time } : {}),
    assignments: out,
    ...(primaryMetric != null ? { primaryMetric } : {}),
    ...(Object.keys(hints).length ? { hints } : {}),
    ...(r.notes?.length ? { notes: r.notes } : {}),
    source,
  };
  return { status: 'ok', map, dropped };
}
