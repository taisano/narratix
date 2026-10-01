import { COMPARISON_LIMITS, CONCLUSION_LIMITS, KPI_LIMITS } from '@/registry';
import { kpiDelta, parseCell, type ComparisonContent, type ComparisonLook, type ConclusionContent, type KpiContent, type KpiLook } from '@/engine/layout/templates';
import type { MessageKey } from '@/i18n/ui';
import { isSampleSource } from '../editor/leftovers';
import { SAMPLE_HEADS, SAMPLE_KPI_NAMES } from './content';

/**
 * 表・言葉の型の確認（規則。docs/story-spec「表で整理」3.6・「言葉でまとめる」4.6）。
 * どれも注意として出すだけで、出力は止めない。行・列・セルを勝手に消したり変えたりしない
 */

export type TemplateWarning = { key: MessageKey; vars?: Record<string, string | number> };

const len = (s: string) => [...s.trim()].length;
const TOTAL = /^(合計|計|総計|小計|total|sum|subtotal)$/i;

export function comparisonChecks(c: ComparisonContent, look: ComparisonLook, source: string): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  const cells = c.cells;
  const w = Math.max(0, ...cells.map((r) => r.length));
  const at = (i: number, j: number) => cells[i]?.[j] ?? '';
  const bodyRows = cells.map((_, i) => i).filter((i) => !(c.headerRow && i === 0));
  const bodyCols = Array.from({ length: w }, (_, j) => j).filter((j) => !(c.headerCol && j === 0));
  const label = (axis: 'row' | 'col', k: number) =>
    (axis === 'row' ? (c.headerCol ? at(k, 0) : '') : c.headerRow ? at(0, k) : '').trim() || String(k + 1);

  // 大きさ（消さずに知らせる）
  if (bodyCols.length > COMPARISON_LIMITS.maxCandidates) out.push({ key: 'tpl.warn.manyCols', vars: { n: bodyCols.length, max: COMPARISON_LIMITS.maxCandidates } });
  if (bodyRows.length > COMPARISON_LIMITS.maxCriteria) out.push({ key: 'tpl.warn.manyRows', vars: { n: bodyRows.length, max: COMPARISON_LIMITS.maxCriteria } });

  // 数の項目（数の形を決める単位）ごと：数の中に文字が混じっていないか、単位・通貨が揃っているか
  const axis = look.formatAxis;
  const lines = axis === 'row' ? bodyRows : bodyCols;
  for (const k of lines) {
    const vals = (axis === 'row' ? bodyCols.map((j) => at(k, j)) : bodyRows.map((i) => at(i, k))).filter((v) => v.trim());
    const parsed = vals.map(parseCell);
    const nums = parsed.filter((p) => p.value != null);
    if (nums.length >= 2 && nums.length < vals.length && nums.length >= vals.length / 2) {
      out.push({ key: 'tpl.warn.mixedText', vars: { name: label(axis, k) } });
    }
    const marks = new Set(nums.map((p) => `${p.mark}:${p.suffix}`));
    if (marks.size > 1) out.push({ key: 'tpl.warn.mixedUnit', vars: { name: label(axis, k) } });
  }

  // 合計の行・列が、% と金額など違う指標を足していないか
  const totalRows = c.headerCol ? bodyRows.filter((i) => TOTAL.test(at(i, 0).trim())) : [];
  const totalCols = c.headerRow ? bodyCols.filter((j) => TOTAL.test(at(0, j).trim())) : [];
  const mixedMarks = (vs: string[]) => new Set(vs.map(parseCell).filter((p) => p.value != null).map((p) => p.mark)).size > 1;
  if (totalRows.length && bodyCols.some((j) => mixedMarks(bodyRows.filter((i) => !totalRows.includes(i)).map((i) => at(i, j))))) out.push({ key: 'tpl.warn.mixedTotal' });
  else if (totalCols.length && bodyRows.some((i) => mixedMarks(bodyCols.filter((j) => !totalCols.includes(j)).map((j) => at(i, j))))) out.push({ key: 'tpl.warn.mixedTotal' });

  // 見出し：空・同じ名前・見本のまま
  const heads = [
    ...(c.headerRow ? bodyCols.map((j) => at(0, j)) : []),
    ...(c.headerCol ? bodyRows.map((i) => at(i, 0)) : []),
  ];
  if (heads.some((h) => !h.trim())) out.push({ key: 'tpl.warn.emptyHead' });
  const dup = (xs: string[]) => xs.map((x) => x.trim()).filter((x, i, a) => x && a.indexOf(x) !== i);
  const dupCols = c.headerRow ? dup(bodyCols.map((j) => at(0, j))) : [];
  const dupRows = c.headerCol ? dup(bodyRows.map((i) => at(i, 0))) : [];
  if (dupCols.length || dupRows.length) out.push({ key: 'tpl.warn.dupHead', vars: { names: [...new Set([...dupCols, ...dupRows])].join('、') } });
  if (heads.some((h) => SAMPLE_HEADS.has(h.trim()))) out.push({ key: 'tpl.warn.sampleHead' });
  if (look.showSource && isSampleSource(source)) out.push({ key: 'tpl.warn.sampleSource' });
  return out;
}

export function conclusionChecks(title: string, c: ConclusionContent, refExists: (id: string) => boolean): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  if (!title.trim()) out.push({ key: 'tpl.warn.noTitle' });
  else if (len(title) > CONCLUSION_LIMITS.title) out.push({ key: 'tpl.warn.longTitle', vars: { n: len(title), max: CONCLUSION_LIMITS.title } });
  const filled = c.reasons.filter((r) => r.heading.trim() || r.body.trim());
  if (!filled.length) out.push({ key: 'tpl.warn.noReason' });
  c.reasons.forEach((r, i) => {
    const n = i + 1;
    if (r.heading.trim() && !r.body.trim()) out.push({ key: 'tpl.warn.noBody', vars: { n } });
    if (len(r.heading) > CONCLUSION_LIMITS.heading) out.push({ key: 'tpl.warn.longHeading', vars: { n, len: len(r.heading), max: CONCLUSION_LIMITS.heading } });
    if (len(r.body) > CONCLUSION_LIMITS.body) out.push({ key: 'tpl.warn.longBody', vars: { n, len: len(r.body), max: CONCLUSION_LIMITS.body } });
    if (r.ref && !refExists(r.ref)) out.push({ key: 'tpl.warn.refGone', vars: { n } });
  });
  return out;
}


export function kpiChecks(c: KpiContent, look: KpiLook): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  const kpis = c.kpis.filter((k) => k.name.trim() || k.value.trim());
  if (!kpis.length) return [{ key: 'tpl.warn.kpiNone' }];
  if (kpis.length > KPI_LIMITS.max) out.push({ key: 'tpl.warn.kpiMany', vars: { n: kpis.length, max: KPI_LIMITS.max } });
  kpis.forEach((k, i) => {
    const name = k.name.trim() || String(i + 1);
    const v = parseCell(k.value);
    if (!k.value.trim()) out.push({ key: 'tpl.warn.kpiNoValue', vars: { name } });
    else if (v.value == null) out.push({ key: 'tpl.warn.kpiNotNumber', vars: { name } });
    else if (!k.unit.trim() && v.mark === 'plain') out.push({ key: 'tpl.warn.kpiNoUnit', vars: { name } });
    if (k.compare.trim() && parseCell(k.compare).value == null) out.push({ key: 'tpl.warn.kpiNotNumber', vars: { name } });
    const d = kpiDelta(k);
    if (d && d.pct == null && !d.isPct && look.delta !== 'diff') out.push({ key: 'tpl.warn.kpiZeroBase', vars: { name } });
    if (d && look.showBasis && !k.basis.trim()) out.push({ key: 'tpl.warn.kpiNoBasis', vars: { name } });
  });
  if (kpis.some((k) => SAMPLE_KPI_NAMES.has(k.name.trim()))) out.push({ key: 'tpl.warn.kpiSampleName' });
  return out;
}
