import { registry, type ChartTypeId } from '@/registry';
import { switchChart } from './chartSwitch';
import { dataSig } from './meaning';
import { evaluate } from './preview';
import { familyOf, slideOf, viewOf, type DataFamily, type ProjectState } from './project';
import { viewAxes } from './state';

/**
 * 今のデータのまま、別のチャートの形に変える（Coach の「縦棒＋折れ線にする」「散布図にする」など）。
 * docs/decisions.md「チャートの変換」。原則：**チャートの形を変えても、利用者のデータを失わない**。
 *  1. 今のスライドとデータを読む（元の状態は変えない）
 *  2. 行き先のチャートが要るもの（関係＝数値の列 2 つ以上、バブル＝3 つ、要因＝3 行以上）を確かめる
 *  3. 行・列・値・欠けた位置・出典・期間・見出し・表示の絞り込みをそのまま持っていく（見本は読み込まない）
 *  4. 描けるか・データが同じかを確かめる
 *  5. 全部通った時だけ、新しいプロジェクトを返す（1回の元に戻すで戻せる）。通らなければ理由だけ返し、何も変えない
 */
export type ConvertFail = 'need_metrics' | 'need_rows' | 'family_in_use' | 'data_changed' | 'render';
export type ConvertResult =
  | { ok: true; project: ProjectState }
  | { ok: false; reason: ConvertFail; vars?: Record<string, string | number> };

const NEEDS: Partial<Record<ChartTypeId, { metrics?: number; rows?: number }>> = {
  scatter: { metrics: 2, rows: 2 }, bubble: { metrics: 3, rows: 2 }, variable_width: { metrics: 2, rows: 2 },
  waterfall: { rows: 3 }, driver_bar: { rows: 3 }, posneg_bar: { rows: 3 },
};

export function convertChart(p: ProjectState, chart: ChartTypeId, i: number = p.current): ConvertResult {
  const v = viewOf(p, i);
  if (v.chart === chart) return { ok: true, project: p };
  const { rows, cols } = viewAxes(v);
  // 数値の入っている列（表示している列だけ）
  const vals = v.dataset.periods.current.values;
  const numeric = cols.filter((c) => { const k = v.dataset.cols.indexOf(c); return k >= 0 && vals.some((r) => r[k] != null); });
  const need = NEEDS[chart] ?? {};
  if (need.metrics && numeric.length < need.metrics) {
    return { ok: false, reason: 'need_metrics', vars: { n: need.metrics, have: numeric.length, chart } };
  }
  if (need.rows && rows.length < need.rows) return { ok: false, reason: 'need_rows', vars: { n: need.rows, chart } };

  let next;
  try { next = switchChart(v, chart).state; } catch { return { ok: false, reason: 'render' }; }
  // 見本に置き換わっていないこと（switchChart は、見本のままの時だけ見本を替える）
  next = { ...next, dataset: v.dataset, source: v.source, title: v.title };

  const famFrom = familyOf(v.chart), famTo: DataFamily = familyOf(chart);
  let out: ProjectState;
  const slide = { ...slideOf(next, p.slides[i]!.id, null) };
  if (famFrom === famTo) {
    out = { ...p, slides: p.slides.map((s, k) => (k === i ? slide : s)) };
  } else {
    // 行き先の形のデータを、ほかのスライドが使っていたら上書きしない（そのスライドのデータが変わってしまう）
    const others = p.slides.some((s, k) => k !== i && familyOf(s.chart) === famTo);
    if (others) return { ok: false, reason: 'family_in_use', vars: { chart } };
    const data = structuredClone(v.dataset);
    out = famTo === 'table'
      ? { ...p, dataset: data, slides: p.slides.map((s, k) => (k === i ? slide : s)) }
      : { ...p, datasets: { ...(p.datasets ?? {}), [famTo]: data }, slides: p.slides.map((s, k) => (k === i ? slide : s)) };
  }

  // 確かめる：行・列・値が同じで、描ける
  const after = viewOf(out, i);
  if (dataSig(after.dataset) !== dataSig(v.dataset) || after.source !== v.source || after.title !== v.title) return { ok: false, reason: 'data_changed' };
  try { evaluate(after); } catch { return { ok: false, reason: 'render' }; }
  return { ok: true, project: out };
}

/** 変換できない理由の文言の差し込み（チャートの名前） */
export const convertChartName = (c: unknown, L: (x: { en: string; ja?: string }) => string) =>
  (typeof c === 'string' && c in registry.charts ? L(registry.charts[c as ChartTypeId].label) : '');
