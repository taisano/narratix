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

/**
 * きりの良い刻み（1・2・2.5・5 × 10^n）のうち、目盛の区間が 3〜7 になり、
 * 軸の端が値の範囲に最も近くなるもの（同じなら刻みの大きい方）
 */
function niceStep(lo: number, hi: number): number {
  const span = hi - lo;
  const mag = Math.pow(10, Math.floor(Math.log10(span)));
  let best: { step: number; waste: number } | null = null;
  for (const m of [mag / 10, mag]) {
    for (const k of [1, 2, 2.5, 5]) {
      const step = k * m;
      const a = lo < 0 ? Math.floor(lo / step - 1e-9) * step : 0;
      const b = hi > 0 ? Math.ceil(hi / step - 1e-9) * step : 0;
      const n = Math.round((b - a) / step);
      if (n < 3 || n > 7) continue;
      const waste = (b - a) - span;
      if (!best || waste < best.waste - 1e-9 || (Math.abs(waste - best.waste) < 1e-9 && step > best.step)) best = { step, waste };
    }
  }
  return best?.step ?? span / 4;
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
  void opts;
  const step = niceStep(lo, hi);
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

/**
 * 0 を含めない軸（散布図用）。値の範囲の上下に 12% の余白を付け（NarratiX の computePaddedAxisBounds_ と同じ）、
 * きりの良い刻みで端をそろえる
 */
export function rangeScale(values: readonly number[]): ValueScale {
  const vs = values.filter((v) => Number.isFinite(v));
  let lo = vs.length ? Math.min(...vs) : 0;
  let hi = vs.length ? Math.max(...vs) : 1;
  const span = hi - lo;
  const pad = span > 0 ? span * 0.12 : Math.max(Math.abs(hi || lo || 1) * 0.18, 1);
  lo -= pad; hi += pad;
  const raw = (hi - lo) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step * 1e-6; t += step) ticks.push(Math.round(t / step) * step);
  return { min, max, ticks, ratio: (v) => (v - min) / (max - min || 1) };
}
