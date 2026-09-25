import { primaryChart, registry, type ComplementId, type PurposeId, type RecipeDef } from '@/registry';
import { SCHEMA_SAMPLE, sampleFor, type BuilderState } from './state';

/** データがサンプルのまま（ユーザーがまだ入れていない）か */
export function isSampleData(s: BuilderState): boolean {
  const same = (p: PurposeId) => JSON.stringify(sampleFor(p).dataset) === JSON.stringify(s.dataset);
  return (['composition', 'trend', 'contribution', 'relationship'] as const).some(same);
}

/**
 * 選んだレシピをエディタの状態にする（③ を作るまでの間、1枚ずつ作るため）。
 * チャートと、チャートの中の補完パーツはレシピのとおり。「見えにくいこと」から足した補完パーツもオンにする。
 * データは、サンプルのままならレシピに合うサンプルに替え、ユーザーが入れたデータはそのまま使う。
 */
export function applyRecipe(s: BuilderState, r: RecipeDef, extra: ComplementId[] = []): BuilderState {
  const chart = primaryChart(r);
  const main = r.view.panels.find((p) => p.id === 'main')!;
  const want = new Set<ComplementId>([...(main.inChartComplements ?? []).map((c) => c.id), ...extra]);
  const complements = { ...s.complements };
  for (const def of Object.values(registry.complements)) {
    if (def.placement === 'in_chart' && def.appliesTo.includes(chart)) complements[def.id] = want.has(def.id) || !!def.defaultOn;
  }
  let next: BuilderState = { ...s, chart, complements };
  if (chart === 'mekko') {
    next.mekko = { ...s.mekko, showTotal: r.view.panels.some((p) => p.id === 'total') };
    next.complements.aligned_table = r.view.panels.some((p) => p.table === 'growth_table');
  }
  if (isSampleData(s)) {
    const wantPurpose = SCHEMA_SAMPLE[r.schema] ?? 'trend';
    const sample = sampleFor(wantPurpose);
    if (JSON.stringify(sample.dataset) !== JSON.stringify(s.dataset)) next = { ...next, ...sample };
  }
  return next;
}
