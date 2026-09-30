import { primaryChart, registry, type ComplementId, type PurposeId, type RecipeDef } from '@/registry';
import { SCHEMA_SAMPLE, SPECIAL_SAMPLE, comboSample, dropDataBound, pairSample, sampleFor, type BuilderState } from './state';

/** データがサンプルのまま（ユーザーがまだ入れていない）か */
export function isSampleData(s: BuilderState): boolean {
  // 日本語・英語どちらの見本でも「見本のまま」とみなす
  const now = JSON.stringify(s.dataset);
  const same = (p: PurposeId) => (['ja', 'en'] as const).some((l) => JSON.stringify(sampleFor(p, l).dataset) === now);
  return (['composition', 'trend', 'contribution', 'relationship'] as const).some(same)
    || (['ja', 'en'] as const).some((l) => JSON.stringify(pairSample(l).dataset) === now || JSON.stringify(comboSample(l).dataset) === now);
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
  // レシピの主チャートの既定の設定（例：値ラベルは最初と最後）。画面で変えられるよう状態に入れる
  const controls = { ...s.controls, ...(main.controls ?? {}) };
  let next: BuilderState = { ...s, chart, complements, controls };
  if (chart === 'mekko') {
    next.mekko = { ...s.mekko, showTotal: r.view.panels.some((p) => p.id === 'total') };
    next.complements.aligned_table = r.view.panels.some((p) => p.table === 'growth_table');
  }
  if (isSampleData(s)) {
    const wantPurpose = SCHEMA_SAMPLE[r.schema] ?? 'trend';
    // 2指標スロープは左右の指標の表が2つ要るので、専用の見本
    // 2つの指標を並べるレシピ（行をそろえた2指標比較）も、2つの指標の見本
    const twoMetrics = r.view.panels.some((p) => p.controls?.side_measure === 'metric2');
    const special = twoMetrics ? pairSample : SPECIAL_SAMPLE[chart];
    const sample = special ? special(s.slideLocale) : sampleFor(wantPurpose, s.slideLocale);
    if (JSON.stringify(sample.dataset) !== JSON.stringify(s.dataset)) next = { ...next, ...sample, controls: dropDataBound(next.controls) };
  }
  return next;
}
