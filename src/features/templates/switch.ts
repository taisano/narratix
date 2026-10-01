import type { StoryTemplateId } from '@/registry';
import type { ComparisonContent, DeltaContent, KpiContent } from '@/engine/layout/templates';
import type { BuilderState } from '../editor/state';
import { defaultComparisonLook, emptyDeltaRow, emptyKpi, ensureTemplate, sampleComparison, sampleDelta, sampleKpi, templateFilled } from './content';

/**
 * 表の型を替える時の中身の引き継ぎ（docs/decisions.md「表の型を替える時」）。
 * 比較表・ヒートマップ・基本表は同じ表を共有するので聞かない。それ以外（表 ↔ KPI ↔ 増減付き表）は、
 * 「今の表から作る／前にこの型で入れた中身に戻す／見本から作る」を選んでもらう。言葉の型は聞かない（中身が別物）
 */

export type TableFamily = 'table' | 'kpi' | 'delta';
export type SwitchChoice = 'convert' | 'previous' | 'sample';

export const familyOfTemplate = (id: StoryTemplateId | undefined): TableFamily | null =>
  id === 'STORY_TABLE_COMPARISON' || id === 'STORY_TABLE_HEATMAP' || id === 'STORY_TABLE_BASIC' ? 'table'
    : id === 'STORY_TABLE_KPI' ? 'kpi' : id === 'STORY_TABLE_DELTA' ? 'delta' : null;

/** 型によらない「項目・今・比較」の並び */
interface Lines {
  heads: { name: string; value: string; compare: string };
  unit: string;
  lines: { name: string; value: string; compare: string; unit: string }[];
}

/** 今の型の中身を「項目・今・比較」の並びに（入っている行だけ）。何も無ければ null */
export function linesOf(s: Pick<BuilderState, 'content'>, fam: TableFamily): Lines | null {
  if (fam === 'kpi') {
    const ks = (s.content?.kpi?.kpis ?? []).filter((k) => k.name.trim() || k.value.trim());
    if (!ks.length) return null;
    const units = [...new Set(ks.map((k) => k.unit.trim()))];
    return {
      heads: { name: '', value: ks[0]!.period.trim(), compare: ks[0]!.basis.trim() },
      unit: units.length === 1 ? units[0]! : '',
      lines: ks.map((k) => ({ name: k.name.trim(), value: k.value.trim(), compare: k.compare.trim(), unit: k.unit.trim() })),
    };
  }
  if (fam === 'delta') {
    const d = s.content?.delta;
    const rows = (d?.rows ?? []).filter((r) => r.name.trim() || r.value.trim());
    if (!d || !rows.length) return null;
    return { heads: { name: d.heads.name, value: d.heads.value, compare: d.heads.c1 }, unit: d.unit, lines: rows.map((r) => ({ name: r.name.trim(), value: r.value.trim(), compare: r.c1.trim(), unit: d.unit })) };
  }
  const c = s.content?.comparison;
  if (!c || !templateFilled({ view: 'STORY_TABLE_COMPARISON', content: s.content })) return null;
  // 1列目＝項目名（見出しの列がある時）、続く2列＝今・比較
  const o = c.headerCol ? 1 : 0;
  const head = c.headerRow ? c.cells[0] ?? [] : [];
  const body = c.cells.slice(c.headerRow ? 1 : 0).filter((r) => r.some((x) => x.trim()));
  return {
    heads: { name: c.headerCol ? head[0]?.trim() ?? '' : '', value: head[o]?.trim() ?? '', compare: head[o + 1]?.trim() ?? '' },
    unit: '',
    lines: body.map((r) => ({ name: c.headerCol ? r[0]?.trim() ?? '' : '', value: r[o]?.trim() ?? '', compare: r[o + 1]?.trim() ?? '', unit: '' })),
  };
}

function fromLines(fam: TableFamily, L: Lines): Partial<{ comparison: ComparisonContent; kpi: KpiContent; delta: DeltaContent }> {
  if (fam === 'kpi') {
    return { kpi: { kpis: L.lines.map((x) => emptyKpi({ name: x.name, value: x.value, compare: x.compare, unit: x.unit, period: L.heads.value, basis: L.heads.compare })), note: '' } };
  }
  if (fam === 'delta') {
    return { delta: { rows: L.lines.map((x) => emptyDeltaRow({ name: x.name, value: x.value, c1: x.compare })), heads: { name: L.heads.name, value: L.heads.value, c1: L.heads.compare, c2: '' }, unit: L.unit, lead: '', note: '' } };
  }
  const withCompare = L.lines.some((x) => x.compare) || !!L.heads.compare;
  const head = [L.heads.name, L.heads.value, ...(withCompare ? [L.heads.compare] : [])];
  // 表には単位の欄が無いので、値に単位を付けて写す（「120」＋「億円」→「120億円」）
  const cell = (v: string, u: string) => (v && u && !v.endsWith(u) ? `${v}${u}` : v);
  return {
    comparison: {
      cells: [head, ...L.lines.map((x) => [x.name, cell(x.value, x.unit), ...(withCompare ? [cell(x.compare, x.unit)] : [])])],
      headerRow: true, headerCol: true, lead: '', note: '',
    },
  };
}

const contentKey = { table: 'comparison', kpi: 'kpi', delta: 'delta' } as const;

/** 選んでもらう選択肢。null＝聞かずに替える（同じ表を共有する・言葉の型・引き継ぐものが無い） */
export function switchOptions(s: Pick<BuilderState, 'view' | 'content'>, id: StoryTemplateId): SwitchChoice[] | null {
  const from = familyOfTemplate(s.view), to = familyOfTemplate(id);
  if (!from || !to || from === to) return null;
  const out: SwitchChoice[] = [];
  if (linesOf(s, from)) out.push('convert');
  if (s.content?.[contentKey[to]]) out.push('previous');
  if (!out.length) return null;
  return [...out, 'sample'];
}

/** 選んだ方法で型を替える */
export function applySwitch(s: BuilderState, id: StoryTemplateId, choice: SwitchChoice): Pick<BuilderState, 'view' | 'content' | 'look'> {
  const to = familyOfTemplate(id)!;
  const from = familyOfTemplate(s.view);
  if (choice === 'previous') return ensureTemplate(s, id, true);
  const content = { ...(s.content ?? {}) };
  const look = { ...(s.look ?? {}) };
  if (choice === 'convert' && from) Object.assign(content, fromLines(to, linesOf(s, from)!));
  else if (to === 'kpi') content.kpi = sampleKpi(s.slideLocale);
  else if (to === 'delta') content.delta = sampleDelta(s.slideLocale);
  else content.comparison = sampleComparison(s.slideLocale);
  // 表を作り直したら、行・列の位置で覚えている強調は外す（数の形は見出しで確かめるので残しても効かない）
  if (to === 'table' && look.comparison) look.comparison = { ...look.comparison, emphasis: defaultComparisonLook().emphasis };
  if (to === 'kpi' && look.kpi) look.kpi = { ...look.kpi, emphasis: null };
  if (to === 'delta' && look.delta) look.delta = { ...look.delta, emphasis: null };
  return ensureTemplate({ ...s, content, look }, id, true);
}
