import type { Locale } from '@/registry';
import type { SceneItem } from '../../scene';
import { nonAdditiveUnit } from '../../format';
import { formatCell, parseCell } from './cells';
import { layoutComparison, type TableBox } from './comparison';
import { KPI_STYLE } from './kpi';
import type { ComparisonContent, ComparisonLook, DeltaContent, DeltaLook, DeltaMode, DeltaRow, GoodDirection } from './types';

/**
 * 増減付き表（STORY_TABLE_DELTA）の配置。描き方は比較表と同じ（紺の見出し・行の区切り線・強調・揃え）。
 * 列：項目／今の値／（比較1の値）／比較1との差・率／（比較2の値）／比較2との差・率。差と率はアプリが計算する。
 * 合計の行もアプリが計算する（% など足せない単位、数でない値がある時は出さない）
 */

/** 入っている行（項目名か今の値がある） */
export const filledDeltaRows = (c: DeltaContent): DeltaRow[] => c.rows.filter((r) => r.name.trim() || r.value.trim());

/** 比較2を使うか（値が1つでもある） */
export const usesSecond = (c: DeltaContent): boolean => c.rows.some((r) => r.c2.trim());

type Num = { v: number | null; pct: boolean };
const num = (s: string): Num => { const p = parseCell(s); return { v: p.value, pct: p.mark === 'pct' }; };

const signed = (n: number, digits: number) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  if (r === 0) return '±0';
  return (r > 0 ? '+' : '−') + Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const digitsOf = (x: number) => (Number.isInteger(Math.round(x * 100) / 100) ? 0 : 1);

/** 差と率（どちらかが数でなければ null。比較が0なら率は null。% の値は差を pt で） */
export function rowDelta(value: string, compare: string): { diff: number; pct: number | null; isPct: boolean } | null {
  const a = num(value), b = num(compare);
  if (a.v == null || b.v == null) return null;
  const diff = a.v - b.v;
  return { diff, pct: b.v === 0 || a.pct ? null : (diff / Math.abs(b.v)) * 100, isPct: a.pct };
}

const colorOf = (good: GoodDirection, diff: number) =>
  good === 'none' || Math.abs(diff) < 1e-12 ? undefined : (good === 'up') === diff > 0 ? KPI_STYLE.good : KPI_STYLE.bad;

/** 差の列・率の列の見出し（例：2023年差、2023年比、計画差、計画比） */
function deltaHeads(label: string, mode: DeltaMode, locale: Locale): string[] {
  const ja = locale === 'ja';
  const diff = ja ? `${label}差` : `vs ${label}`;
  const pct = ja ? `${label}比` : `vs ${label} (%)`;
  return mode === 'diff' ? [diff] : mode === 'pct' ? [pct] : [diff, pct];
}

export function layoutDelta(c: DeltaContent, look: DeltaLook, area: TableBox, locale: Locale): { items: SceneItem[]; dense: boolean } {
  const ja = locale === 'ja';
  const rows0 = filledDeltaRows(c);
  if (!rows0.length) return { items: [], dense: false };
  const second = usesSecond(c);
  const unit = c.unit.trim();
  const h = c.heads;
  const l1 = h.c1.trim() || (ja ? '比較' : 'comparison');
  const l2 = h.c2.trim() || (ja ? '計画' : 'plan');
  const withUnit = (t: string) => (unit ? (ja ? `${t}（${unit}）` : `${t} (${unit})`) : t);

  // 並べ方
  const rows = [...rows0];
  const val = (r: DeltaRow) => num(r.value).v ?? -Infinity;
  if (look.sort === 'value') rows.sort((a, b) => val(b) - val(a));
  // 増減の大きい順：率だけを出している時は率、それ以外は差で
  const key = (r: DeltaRow) => { const d = rowDelta(r.value, r.c1); return d ? (look.delta1 === 'pct' && d.pct != null ? d.pct : d.diff) : -Infinity; };
  if (look.sort === 'delta') rows.sort((a, b) => key(b) - key(a));

  // 合計の行：足せる単位で、今と比較がすべて数の時だけ
  const sumOf = (pick: (r: DeltaRow) => string) => {
    let s = 0;
    for (const r of rows) { const n = num(pick(r)); if (n.v == null || n.pct) return null; s += n.v; }
    return s;
  };
  const totals = look.total && !nonAdditiveUnit(unit)
    ? { value: sumOf((r) => r.value), c1: sumOf((r) => r.c1), c2: second ? sumOf((r) => r.c2) : null } : null;
  const hasTotal = !!totals && totals.value != null;
  const fmtNum = (n: number | null) => (n == null ? '' : formatCell(String(Math.round(n * 100) / 100), look.format));

  // 列を組む
  const header = [h.name.trim() || (ja ? '項目' : 'Item'), withUnit(h.value.trim() || (ja ? '今' : 'Current'))];
  if (look.showCompare) header.push(withUnit(l1));
  header.push(...deltaHeads(l1, look.delta1, locale));
  if (second) {
    if (look.showCompare) header.push(withUnit(l2));
    header.push(...deltaHeads(l2, look.delta2, locale));
  }
  const colors: (string | undefined)[][] = [header.map(() => undefined)];
  const deltaCells = (value: string, compare: string, mode: DeltaMode): { text: string; color?: string }[] => {
    const d = rowDelta(value, compare);
    const n = mode === 'both' ? 2 : 1;
    if (!d) return Array.from({ length: n }, () => ({ text: '' }));
    const color = colorOf(look.good, d.diff);
    const diffT = d.isPct ? `${signed(d.diff, 1)}pt` : signed(d.diff, look.format?.kind === 'dec' ? look.format.digits ?? 1 : digitsOf(d.diff));
    const pctT = d.isPct ? `${signed(d.diff, 1)}pt` : d.pct == null ? '—' : `${signed(d.pct, 1)}%`;
    return mode === 'diff' ? [{ text: diffT, color }] : mode === 'pct' ? [{ text: pctT, color }] : [{ text: diffT, color }, { text: d.isPct ? '' : pctT, color }];
  };
  const lineOf = (name: string, value: string, c1: string, c2: string) => {
    const cells: { text: string; color?: string }[] = [{ text: name }, { text: formatCell(value, look.format) }];
    if (look.showCompare) cells.push({ text: formatCell(c1, look.format) });
    cells.push(...deltaCells(value, c1, look.delta1));
    if (second) {
      if (look.showCompare) cells.push({ text: formatCell(c2, look.format) });
      cells.push(...deltaCells(value, c2, look.delta2));
    }
    return cells;
  };
  const body = rows.map((r) => lineOf(r.name.trim(), r.value, r.c1, r.c2));
  if (hasTotal) {
    const t = totals!;
    body.push(lineOf(ja ? '合計' : 'Total', fmtNum(t.value), t.c1 == null ? '' : fmtNum(t.c1), t.c2 == null ? '' : fmtNum(t.c2)));
  }
  for (const r of body) colors.push(r.map((x) => x.color));

  const content: ComparisonContent = { cells: [header, ...body.map((r) => r.map((x) => x.text))], headerRow: true, headerCol: true, lead: c.lead, note: c.note };
  const emRow = look.emphasis ? rows.findIndex((r) => r.id === look.emphasis) : -1;
  const cl: ComparisonLook = {
    emphasis: emRow >= 0 ? { kind: 'row', index: emRow + 1 } : { kind: 'none' },
    showLead: look.showLead, showSource: look.showSource, rowLines: look.rowLines, headerFill: look.headerFill,
    formatAxis: 'row', formats: {}, ...(look.align ? { align: look.align } : {}),
  };
  const totalIdx = hasTotal ? body.length : -1;
  return layoutComparison(content, cl, area, { color: (i, j) => colors[i]?.[j], bold: (i) => i === totalIdx });
}
