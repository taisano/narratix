import { describe, expect, it } from 'vitest';
import { validateViewSpec, registry, type ChartTypeId, type Dataset } from '@/registry';
import { composeSlide, IMPLEMENTED_CHARTS } from '../compose';
import { textWidth } from '../../text';
import type { Scene, TextItem } from '../../scene';

/**
 * 文字どうしの重なりの検査（凡例と右上の注記など）。
 * 長い凡例名・長い単位でも、実際の文字の範囲（揃え方から計算）が重ならないこと。
 * 文字の幅は PowerPoint のフォントのぶれを見込んで 10% 広めに見る。
 */
const LONG = ['Research', 'Presentation Creation', 'Meetings & Summaries', 'Analytics & Coding', 'Routine Tasks'];
const LONG_JA = ['リサーチ・調査', '資料作成・プレゼン', '会議・議事録の要約', '分析・コード作成', '定型業務・その他'];
const rows = ['Development', 'Marketing', 'Sales', 'HR', 'Finance', 'Legal'];
const v26 = [[261, 180, 87, 424, 148], [297, 362, 142, 100, 99], [165, 302, 278, 55, 100], [183, 207, 271, 32, 107], [120, 153, 101, 250, 126], [217, 170, 184, 40, 89]];
const v24 = [[118, 60, 33, 148, 41], [99, 102, 39, 20, 20], [51, 68, 59, 11, 21], [51, 49, 70, 4, 16], [31, 40, 20, 60, 9], [60, 30, 41, 5, 14]];

function datasetFor(chart: ChartTypeId, cols: string[]): Dataset {
  const schema = registry.purposes[registry.charts[chart].purpose].schema;
  if (schema === 'DRIVER_BRIDGE') return { schema, unit: 'hours per month (all departments)', rows: ['FY2024 total', 'More analytics & coding use', 'Presentation creation growth', 'Fewer routine tasks', 'FY2026 total'], cols: ['Hours'], periods: { current: { label: '2026', values: [[1390], [2600], [1200], [60], [5250]] } } };
  if (schema === 'BUBBLE') return { schema, rows, cols: ['Usage growth rate', 'Share of analytics', 'Total hours'], groups: ['Engineering & product', 'Commercial functions', 'Commercial functions', 'Corporate functions', 'Corporate functions', 'Corporate functions'], periods: { current: { label: '2026', values: [[66, 39, 1100], [89, 10, 1000], [107, 6, 900], [105, 4, 800], [117, 33, 750], [116, 6, 700]] } } };
  const time = schema === 'MATRIX_TIME_SERIES';
  return {
    schema, unit: 'hours per month (all departments)', dimensions: { rows: time ? 'Year' : 'Department', cols: 'Use case' },
    rows: time ? ['2024', '2025', '2026'] : rows, cols,
    periods: time
      ? { current: { label: '2026', values: [[300, 250, 180, 250, 120], [500, 700, 500, 450, 300], [1260, 1370, 1063, 901, 669]] } }
      : { current: { label: '2026', values: v26 }, base: { label: '2024', values: v24 } },
  } as Dataset;
}

function extents(it: TextItem): { x0: number; x1: number; y0: number; y1: number }[] {
  const lh = (sz: number) => (sz * 1.2) / 72;
  const total = it.lines.reduce((a, l) => a + lh(l.size), 0);
  let y = it.valign === 'top' ? it.y : it.y + (it.h - total) / 2;
  return it.lines.filter((l) => l.t.trim()).map((l) => {
    const w = textWidth(l.t, l.size) * 1.1;
    const x0 = it.align === 'left' ? it.x : it.align === 'right' ? it.x + it.w - w : it.x + (it.w - w) / 2;
    const r = { x0, x1: x0 + w, y0: y + lh(l.size) * 0.15, y1: y + lh(l.size) * 0.85 };
    y += lh(l.size);
    return r;
  });
}

export function overlaps(s: Scene): string[] {
  const texts = s.items.filter((i): i is TextItem => i.kind === 'text' && !i.rotate);
  const ex = texts.flatMap((t) => extents(t).map((e, k) => ({ ...e, t: t.lines.filter((l) => l.t.trim())[k]!.t })));
  const out: string[] = [];
  for (let i = 0; i < ex.length; i++) for (let j = i + 1; j < ex.length; j++) {
    const a = ex[i]!, b = ex[j]!;
    if (a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01) out.push(`「${a.t}」×「${b.t}」`);
  }
  return out;
}

function render(chart: ChartTypeId, locale: 'ja' | 'en') {
  const d = datasetFor(chart, locale === 'en' ? LONG : LONG_JA);
  const r = validateViewSpec({
    datasetId: 't', layout: { id: 'p01_single' },
    panels: [{ id: 'main', slot: 'main', kind: 'chart', chart, controls: {}, inChartComplements: [] }],
    slide: { title: 'Overlap check', source: 'Source' }, slideLocale: locale,
  }, d);
  if (!r.spec) return null;
  return composeSlide(r.spec, d);
}

describe('文字の重なり（凡例と注記など）', () => {
  for (const locale of ['ja', 'en'] as const) {
    it.each(IMPLEMENTED_CHARTS)(`${locale}：%s`, (chart) => {
      const s = render(chart, locale);
      if (!s) return;
      expect(overlaps(s)).toEqual([]);
    });
  }
});

// レシピ（複合の構成：Mekko＋全体＋成長率表 など）でも。画面と同じ道（エディターの状態 → 検証 → 配置）で描く
import { applyRecipe } from '@/features/editor/fromRecipe';
import { evaluate } from '@/features/editor/preview';
import { initialState, type BuilderState } from '@/features/editor/state';
import { RECIPE_IDS, primaryChart } from '@/registry';

describe('文字の重なり（レシピ）', () => {
  for (const locale of ['ja', 'en'] as const) {
    it.each([...RECIPE_IDS])(`${locale}：%s`, (id) => {
      const r = registry.recipes[id];
      const chart = primaryChart(r);
      const d = datasetFor(chart, locale === 'en' ? LONG : LONG_JA) as BuilderState['dataset'];
      const base = applyRecipe(initialState(), r);
      const periods = { ...d.periods, base: d.periods.base ?? { label: '', values: d.rows.map(() => d.cols.map(() => null)) } };
      const s: BuilderState = { ...base, dataset: { ...d, periods } as BuilderState['dataset'], slideLocale: locale, recipe: id, title: 'Overlap check',
        mekko: { ...base.mekko, growthRows: ['market', `series:${d.cols[3] ?? d.cols[0]}`] } };
      const e = evaluate(s);
      if (!e.scene) return;
      expect(overlaps(e.scene)).toEqual([]);
    });
  }
});

describe('文字の重なり（凡例がとても長い時は折り返し、注記は下の行へ）', () => {
  const cols = ['Research & market intelligence', 'Presentation & document creation', 'Meetings & summaries', 'Analytics & coding', 'Routine tasks & admin', 'Customer support drafts', 'Other'];
  const wide = (vals: number[][]) => vals.map((r) => [...r, Math.round(r[0]! / 3), Math.round(r[1]! / 4)]);
  for (const locale of ['ja', 'en'] as const) {
    it.each(['mekko', 'stacked_column', 'line', 'stacked_100'] as ChartTypeId[])(`${locale}：%s`, (chart) => {
      const schema = registry.purposes[registry.charts[chart].purpose].schema;
      const time = schema === 'MATRIX_TIME_SERIES';
      const d = {
        schema, unit: 'hours per month across all six departments', dimensions: { rows: 'Department', cols: 'Use case' },
        rows: time ? ['2024', '2025', '2026'] : rows, cols,
        periods: time ? { current: { label: '2026', values: wide([[300, 250, 180, 250, 120], [500, 700, 500, 450, 300], [1260, 1370, 1063, 901, 669]]) } }
          : { current: { label: '2026', values: wide(v26) }, base: { label: '2024', values: wide(v24) } },
      } as Dataset;
      const r = validateViewSpec({ datasetId: 't', layout: { id: 'p01_single' }, panels: [{ id: 'main', slot: 'main', kind: 'chart', chart, controls: {}, inChartComplements: [] }], slide: { title: 'x', source: 's' }, slideLocale: locale }, d);
      expect(r.spec).toBeTruthy();
      expect(overlaps(composeSlide(r.spec!, d))).toEqual([]);
    });
  }
});
