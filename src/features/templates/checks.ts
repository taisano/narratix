import { COMPARISON_LIMITS, CONCLUSION_LIMITS, DELTA_LIMITS, EXEC_LIMITS, HEAT_LIMITS, IIA_LIMITS, KPI_LIMITS, NEXT_LIMITS, NUM_LIMITS } from '@/registry';
import { nonAdditiveUnit } from '@/engine/format';
import { blockLabel, colLabel, execFilled, iiaFilled, kpiDelta, parseCell, type IiaContent, type NumbersContent, type NextContent, type NextLook, type DeltaContent, type DeltaLook, type ExecContent, type ComparisonContent, type ComparisonLook, type HeatLook, type ConclusionContent, type KpiContent, type KpiLook } from '@/engine/layout/templates';
import type { MessageKey } from '@/i18n/ui';
import { isSampleSource } from '../editor/leftovers';
import { SAMPLE_DELTA_NAMES, SAMPLE_HEADS, SAMPLE_KPI_NAMES } from './content';

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

export function execChecks(title: string, c: ExecContent, refExists: (id: string) => boolean, locale: 'ja' | 'en'): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  if (!title.trim()) out.push({ key: 'tpl.warn.noTitle' });
  if (!execFilled(c)) out.push({ key: 'tpl.warn.execEmpty' });
  if (c.mode === 'free') {
    const f = c.free ?? { body: '', refs: [] };
    if (len(f.body) > EXEC_LIMITS.free) out.push({ key: 'tpl.warn.execLong', vars: { name: locale === 'ja' ? '本文' : 'Body', len: len(f.body), max: EXEC_LIMITS.free } });
    if (f.refs.some((r) => !refExists(r))) out.push({ key: 'tpl.warn.execRefGone', vars: { name: locale === 'ja' ? '本文' : 'Body' } });
    return out;
  }
  for (const b of c.blocks) {
    const name = blockLabel(b, locale);
    if (len(b.body) > EXEC_LIMITS.body) out.push({ key: 'tpl.warn.execLong', vars: { name, len: len(b.body), max: EXEC_LIMITS.body } });
    if (b.refs.some((r) => !refExists(r))) out.push({ key: 'tpl.warn.execRefGone', vars: { name } });
  }
  return out;
}

export function deltaChecks(c: DeltaContent, look: DeltaLook, source: string): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  const rows = c.rows.filter((r) => r.name.trim() || r.value.trim());
  if (!rows.length) return [{ key: 'tpl.warn.deltaNone' }];
  if (rows.length > DELTA_LIMITS.maxRows) out.push({ key: 'tpl.warn.manyRows', vars: { n: rows.length, max: DELTA_LIMITS.maxRows } });
  const second = rows.some((r) => r.c2.trim());
  rows.forEach((r, i) => {
    const name = r.name.trim() || String(i + 1);
    const vals = [r.value, r.c1, ...(second ? [r.c2] : [])];
    if (vals.some((v) => v.trim() && parseCell(v).value == null)) out.push({ key: 'tpl.warn.deltaNotNumber', vars: { name } });
    if (!r.value.trim() || !r.c1.trim()) out.push({ key: 'tpl.warn.deltaMissing', vars: { name } });
    else if (parseCell(r.c1).value === 0 && look.delta1 !== 'diff') out.push({ key: 'tpl.warn.kpiZeroBase', vars: { name } });
  });
  if (rows.some((r) => SAMPLE_DELTA_NAMES.has(r.name.trim()))) out.push({ key: 'tpl.warn.deltaSampleName' });
  if (look.total && nonAdditiveUnit(c.unit)) out.push({ key: 'tpl.warn.deltaNoTotal' });
  const names = rows.map((r) => r.name.trim()).filter((x, k, a) => x && a.indexOf(x) !== k);
  if (names.length) out.push({ key: 'tpl.warn.dupHead', vars: { names: [...new Set(names)].join('、') } });
  if (look.showSource && isSampleSource(source)) out.push({ key: 'tpl.warn.sampleSource' });
  return out;
}

export function iiaChecks(title: string, c: IiaContent, refExists: (id: string) => boolean, locale: 'ja' | 'en'): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  if (!title.trim()) out.push({ key: 'tpl.warn.noTitle' });
  if (!iiaFilled(c)) return [...out, { key: 'tpl.warn.iiaEmpty' }];
  const filled = (id: string) => !!c.cols.find((x) => x.id === id)?.items.some((i) => i.text.trim());
  if (!filled('action')) out.push({ key: 'tpl.warn.iiaNoAction' });
  for (const col of c.cols) {
    const name = colLabel(col, locale);
    const its = col.items.filter((i) => i.text.trim());
    if (its.length > IIA_LIMITS.items) out.push({ key: 'tpl.warn.iiaMany', vars: { name, n: its.length, max: IIA_LIMITS.items } });
    if (its.some((i) => len(i.text) > IIA_LIMITS.text)) out.push({ key: 'tpl.warn.iiaLong', vars: { name, max: IIA_LIMITS.text } });
    if (col.refs.some((r) => !refExists(r))) out.push({ key: 'tpl.warn.execRefGone', vars: { name } });
  }
  return out;
}

/** ヒートマップ型の表：比較表の確認に加えて、物差しの違う値を同じ範囲で比べていないか・数が少なすぎないか */
export function heatChecks(c: ComparisonContent, look: HeatLook, source: string): TemplateWarning[] {
  // 多くの項目から特徴を見つける表なので、行・列の数の目安は比較表より大きい
  const out = comparisonChecks(c, { ...look, emphasis: { kind: 'none' } }, source).filter((w) => w.key !== 'tpl.warn.manyCols' && w.key !== 'tpl.warn.manyRows');
  const w = Math.max(0, ...c.cells.map((r) => r.length)) - (c.headerCol ? 1 : 0);
  const h = c.cells.length - (c.headerRow ? 1 : 0);
  if (w > HEAT_LIMITS.maxCols) out.push({ key: 'tpl.warn.manyCols', vars: { n: w, max: HEAT_LIMITS.maxCols } });
  if (h > HEAT_LIMITS.maxRows) out.push({ key: 'tpl.warn.manyRows', vars: { n: h, max: HEAT_LIMITS.maxRows } });
  const nums = c.cells.flatMap((r, i) => (c.headerRow && i === 0 ? [] : r.filter((_, j) => !(c.headerCol && j === 0)))).map(parseCell).filter((p) => p.value != null);
  if (nums.length < 3) out.push({ key: 'tpl.warn.heatFew' });
  if (look.scale === 'all' && new Set(nums.map((p) => `${p.mark}:${p.suffix}`)).size > 1) out.push({ key: 'tpl.warn.heatMixed' });
  return out;
}

export function numbersChecks(title: string, c: NumbersContent, refExists: (id: string) => boolean): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  if (!title.trim()) out.push({ key: 'tpl.warn.noTitle' });
  const nums = c.items.filter((x) => x.value.trim() || x.label.trim() || x.body.trim());
  if (!nums.length) return [...out, { key: 'tpl.warn.numNone' }];
  if (nums.length > NUM_LIMITS.max) out.push({ key: 'tpl.warn.numMany', vars: { n: nums.length, max: NUM_LIMITS.max } });
  nums.forEach((x, i) => {
    const n = i + 1;
    if (!x.value.trim()) out.push({ key: 'tpl.warn.numNoValue', vars: { n } });
    if (!x.body.trim()) out.push({ key: 'tpl.warn.numNoBody', vars: { n } });
    else if (len(x.body) > NUM_LIMITS.body) out.push({ key: 'tpl.warn.numLong', vars: { n, len: len(x.body), max: NUM_LIMITS.body } });
    if (x.ref && !refExists(x.ref)) out.push({ key: 'tpl.warn.refGone', vars: { n } });
  });
  return out;
}

/** 次のアクション：件数・長さ・担当と期限の抜け（表やカードに出す列だけ確かめる） */
export function nextChecks(title: string, c: NextContent, look: NextLook): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  if (!title.trim()) out.push({ key: 'tpl.warn.noTitle' });
  const acts = c.items.filter((x) => x.text.trim());
  if (!acts.length) return [...out, { key: 'tpl.warn.nextNone' }];
  if (acts.length > NEXT_LIMITS.max) out.push({ key: 'tpl.warn.nextMany', vars: { n: acts.length, max: NEXT_LIMITS.max } });
  const long = acts.map((x, i) => (len(x.text) > NEXT_LIMITS.text ? i + 1 : 0)).filter(Boolean);
  if (long.length) out.push({ key: 'tpl.warn.nextLong', vars: { n: long.join('・'), max: NEXT_LIMITS.text } });
  const miss = acts.map((x, i) => ((look.showOwner && !x.owner.trim()) || (look.showDue && !x.due.trim()) ? i + 1 : 0)).filter(Boolean);
  if (miss.length) out.push({ key: 'tpl.warn.nextNoOwner', vars: { n: miss.join('・') } });
  return out;
}
