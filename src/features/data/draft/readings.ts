import type { Dataset, RecipeId } from '@/registry';
import type { DraftShape } from './shape';

/**
 * 読み取り（事実だけ）：貼った表の数値から、コードが計算する。AI は使わない。
 * 「A が下がり、B が上がった」「関係の強さ」までで、原因は書かない（相関は因果を示さない）
 */
export type Reading =
  | { kind: 'correlation'; r: number; n: number; strength: 'strong' | 'moderate' | 'weak'; sign: 'positive' | 'negative'; x: string; y: string }
  | { kind: 'top'; name: string; value: number; unit: string; n: number }
  | { kind: 'moves'; up: number; down: number; flat: number; biggestUp?: { name: string; diff: number }; biggestDown?: { name: string; diff: number }; from: string; to: string; unit: string };

/** ピアソンの相関係数。値が2組未満・どちらかが一定なら null */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

const strengthOf = (r: number): 'strong' | 'moderate' | 'weak' => (Math.abs(r) >= 0.7 ? 'strong' : Math.abs(r) >= 0.4 ? 'moderate' : 'weak');

const RELATION: RecipeId[] = ['REL_SCATTER', 'REL_BUBBLE', 'REL_QUADRANT'];

/** この形・この候補で、表の下に出す読み取り（出せなければ null） */
export function readingOf(shape: DraftShape, recipe: RecipeId, d: Dataset): Reading | null {
  const cur = d.periods.current.values;
  if (shape === 'relation' && RELATION.includes(recipe)) {
    const pairs = cur.map((r) => [r[0], r[1]] as const).filter((p): p is readonly [number, number] => p[0] != null && p[1] != null && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    if (r == null) return null;
    return { kind: 'correlation', r, n: pairs.length, strength: strengthOf(r), sign: r >= 0 ? 'positive' : 'negative', x: d.cols[0] ?? '', y: d.cols[1] ?? '' };
  }
  if (shape === 'item_metric') {
    const row = cur[cur.length - 1] ?? [];
    let best = -1;
    row.forEach((v, i) => { if (v != null && Number.isFinite(v) && (best < 0 || v > row[best]!)) best = i; });
    return best < 0 ? null : { kind: 'top', name: d.cols[best]!, value: row[best]!, unit: d.unit ?? '', n: row.filter((v) => v != null).length };
  }
  if (shape === 'item_compare' && cur.length >= 2) {
    const base = cur[0]!, now = cur[cur.length - 1]!;
    let up = 0, down = 0, flat = 0;
    let bu: { name: string; diff: number } | undefined, bd: { name: string; diff: number } | undefined;
    d.cols.forEach((name, i) => {
      const a = base[i], b = now[i];
      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return;
      const diff = b - a;
      if (diff > 0) { up++; if (!bu || diff > bu.diff) bu = { name, diff }; }
      else if (diff < 0) { down++; if (!bd || diff < bd.diff) bd = { name, diff }; }
      else flat++;
    });
    return { kind: 'moves', up, down, flat, ...(bu ? { biggestUp: bu } : {}), ...(bd ? { biggestDown: bd } : {}), from: d.rows[0] ?? '', to: d.rows[d.rows.length - 1] ?? '', unit: d.unit ?? '' };
  }
  return null;
}
