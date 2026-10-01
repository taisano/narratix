import { primaryChart, registry, type Locale, type RecipeDef } from '@/registry';
import { isTimeAxis, timeRange } from '@/engine/transform/cagr';
import { parseTable, replaceWithTable } from '../editor/edit';
import { FAMILY_SAMPLE, familyOf, type DataFamily } from '../editor/project';
import { SCHEMA_SAMPLE, initialState, sampleFor, type BuilderState } from '../editor/state';
import type { StoryState } from './model';
import { orderedQuestions } from './storyProject';

/**
 * Story を始める前に、グラフに使うデータが足りているか（相談文には数字の表が無いことが多い）。
 * 足りなければ「データを貼り付けてから始める／見本で始めて、あとで入れる」を選んでもらう。
 * 表・言葉のスライドは相談文から下書きを入れるので、ここでは数えない
 */

export interface MissingData {
  family: DataFamily;
  /** そのデータを使うグラフの問い（並びの番号・問い・要るデータの形の元になるレシピ） */
  slides: { n: number; question: string; recipe: RecipeDef }[];
}

export function missingData(story: StoryState): MissingData[] {
  const have = new Set(story.datasets.map((d) => d.id));
  const out = new Map<DataFamily, MissingData>();
  orderedQuestions(story).forEach((q, i) => {
    if (q.presentationMode !== 'GRAPH' || q.visual || !q.referenceRecipes[0]) return;
    const recipe = registry.recipes[q.referenceRecipes[0]];
    const family = familyOf(primaryChart(recipe));
    if (have.has(family)) return;
    const m = out.get(family) ?? { family, slides: [] };
    m.slides.push({ n: i + 1, question: q.question, recipe });
    out.set(family, m);
  });
  return [...out.values()];
}

/** 年が列に並んでいたら、行と列を入れ替える（推移のグラフは行＝年） */
function timeRows(d: BuilderState['dataset'], locale: Locale): BuilderState['dataset'] {
  if (!isTimeAxis(d.cols) || isTimeAxis(d.rows)) return d;
  const tr = (v: (number | null)[][]) => d.cols.map((_, k) => d.rows.map((_, i) => v[i]?.[k] ?? null));
  return {
    ...d, rows: [...d.cols], cols: [...d.rows],
    dimensions: { rows: d.dimensions?.cols || (timeRange(d.cols) ? (locale === 'en' ? 'Year' : '年') : ''), cols: d.dimensions?.rows ?? '' },
    periods: { ...d.periods, current: { ...d.periods.current, values: tr(d.periods.current.values) }, base: { ...d.periods.base, values: tr(d.periods.base.values) } },
  };
}

/** 貼り付けた表から、その種類のデータを作る（読めなければ null） */
export function datasetFromPaste(text: string, m: MissingData, locale: Locale): BuilderState['dataset'] | null {
  const t = parseTable(text);
  // 数が1つも無い（ただの文）は表として読まない
  if (!t || !t.rows.length || !t.cols.length || !t.values.some((r) => r.some((v) => v != null))) return null;
  const recipe = m.slides[0]!.recipe;
  const base = sampleFor(m.family === 'table' ? (SCHEMA_SAMPLE[recipe.schema] ?? 'trend') : FAMILY_SAMPLE[m.family], locale);
  const s: BuilderState = { ...initialState(locale), ...base };
  const d = replaceWithTable(s, 'current', t).dataset;
  // 表のグラフ（推移など）は行＝年。年が列に並んでいたら入れ替える
  return m.family === 'table' ? timeRows(d, locale) : d;
}

/** 貼り付けたデータを Story に入れる（その種類のデータとして。出典は空＝編集画面で入れる） */
export const withPastedData = (story: StoryState, family: DataFamily, data: BuilderState['dataset']): StoryState =>
  ({ ...story, datasets: [...story.datasets.filter((d) => d.id !== family), { id: family, label: '', data, source: '' }] });
