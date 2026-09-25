import { describe, expect, it } from 'vitest';
import { registry, validateViewSpec, type ChartTypeId, type Dataset, type ViewSpec } from '@/registry';
import { composeSlide, IMPLEMENTED_CHARTS } from '../compose';
import { itemBox, itemTexts, type BoxItem, type LineItem, type Scene } from '../../scene';
import { valueScale } from '../../scale';
import { formatMetric, formatSigned } from '../../format';
import { cagr, timeRange } from '../../transform/cagr';
import { expectPptxMatches } from '@/export/pptx/test-utils';
import { FOCUS } from '../../theme';

/** 年×地域の売上（推移・比較の見本） */
const trend: Dataset = {
  schema: 'MATRIX_TIME_SERIES',
  unit: '億円',
  dimensions: { rows: '年', cols: '地域' },
  rows: ['2021', '2022', '2023', '2024', '2025'],
  cols: ['北米', '欧州', '中国', '日本'],
  periods: { current: { label: '2025', values: [[100, 80, 60, 40], [110, 82, 75, 38], [125, 85, 90, 41], [130, null, 110, 39], [150, 90, 130, 42]] } },
};

function spec(chart: ChartTypeId, controls: Record<string, unknown> = {}, complements: string[] = []): ViewSpec {
  const r = validateViewSpec({
    datasetId: 't', layout: { id: 'p01_single' },
    panels: [{ id: 'main', slot: 'main', kind: 'chart', chart, controls: Object.fromEntries(Object.entries(controls).filter(([id]) => registry.controls[id as 'title'].appliesTo.includes(chart))), inChartComplements: complements.map((id) => ({ id })) }],
    slide: { title: 'テスト', source: '出典' }, slideLocale: 'ja',
  }, trend);
  expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return r.spec!;
}

const render = (chart: ChartTypeId, controls: Record<string, unknown> = {}, complements: string[] = []) =>
  composeSlide(spec(chart, controls, complements), trend);

const boxes = (s: Scene) => s.items.filter((i): i is BoxItem => i.kind === 'box' && (i.w > 0.2 || i.h > 0.2));
const texts = (s: Scene) => s.items.flatMap(itemTexts);
const BRIDGE_CHARTS: ChartTypeId[] = ['waterfall', 'driver_bar', 'posneg_bar'];
const RELATION_CHARTS: ChartTypeId[] = ['scatter', 'bubble'];
const NEW_CHARTS: ChartTypeId[] = ['line', 'column_trend', 'bar_trend', 'stacked_column', 'stacked_100', 'bar_rank', 'column_compare', 'clustered_column', 'bar_100', 'variance_bar', 'slope'];

describe('実装済みのチャート', () => {
  it('Mekko と、推移・比較・構成の11種、要因の3種、関係の2種', () => {
    expect([...IMPLEMENTED_CHARTS].sort()).toEqual(['mekko', ...NEW_CHARTS, ...BRIDGE_CHARTS, ...RELATION_CHARTS].sort());
  });

  for (const chart of NEW_CHARTS) {
    for (const axis of ['normal', 'swapped'] as const) {
      it(`${chart}（${axis}）：スライドに収まり、数値の壊れがなく、PPT と一致する`, async () => {
        const s = render(chart, { axis_swap: axis, data_labels: 'all', gridlines: 'light' });
        for (const it of s.items) {
          if (it.kind === 'table') continue;
          const b = itemBox(it);
          for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(v)).toBe(true);
          expect(b.x).toBeGreaterThanOrEqual(0.5 - 0.6); // 値ラベルは少しはみ出してよい
          expect(b.x + b.w).toBeLessThanOrEqual(13.333);
          expect(b.y + b.h).toBeLessThanOrEqual(7.5);
        }
        expect(texts(s).some((t) => t.includes('NaN'))).toBe(false);
        await expectPptxMatches(s);
      });
    }
  }
});

describe('行と列の入れ替え（データは変えずに見え方だけ）', () => {
  it('折れ線：通常は年が横軸・地域が線、入れ替えると地域が横軸・年が線', () => {
    const normal = texts(render('line'));
    expect(normal).toEqual(expect.arrayContaining(['2021', '2025', '北米', '日本']));
    const swapped = render('line', { axis_swap: 'swapped' });
    const legend = swapped.items.filter((i): i is LineItem => i.kind === 'line' && i.width === 2.25);
    expect(legend).toHaveLength(5); // 年が5本の線になる
  });

  it('入れ替えると、比較の対象は地域（行）になり、年（列）を並べる', () => {
    const s = render('bar_rank', { axis_swap: 'swapped', compare_target: '北米' });
    expect(texts(s)).toContain('北米時点');
    expect(texts(s)).toEqual(expect.arrayContaining(['2025', '2021']));
  });
});

describe('Comparison（NarratiX の buildComparisonData_ と同じ）', () => {
  it('比較の対象の既定は最後の行（2025）、降順で並べる', () => {
    const s = render('bar_rank', {}, []);
    expect(texts(s)).toContain('2025時点');
    const bars = boxes(s).sort((a, b) => a.y - b.y);
    expect(bars.map((b) => b.w)).toEqual([...bars.map((b) => b.w)].sort((a, b) => b - a));
  });

  it('空欄の列は除く（2024 の欧州）', () => {
    const s = render('column_compare', { compare_target: '2024' });
    expect(boxes(s)).toHaveLength(3);
    expect(texts(s)).not.toContain('欧州');
  });

  it('入力順・昇順', () => {
    const cats = (sort: string) => render('column_compare', { rank_sort: sort }).items
      .filter((i) => i.kind === 'text' && i.lines[0]?.bold && ['北米', '欧州', '中国', '日本'].includes(i.lines[0].t))
      .sort((a, b) => itemBox(a as never).x - itemBox(b as never).x).map((i) => itemTexts(i)[0]);
    expect(cats('input')).toEqual(['北米', '欧州', '中国', '日本']);
    expect(cats('asc')).toEqual(['日本', '欧州', '中国', '北米']);
  });

  it('強調：対象だけ濃紺、ほかはグレー', () => {
    const s = render('bar_rank', { highlight: '中国' });
    const fills = boxes(s).map((b) => b.fill);
    expect(fills.filter((f) => f === FOCUS.primary)).toHaveLength(1);
    expect(fills.filter((f) => f === FOCUS.otherBar)).toHaveLength(3);
  });
});

describe('Trend', () => {
  it('折れ線：空欄で線を途切れさせる（欧州は 2023→2024、2024→2025 の線がない）', () => {
    const s = render('line', { highlight: '欧州' });
    const hl = s.items.filter((i): i is LineItem => i.kind === 'line' && i.width === 3);
    expect(hl).toHaveLength(2); // 2021→2022、2022→2023 のみ
    // 強調した線は最後（最前面）に描く
    const lastLine = [...s.items].reverse().find((i) => i.kind === 'line' && i.width >= 1.75) as LineItem;
    expect(lastLine.color).toBe(FOCUS.primary);
  });

  it('CAGR 注記：横軸が年なら最初→最後の年で系列ごとに出す', () => {
    const s = render('line', {}, ['cagr_note']);
    expect(texts(s)).toContain('CAGR（2021→2025）');
    expect(texts(s)).toContain('北米 ' + ((Math.pow(150 / 100, 1 / 4) - 1) * 100).toFixed(1) + '%');
    expect(texts(s)).toContain('欧州 ' + ((Math.pow(90 / 80, 1 / 4) - 1) * 100).toFixed(1) + '%');
  });

  it('縦棒：マイナスの値は 0 の線より下に伸びる', () => {
    const neg: Dataset = { ...trend, rows: ['A', 'B'], cols: ['x'], periods: { current: { label: 'c', values: [[10], [-5]] } } };
    const r = validateViewSpec({ datasetId: 't', layout: { id: 'p01_single' }, panels: [{ id: 'm', slot: 'main', kind: 'chart', chart: 'column_trend' }], slide: { title: '' }, slideLocale: 'ja' }, neg);
    const s = composeSlide(r.spec!, neg);
    const [pos, down] = boxes(s).sort((a, b) => a.x - b.x);
    expect(pos!.y + pos!.h).toBeCloseTo(down!.y, 9); // 0 の線で接する
    expect(down!.h).toBeCloseTo(pos!.h / 2, 6);
  });

  it('100% 積み上げ：各棒の高さが同じ（100%）', () => {
    const s = render('stacked_100', { axis_swap: 'swapped' });
    const byX = new Map<number, number>();
    for (const b of boxes(s)) byX.set(Math.round(b.x * 1000), (byX.get(Math.round(b.x * 1000)) ?? 0) + b.h);
    const hs = [...byX.values()];
    hs.forEach((h) => expect(h).toBeCloseTo(hs[0]!, 6));
  });

  it('積み上げ：合計ラベルと合計の CAGR', () => {
    const s = render('stacked_column', {}, ['total_labels', 'cagr_note']);
    expect(texts(s)).toContain('412'); // 2025 の合計 150+90+130+42
    expect(texts(s)).toContain('280'); // 2021 の合計
    const g = ((Math.pow(412 / 280, 1 / 4) - 1) * 100).toFixed(1) + '%';
    expect(texts(s).some((t) => t.includes('CAGR（2021→2025） 全体 ' + g))).toBe(true);
    // 系列ごとの CAGR も（北米 100→150）
    expect(texts(s)).toContain(((Math.pow(150 / 100, 1 / 4) - 1) * 100).toFixed(1) + '%');
  });
});

describe('共通部品', () => {
  it('値の軸：最小が正なら 0 から、上に余白、きりの良い目盛', () => {
    const sc = valueScale([12, 150]);
    expect(sc.min).toBe(0);
    expect(sc.max).toBeGreaterThanOrEqual(150 * 1.08);
    expect(sc.ticks).toEqual([0, 25, 50, 75, 100, 125, 150, 175]); // 162 に最も近い端
    expect(valueScale([0, 1408]).max).toBe(1750); // 1,408 × 1.08 → 2,000 ではなく 1,750
    expect(valueScale([0, 430]).max).toBe(500);
    const neg = valueScale([-30, 80]);
    expect(neg.min).toBeLessThan(-30);
    expect(neg.ticks).toContain(0);
  });

  it('数値の表記（NarratiX の formatDriverMetricValue_ と同じ）', () => {
    expect(formatMetric(1234.56)).toBe('1,234.6');
    expect(formatMetric(1200, 'auto')).toBe('1.2K');
    expect(formatMetric(999, 'auto')).toBe('999');
    expect(formatMetric(2_500_000, 'auto')).toBe('2.5M');
    expect(formatMetric(12.34, '%')).toBe('12.3%');
    expect(formatSigned(-3.5)).toBe('-3.5');
    expect(formatSigned(0)).toBe('0');
  });

  it('年の判定と CAGR（NarratiX の buildCalc と同じ）', () => {
    expect(timeRange(['2019', '2025', 'x'])).toMatchObject({ from: 2019, to: 2025 });
    expect(timeRange(['A', 'B'])).toBeNull();
    expect(cagr(0, 10, 3)).toBeNull();
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 10);
  });
});

/** 要因：営業利益の増減（1行目＝始点、最後の行＝終点） */
const bridge: Dataset = {
  schema: 'DRIVER_BRIDGE', unit: '億円', rows: ['2024年度', '数量', '価格', '原材料', '人件費', '2025年度'], cols: ['金額'],
  periods: { current: { label: '2025', values: [[120], [35], [18], [-22], [-9], [150]] } },
};
/** 関係：製品ごとの X・Y・大きさ */
const relation: Dataset = {
  schema: 'BUBBLE', rows: ['A', 'B', 'C', 'D', 'E'], cols: ['成長率', '利益率', '売上'],
  periods: { current: { label: '2025', values: [[12, 18, 240], [8, 11, 420], [3, 7, 610], [15, 21, 90], [5, 9, 180]] } },
};
const renderWith = (d: Dataset, chart: ChartTypeId, controls: Record<string, unknown> = {}, complements: string[] = []) => {
  const r = validateViewSpec({
    datasetId: 't', layout: { id: 'p01_single' },
    panels: [{ id: 'main', slot: 'main', kind: 'chart', chart, controls, inChartComplements: complements.map((id) => ({ id })) }],
    slide: { title: 'テスト', source: '出典' }, slideLocale: 'ja',
  }, d);
  expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return composeSlide(r.spec!, d);
};

describe('要因と関係のチャート', () => {
  for (const [chart, d, comps] of [...BRIDGE_CHARTS.map((c) => [c, bridge, []] as const), ...RELATION_CHARTS.map((c) => [c, relation, ['quadrants']] as const)]) {
    it(`${chart}：スライドに収まり、数値の壊れがなく、PPT と一致する`, async () => {
      const s = renderWith(d, chart, { gridlines: 'light' }, [...comps]);
      for (const it of s.items) {
        if (it.kind === 'table') continue;
        const b = itemBox(it);
        for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(v)).toBe(true);
        expect(b.x + b.w).toBeLessThanOrEqual(13.333);
        expect(b.y + b.h).toBeLessThanOrEqual(7.5);
      }
      expect(texts(s).some((t) => t.includes('NaN'))).toBe(false);
      await expectPptxMatches(s);
    });
  }

  it('ウォーターフォール：始点・要因（符号付き）・終点。合わない差は「その他 / 調整」', () => {
    const t = texts(renderWith(bridge, 'waterfall'));
    // 120+35+18-22-9 = 142。終点 150 との差 +8 を調整に
    expect(t).toEqual(expect.arrayContaining(['120', '+35', '+18', '-22', '-9', '+8', '150', 'その他 / 調整']));
    expect(t.some((x) => x.includes('120 → 150：+30'))).toBe(true);
    // 終点を自動補正なら、終点は 142 で調整は無い
    const f = texts(renderWith(bridge, 'waterfall', { mismatch: 'autofix_end' }));
    expect(f).toContain('142');
    expect(f).not.toContain('その他 / 調整');
  });

  it('要因バー：影響の大きい順（プラスが先）、プラス・マイナスは左右の枠に分ける', () => {
    const t = texts(renderWith(bridge, 'driver_bar'));
    const names = t.filter((x) => ['数量', '価格', '原材料', '人件費', 'その他 / 調整'].includes(x));
    expect(names).toEqual(['数量', '価格', 'その他 / 調整', '原材料', '人件費']);
    const p = texts(renderWith(bridge, 'posneg_bar'));
    expect(p).toEqual(expect.arrayContaining(['増加要因', '減少要因']));
  });

  it('散布図：相関係数の注記と中央値の線', () => {
    const t = texts(renderWith(relation, 'scatter', {}, ['quadrants']));
    expect(t.some((x) => /相関係数 r = 0\.\d\d（強い正の関係）/.test(x))).toBe(true);
    expect(t.some((x) => x.startsWith('中央値'))).toBe(true);
    expect(texts(renderWith(relation, 'bubble')).some((x) => x.includes('バブルの大きさ＝売上'))).toBe(true);
  });
});

describe('散布図・バブル：グループの色分けと軸の名前', () => {
  it('グループの凡例が出て、軸の名前は設定があればそれを使う', () => {
    const d = { ...relation, groups: ['消費財', '産業財', '産業財', '消費財', null] };
    const s = renderWith(d, 'bubble', { x_title: '市場成長率（%）', y_title: '営業利益率（%）' });
    const t = texts(s);
    expect(t).toEqual(expect.arrayContaining(['消費財', '産業財', '市場成長率（%）', '営業利益率（%）']));
    const fills = new Set(s.items.filter((i) => i.kind === 'ellipse').map((i) => (i as { fill: string }).fill));
    expect(fills.size).toBe(3); // 2つのグループ＋グループ無し
  });
});
