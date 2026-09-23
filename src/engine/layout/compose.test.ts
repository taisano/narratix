import { describe, expect, it } from 'vitest';
import goldenJson from '../__fixtures__/reference-mekko.json';
import { validateViewSpec, type ViewSpec } from '@/registry';
import { composeSlide } from './compose';
import { goldenDataset, type GoldenCase } from '../test-helpers';
import type { BoxItem, SceneItem, TableItem } from '../scene';

type G = GoldenCase;
const golden = goldenJson as unknown as Record<'default' | 'period_mode' | 'highlight_dual' | 'no_table' | 'input_order_no_pt', G>;

/** 見本の状態（S）と同じ見た目になる ViewSpec */
function specFor(g: G): ViewSpec {
  const S = g.state;
  const growthRows = [...(S.growMarket ? ['market'] : []), ...S.shapes.filter((_, k) => S.growShapes[k]).map((s) => `series:${s}`)];
  const hasTable = growthRows.length > 0;
  const spec = {
    datasetId: 'reference',
    layout: hasTable ? { id: 'p02_top_bottom', ratios: [0.75] } : { id: 'p01_single' },
    panels: [
      {
        id: 'main', slot: hasTable ? 'top' : 'main', kind: 'chart', chart: 'mekko',
        controls: { sort_by_size: S.sortBySize, ...(S.highlight >= 0 ? { highlight: S.shapes[S.highlight] } : {}) },
        inChartComplements: S.ptLabels ? [{ id: 'delta_labels' }] : [],
      },
      ...(hasTable
        ? [{
            id: 'growth', slot: 'bottom', kind: 'table', table: 'growth_table',
            transform: [{ type: 'growth', mode: S.mode, rows: growthRows }],
            align: [{ to: 'main', axis: 'columns' }],
          }]
        : []),
    ],
    slide: { title: S.title, source: S.source },
    slideLocale: 'ja',
  };
  const r = validateViewSpec(spec, goldenDataset(S));
  expect(r.issues).toEqual([]);
  return r.spec!;
}

/** 浮動小数の誤差を丸めて比較する */
const round = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 1e9) / 1e9
    : Array.isArray(v) ? v.map(round)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, round(x)]))
    : v;

describe('ゴールデンテスト：見本（mekko-builder.html）と同じ配置になる', () => {
  for (const [name, g] of Object.entries(golden)) {
    it(name, () => {
      const scene = composeSlide(specFor(g), goldenDataset(g.state));
      const items = scene.items.filter((i): i is Exclude<SceneItem, TableItem> => i.kind !== 'table');
      const table = scene.items.find((i): i is TableItem => i.kind === 'table');
      expect(round(items)).toEqual(round(g.layout.items));
      if (g.layout.table) {
        const { kind, ...rest } = table!;
        expect(kind).toBe('table');
        expect(round(rest)).toEqual(round(g.layout.table));
      } else {
        expect(table).toBeUndefined();
      }
    });
  }
});

describe('p05（左の合計棒＋Mekko＋揃えた表）', () => {
  const g = golden.default;
  const dataset = goldenDataset(g.state);
  const spec = validateViewSpec({
    datasetId: 'reference',
    layout: { id: 'p05_left_main_bottom', ratios: [0.17, 0.75] },
    panels: [
      { id: 'total', slot: 'left', kind: 'chart', chart: 'stacked_100',
        transform: [{ type: 'aggregate_rows' }, { type: 'select_periods', periods: ['base', 'current'] }],
        align: [{ to: 'main', axis: 'y_scale' }] },
      { id: 'main', slot: 'main', kind: 'chart', chart: 'mekko', inChartComplements: [{ id: 'delta_labels' }] },
      { id: 'growth', slot: 'bottom', kind: 'table', table: 'growth_table',
        transform: [{ type: 'growth', mode: 'cagr', rows: ['market', 'series:デュアル'] }],
        align: [{ to: 'main', axis: 'columns' }] },
    ],
    slide: { title: g.state.title, source: g.state.source },
    slideLocale: 'ja',
  }, dataset);
  const scene = composeSlide(spec.spec!, dataset);
  const boxes = scene.items.filter((i): i is BoxItem => i.kind === 'box' && !!i.line);
  const table = scene.items.find((i): i is TableItem => i.kind === 'table')!;

  it('すべての図形がスライドの中に収まる', () => {
    for (const it of scene.items) {
      if (it.kind === 'table') continue;
      expect(it.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(it.x + it.w).toBeLessThanOrEqual(13.333 - 0.5 + 1e-9);
      expect(it.y + it.h).toBeLessThanOrEqual(7.5);
    }
    expect(table.y + table.rows.length * table.rowH).toBeLessThanOrEqual(6.9 + 1e-9);
  });

  it('左の合計棒の縦軸（0〜100%）が Mekko と揃う', () => {
    const mekkoCols = new Set(boxes.filter((b) => b.w > 1).map((b) => b.x));
    const left = boxes.filter((b) => !mekkoCols.has(b.x) && b.x < 3);
    const mekko = boxes.filter((b) => mekkoCols.has(b.x));
    const top = (bs: BoxItem[]) => Math.min(...bs.map((b) => b.y));
    const bottom = (bs: BoxItem[]) => Math.max(...bs.map((b) => b.y + b.h));
    expect(left.length).toBeGreaterThan(0);
    expect(top(left)).toBeCloseTo(top(mekko), 9);
    expect(bottom(left)).toBeCloseTo(bottom(mekko), 9);
  });

  it('成長率表の列が Mekko の列と揃う', () => {
    const colStarts = [...new Set(boxes.filter((b) => b.x > 3).map((b) => b.x))].sort((a, b) => a - b);
    let x = table.x + table.colW[0]!;
    const starts = table.colW.slice(1).map((w) => { const s = x; x += w; return s; });
    expect(starts.length).toBe(colStarts.length);
    starts.forEach((s, i) => expect(s).toBeCloseTo(colStarts[i]!, 9));
    expect(table.rows.map((r) => r[0]!.text)).toEqual(['市場全体 CAGR', 'デュアル CAGR']);
  });

  it('左の合計棒と Mekko の間に大きな空きがない', () => {
    const leftRight = Math.max(...boxes.filter((b) => b.x < 3).map((b) => b.x + b.w));
    const mekkoLeft = Math.min(...boxes.filter((b) => b.w > 1).map((b) => b.x));
    expect(mekkoLeft - leftRight).toBeLessThan(1.6);
    expect(table.colW[0]).toBeGreaterThan(1.0); // 表の行ラベルは入る
  });

  it('英語のスライドでは自動の文言が英語になる', () => {
    const en = composeSlide({ ...spec.spec!, slideLocale: 'en' }, dataset);
    const texts = en.items.flatMap((i) => (i.kind === 'table' ? i.rows.map((r) => r[0]!.text) : (i.lines ?? []).map((l) => l.t)));
    expect(texts).toContain('Market CAGR');
    expect(texts.some((t) => t.startsWith('Width: 2025 market size'))).toBe(true);
    expect(texts).toContain('Total');
  });
});

describe('警告', () => {
  it('比較期間のない地域を知らせる', () => {
    const S = structuredClone(golden.no_table.state);
    S.base[0] = S.base[0]!.map(() => null);
    const d = goldenDataset(S);
    const scene = composeSlide(specFor({ ...golden.no_table, state: S }), d);
    expect(scene.warnings).toContainEqual({ code: 'base_missing_rows', params: { rows: S.regions[0] } });
  });
});

describe('空きスロット', () => {
  it('p05 で左と下が空なら、Mekko は p01 と同じ位置になる', () => {
    const g = golden.no_table;
    const d = goldenDataset(g.state);
    const base = specFor(g);
    const p05 = { ...base, layout: { id: 'p05_left_main_bottom' as const }, panels: [{ ...base.panels[0]!, slot: 'main' }] };
    expect(validateViewSpec(p05, d).ok).toBe(true);
    expect(round(composeSlide(p05, d).items)).toEqual(round(composeSlide(base, d).items));
  });
});
