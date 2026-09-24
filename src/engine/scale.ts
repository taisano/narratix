/**
 * 値の軸。NarratiX の computeTrendLineBounds_（最小が正なら 0 から、上に範囲の 8% の余白）を基本に、
 * Web 版では「0 ちょうどから始める」「きりの良い目盛にする」に変えている（docs/decisions.md）。
 */
export interface ValueScale {
  min: number;
  max: number;
  ticks: number[];
  /** 値 → 0〜1（下端が 0） */
  ratio: (v: number) => number;
}

const PAD = 0.08;

function niceStep(span: number, count: number): number {
  const rough = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

export function valueScale(values: readonly number[], opts: { tickCount?: number } = {}): ValueScale {
  const vs = values.filter((v) => Number.isFinite(v));
  let lo = vs.length ? Math.min(...vs) : 0;
  let hi = vs.length ? Math.max(...vs) : 1;
  if (lo > 0) lo = 0;
  if (hi < 0) hi = 0;
  if (lo === hi) hi = lo + 1;
  const span = hi - lo;
  if (hi > 0) hi += span * PAD;
  if (lo < 0) lo -= span * PAD;
  const step = niceStep(hi - lo, (opts.tickCount ?? 5) - 1);
  const min = lo < 0 ? Math.floor(lo / step - 1e-9) * step : 0;
  const max = hi > 0 ? Math.ceil(hi / step - 1e-9) * step : 0;
  const ticks: number[] = [];
  for (let t = min; t <= max + step * 1e-6; t += step) ticks.push(Math.round(t / step) * step);
  return { min, max, ticks, ratio: (v) => (v - min) / (max - min || 1) };
}

/** 0〜100% の固定の軸（100% 積み上げ用） */
export function shareScale(): ValueScale {
  return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], ratio: (v) => v };
}
