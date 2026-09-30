import { registry, type Locale } from '@/registry';
import { isSampleData } from './fromRecipe';
import { isSampleSource } from './leftovers';
import { BRIDGE_TITLE, BRIDGE_TITLE_EN, PAIR_TITLE, PAIR_TITLE_EN, RELATION_TITLE, RELATION_TITLE_EN, SAMPLE_TITLE, SAMPLE_TITLE_EN, TREND_TITLE, TREND_TITLE_EN } from './sample';
import { isTwoMetricChart, pairSample, purposeOf, sampleFor, type BuilderState } from './state';

const TITLE_PAIRS: [string, string][] = [[SAMPLE_TITLE, SAMPLE_TITLE_EN], [TREND_TITLE, TREND_TITLE_EN], [BRIDGE_TITLE, BRIDGE_TITLE_EN], [RELATION_TITLE, RELATION_TITLE_EN], [PAIR_TITLE, PAIR_TITLE_EN]];

/**
 * スライドの言語を替える。固定の文言（凡例・注記など）は描画の時に替わる。
 * 入力した文言（タイトル・出典・項目名）は翻訳しない。ただし見本のまま（データ・見本のタイトル・切り口の問い・見本の出典）は、その言語の見本に替える
 */
export function switchSlideLocale(s: BuilderState, to: Locale): BuilderState {
  if (s.slideLocale === to) return s;
  let next: BuilderState = { ...s, slideLocale: to };
  if (isSampleData(s)) {
    const sample = isTwoMetricChart(s.chart) ? pairSample(to) : sampleFor(purposeOf(s), to);
    // 見本の中の名前を指す設定（強調・表に出す行など）は、同じ位置の新しい名前に置き換える
    const map = new Map<string, string>();
    s.dataset.rows.forEach((r, i) => { const n = sample.dataset.rows[i]; if (n) map.set(r, n); });
    s.dataset.cols.forEach((c, i) => { const n = sample.dataset.cols[i]; if (n) map.set(c, n); });
    const re = (v: unknown): unknown => (typeof v === 'string' ? map.get(v) ?? v : Array.isArray(v) ? v.map(re) : v);
    const controls = Object.fromEntries(Object.entries(s.controls).map(([k, v]) => [k, re(v)]));
    const growthRows = s.mekko.growthRows.map((k) => (k.startsWith('series:') ? `series:${map.get(k.slice(7)) ?? k.slice(7)}` : k));
    next = { ...next, dataset: sample.dataset, controls, mekko: { ...s.mekko, growthRows } };
  }
  // 見本のタイトル・切り口の問いのままなら、その言語に
  const title = s.title.trim();
  const pair = TITLE_PAIRS.find(([ja, en]) => title === ja || title === en);
  const q = s.recipe ? registry.recipes[s.recipe]?.question : undefined;
  if (pair) next.title = to === 'en' ? pair[1] : pair[0];
  else if (q && (title === q.ja || title === q.en)) next.title = (to === 'en' ? q.en : q.ja) ?? s.title;
  if (isSampleSource(s.source)) next.source = sampleFor('trend', to).source;
  return next;
}
