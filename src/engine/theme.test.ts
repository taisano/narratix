import { describe, expect, it } from 'vitest';
import { registry, validateViewSpec, type ChartTypeId, type Dataset, type ViewSpec } from '@/registry';
import { composeSlide, IMPLEMENTED_CHARTS } from './layout/compose';
import { expectPptxMatches } from '@/export/pptx/test-utils';
import type { BoxItem, EllipseItem, LineItem, Scene } from './scene';
import {
  ACCENT_COLORS, FOCUS, PALETTES, QUIET_STEEL_BLUE as Q, accentOf, chartPalette, seriesColor, singleHueLines, singleHueSeries, themeIdOf,
} from './theme';
import { initialState, toViewSpec, type BuilderState } from '@/features/editor/state';
import { canUseColorThemes, BETA_OPEN_PLUS } from '@/lib/ai/plans';

describe('Quiet Steel Blue：項目の数ごとの色', () => {
  it('指示書の表のとおりに選ぶ', () => {
    expect(singleHueSeries(2)).toEqual(['#98B4C9', '#225474']);
    expect(singleHueSeries(3)).toEqual(['#C3D4E1', '#6C94B2', '#123A59']);
    expect(singleHueSeries(4)).toEqual(['#C3D4E1', '#98B4C9', '#427497', '#123A59']);
    expect(singleHueSeries(5)).toEqual(['#E6EEF4', '#98B4C9', '#6C94B2', '#427497', '#123A59']);
    expect(singleHueSeries(6)).toEqual(Q.slice(1));
    expect(singleHueSeries(7)).toEqual([...Q]);
  });
  it('7つを超えても、隣どうしは同じ色にならない', () => {
    for (let n = 8; n <= 24; n++) {
      const c = singleHueSeries(n);
      expect(c).toHaveLength(n);
      for (let k = 1; k < n; k++) expect(c[k]).not.toBe(c[k - 1]);
    }
  });
  it('線は一番薄い段階（#E6EEF4）を使わず、隣どうしも違う色', () => {
    for (let n = 1; n <= 16; n++) {
      const c = singleHueLines(n);
      expect(c).not.toContain(Q[0]);
      for (let k = 1; k < n; k++) expect(c[k]).not.toBe(c[k - 1]);
    }
  });
});

describe('テーマの ID', () => {
  it('古い保存データ・知らない ID は default', () => {
    expect(themeIdOf(undefined)).toBe('default');
    expect(themeIdOf('mono')).toBe('default');
    expect(themeIdOf('brand')).toBe('default');
    expect(themeIdOf('#123A59')).toBe('default');
    expect(themeIdOf('quiet_steel_blue')).toBe('quiet_steel_blue');
  });
  it('default は今までの色のまま（値も順番も）', () => {
    const p = chartPalette('default', 5);
    expect(p.series).toEqual(PALETTES.default!.series);
    expect(p.greys).toEqual(PALETTES.default!.greys);
    for (let i = 0; i < 14; i++) { expect(p.face(i)).toBe(seriesColor(i)); expect(p.line(i)).toBe(seriesColor(i)); }
    expect(p.primary).toBe(FOCUS.primary);
  });
  it('強調の色はプリセットの ID だけ（色の値を直接は受け付けない）', () => {
    expect(accentOf('red')).toBe('#C83C32');
    expect(accentOf('#C83C32')).toBeNull();
    expect(accentOf(undefined)).toBeNull();
    expect(Object.values(ACCENT_COLORS)).toEqual(['#0B2D4D', '#C83C32', '#D9772A', '#187F78', '#70509B', '#C5961A']);
  });
});

const trend: Dataset = {
  schema: 'MATRIX_TIME_SERIES', unit: '億円', dimensions: { rows: '年', cols: '地域' },
  rows: ['2021', '2022', '2023', '2024', '2025'],
  cols: ['北米', '欧州', '中国'],
  periods: { current: { label: '2025', values: [[100, 80, 60], [110, 82, 75], [125, 85, 90], [130, 88, 110], [150, 90, 130]] } },
};
const compare: Dataset = {
  schema: 'MEKKO', unit: '億円', rows: ['A社', 'B社', 'C社'], cols: ['北米', '欧州', '中国'],
  periods: { current: { label: '2025', values: [[100, 80, 60], [110, 82, 75], [125, 85, 90]] }, base: { label: '2024', values: [[90, 70, 50], [100, 80, 70], [120, 80, 80]] } },
};
function scene(chart: ChartTypeId, d: Dataset, controls: Record<string, unknown>, palette?: string): Scene {
  const spec: ViewSpec = {
    datasetId: 't', layout: { id: 'p01_single' }, slide: { title: 'x', source: 's' }, slideLocale: 'ja', ...(palette ? { palette } : {}),
    panels: [{ id: 'main', slot: 'main', kind: 'chart', chart, controls: Object.fromEntries(Object.entries(controls).filter(([id]) => registry.controls[id as 'title'].appliesTo.includes(chart))), inChartComplements: [] }],
  };
  const r = validateViewSpec(spec, d);
  expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return composeSlide(r.spec!, d);
}
const fills = (s: Scene) => s.items.filter((i): i is BoxItem => i.kind === 'box').map((b) => b.fill).filter(Boolean) as string[];
const dataOf = (chart: ChartTypeId): Dataset => {
  const schema = registry.purposes[registry.charts[chart].purpose].schema;
  return schema === 'MATRIX_TIME_SERIES' ? trend : ({ ...compare, schema } as Dataset);
};

describe('Quiet Steel Blue をチャートに使う', () => {
  it('積み上げ縦棒（3系列）は3項目の色だけで塗る', () => {
    const s = scene('stacked_column', trend, {}, 'quiet_steel_blue');
    const used = new Set(fills(s).filter((c) => (Q as readonly string[]).includes(c)));
    expect([...used].sort()).toEqual([...singleHueSeries(3)].sort());
  });
  it('折れ線は一番薄い段階を使わない', () => {
    const s = scene('line', trend, {}, 'quiet_steel_blue');
    const strokes = s.items.filter((i): i is LineItem => i.kind === 'line').map((l) => l.color);
    expect(strokes).not.toContain(Q[0]);
    expect(strokes).toEqual(expect.arrayContaining(singleHueLines(3)));
  });
  it('どのチャートも描け、PPT でも同じ色になる', async () => {
    for (const chart of IMPLEMENTED_CHARTS) {
      if (['scatter', 'bubble', 'waterfall', 'driver_bar', 'posneg_bar', 'variable_width'].includes(chart)) continue;
      const s = scene(chart, dataOf(chart), { highlight: '欧州', highlights: ['欧州'], highlight_color: 'teal' }, 'quiet_steel_blue');
      await expectPptxMatches(s);
    }
  });
});

describe('強調の色（1つだけ強調した時）', () => {
  it('強調した項目だけ強調色、ほかは薄いグレー（テーマの色は使わない）', async () => {
    for (const theme of [undefined, 'quiet_steel_blue']) {
      const s = scene('stacked_column', trend, { highlight: '欧州', highlight_color: 'red' }, theme);
      const f = fills(s);
      expect(f).toContain('#C83C32');
      const pal = chartPalette(themeIdOf(theme), 3);
      for (const c of pal.series.slice(0, 3)) expect(f).not.toContain(c);
      await expectPptxMatches(s);
    }
  });
  it('色を選んでいなければ（古い「なし」も）紺', () => {
    for (const hc of [undefined, 'none']) {
      const f = fills(scene('stacked_column', trend, { highlight: '欧州', ...(hc ? { highlight_color: hc } : {}) }));
      expect(f).toContain(ACCENT_COLORS.navy);
    }
  });
  it('凡例も同じ強調色、ほかの線は薄い', () => {
    const s = scene('line', trend, { highlight: '欧州', highlight_color: 'gold' }, 'quiet_steel_blue');
    const lines = s.items.filter((i): i is LineItem => i.kind === 'line');
    expect(lines.filter((l) => l.color === '#C5961A').length).toBeGreaterThan(1);
    expect(lines.map((l) => l.color)).not.toContain(singleHueLines(3)[0]);
  });
  it('強調する項目が無ければ強調色は効かない', () => {
    const s = scene('stacked_column', trend, { highlight_color: 'red' }, 'quiet_steel_blue');
    expect(fills(s)).not.toContain('#C83C32');
  });
  it('散布図は強調した点だけ強調色、ほかは薄いグレー', () => {
    const d: Dataset = { schema: 'BUBBLE', rows: ['a', 'b', 'c'], cols: ['x', 'y'], periods: { current: { label: '', values: [[1, 2], [2, 3], [3, 1]] } } };
    const s = scene('scatter', d, { highlight: 'b', highlight_color: 'purple' }, 'quiet_steel_blue');
    const dots = s.items.filter((i): i is EllipseItem => i.kind === 'ellipse').map((e) => e.fill);
    expect(dots.filter((c) => c === '#70509B')).toHaveLength(1);
    expect(dots.filter((c) => c === Q[5])).toHaveLength(0);
  });
  it('スロープ（いくつでも強調できる）は強調色を使わない。強調した線はそれぞれの色、ほかは薄く', () => {
    const s = scene('slope', trend, { highlights: ['中国', '北米'], highlight_color: 'orange' }, 'quiet_steel_blue');
    const lines = s.items.filter((i): i is LineItem => i.kind === 'line').map((l) => l.color);
    expect(lines).not.toContain('#D9772A');
    expect(lines).toContain(FOCUS.otherLine);
  });
});

describe('保存と読み込み', () => {
  const st = (controls: Record<string, unknown>): BuilderState => ({ ...initialState(), controls });
  it('テーマの指定が無い古いデータは default（ViewSpec に書かない）', () => {
    expect(toViewSpec(st({})).palette).toBeUndefined();
    expect(toViewSpec(st({ palette: 'mono' })).palette).toBeUndefined();
  });
  it('保存するのは ID だけ', () => {
    const v = toViewSpec(st({ palette: 'quiet_steel_blue', highlight_color: 'red' }));
    expect(v.palette).toBe('quiet_steel_blue');
    expect(JSON.stringify(v)).not.toMatch(/#C83C32|#225474/i);
  });
});

describe('プラン', () => {
  it('ベータ中は基本（free）でも使える。Plus（pro）と Pro（team）はいつでも', () => {
    expect(canUseColorThemes('pro')).toBe(true);
    expect(canUseColorThemes('team')).toBe(true);
    expect(canUseColorThemes('free')).toBe(BETA_OPEN_PLUS);
  });
});
