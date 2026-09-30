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
const RELATION_CHARTS: ChartTypeId[] = ['scatter', 'bubble', 'variable_width'];
const PAIR_CHARTS: ChartTypeId[] = ['share_pair', 'slope_pair', 'rank_slope'];
const NEW_CHARTS: ChartTypeId[] = ['line', 'column_trend', 'bar_trend', 'stacked_column', 'stacked_100', 'bar_rank', 'column_compare', 'clustered_column', 'bar_100', 'variance_bar', 'slope', 'combo'];

describe('実装済みのチャート', () => {
  it('Mekko と、推移・比較・構成の12種、要因の3種、関係の3種', () => {
    expect([...IMPLEMENTED_CHARTS].sort()).toEqual(['mekko', ...NEW_CHARTS, ...BRIDGE_CHARTS, ...RELATION_CHARTS, ...PAIR_CHARTS].sort());
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
  for (const [chart, d, comps] of [...BRIDGE_CHARTS.map((c) => [c, bridge, []] as const), ...RELATION_CHARTS.map((c) => [c, relation, c === 'variable_width' ? ['reference_line'] : ['quadrants']] as const)]) {
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
    const t = texts(renderWith(relation, 'scatter', { show_corr: true }, ['quadrants']));
    expect(texts(renderWith(relation, 'scatter')).some((x) => x.includes('相関係数'))).toBe(false);
    expect(t.some((x) => /相関係数 r = 0\.\d\d（強い正の関係）/.test(x))).toBe(true);
    expect(t.some((x) => x.startsWith('中央値'))).toBe(true);
    expect(texts(renderWith(relation, 'bubble')).some((x) => x.includes('バブルの大きさ＝売上'))).toBe(true);
  });
});

describe('スロープ（1指標・2指標）', () => {
  /** 年×国：2019〜2024（途中の年も入れる） */
  const visits: Dataset = {
    schema: 'MATRIX_TIME_SERIES', unit: '万人', rows: ['2019', '2020', '2022', '2024'], cols: ['韓国', '中国', '台湾', '米国'],
    periods: { current: { label: '', values: [[558.5, 959.4, 489.1, 172.4], [48.8, 107.0, 69.4, 21.9], [101.2, 18.9, 33.1, 32.4], [881.8, 698.1, 604.4, 272.5]] } },
  };
  it('初期値は最初と最後の年。年を選べ、増減率・増減・CAGR・なしを切り替えられる', () => {
    const t = texts(renderWith(visits, 'slope', { decimals: '0' }));
    expect(t).toEqual(expect.arrayContaining(['2019', '2024', '韓国', '559', '882', '+58%', '中国', '959', '698', '−27%']));
    const t2 = texts(renderWith(visits, 'slope', { slope_from: '2022', slope_change: 'diff', decimals: '1' }));
    expect(t2).toEqual(expect.arrayContaining(['2022', '101.2', '881.8', '+780.6']));
    const t3 = texts(renderWith(visits, 'slope', { slope_change: 'cagr' }));
    // 韓国 558.5 → 881.8 の5年：(881.8/558.5)^(1/5)−1 = 9.6%
    expect(t3).toEqual(expect.arrayContaining(['CAGR 2019–24', '+9.6%']));
    expect(texts(renderWith(visits, 'slope', { slope_change: 'none' })).some((x) => /^[+−]\d/.test(x))).toBe(false);
  });
  it('複数を強調でき、強調しない線は薄いグレー', () => {
    const s = renderWith(visits, 'slope', { highlights: ['韓国', '中国'] });
    const colors = new Set(s.items.filter((i) => i.kind === 'line' && (i as { width: number }).width === 3).map((i) => (i as { color: string }).color));
    expect(colors.size).toBe(2);
  });
  it('2指標スロープ：左右に指標の名前、年・項目・色は共通、空の値は「データなし」。PPT と一致する', async () => {
    const pair: Dataset = {
      ...visits, unit: '',
      periods: {
        current: { label: '訪日客数（万人）', values: visits.periods.current.values },
        base: { label: '旅行消費額（億円）', values: [[4247, 17704, 5517, 6231], [null, null, null, null], [null, null, null, null], [9632, 17335, 10936, 9021]] },
      },
    };
    const s = renderWith(pair, 'slope_pair', { highlights: ['韓国'] }, ['total_change']);
    const t = texts(s);
    expect(t).toEqual(expect.arrayContaining(['訪日客数（万人）', '旅行消費額（億円）', '+58%', '+127%']));
    expect(t.filter((x) => x === '韓国')).toHaveLength(2);
    expect(t.some((x) => x.startsWith('掲載4項目計'))).toBe(true);
    // 韓国は左右とも同じ色（強調の1色目）
    const thick = s.items.filter((i) => i.kind === 'line' && (i as { width: number }).width === 3).map((i) => (i as { color: string }).color);
    expect(thick).toHaveLength(2);
    expect(new Set(thick).size).toBe(1);
    await expectPptxMatches(s);
    const b = pair.periods.base!;
    const miss: Dataset = { ...pair, periods: { ...pair.periods, base: { label: b.label, values: b.values.map((r, i) => (i === 3 ? [9632, null, 10936, 9021] : r)) } } };
    expect(texts(renderWith(miss, 'slope_pair')).some((x) => x === 'データなし：中国')).toBe(true);
  });
  it('2指標スロープ：右の指標が空なら、入れ方を案内する', () => {
    expect(texts(renderWith(visits, 'slope_pair')).some((x) => x.startsWith('右の指標のデータがありません'))).toBe(true);
  });

  describe('指標間の順位スロープ（B4′）', () => {
    // 2024：訪日客数 韓国 > 中国 > 台湾 > 米国、旅行消費額 中国 > 台湾 > 韓国 > 米国
    const pair: Dataset = {
      ...visits, unit: '',
      periods: {
        current: { label: '訪日客数（万人）', values: visits.periods.current.values },
        base: { label: '旅行消費額（億円）', values: [[4247, 17704, 5517, 6231], [null, null, null, null], [null, null, null, null], [9632, 17335, 10936, 9021]] },
      },
    };
    const yAt = (s: Scene, t: string) => s.items.filter((i) => i.kind === 'text' && itemTexts(i).includes(t)).map((i) => (i as { y: number }).y);
    it('既定は順位：最新の時点で、左右の指標の順位を結ぶ。見出しに指標と時点、値も小さく出す。PPT と一致する', async () => {
      const s = renderWith(pair, 'rank_slope');
      const t = texts(s);
      expect(t).toEqual(expect.arrayContaining(['訪日客数（万人）　2024', '旅行消費額（億円）　2024', '1位', '4位', '881.8', '17,335']));
      expect(t.some((x) => x.startsWith('順位：'))).toBe(true);
      // 線は4本（項目ごと）。韓国は左で1位（上）、右で3位
      const lines = s.items.filter((i): i is LineItem => i.kind === 'line' && (i.width === 2 || i.width === 3));
      expect(lines).toHaveLength(4);
      const korea = lines.find((l) => l.y1 === Math.min(...lines.map((x) => x.y1)))!;
      expect(korea.y2).toBeGreaterThan(korea.y1);
      await expectPptxMatches(s);
    });
    it('比較の対象の時点を選べる（2019：旅行消費額は中国 > 米国 > 台湾 > 韓国）', () => {
      const t = texts(renderWith(pair, 'rank_slope', { compare_target: '2019' }));
      expect(t).toEqual(expect.arrayContaining(['訪日客数（万人）　2019', '17,704']));
    });
    it('指数：それぞれの指標の項目平均＝100 に換算し、100 の線を引く', () => {
      const s = renderWith(pair, 'rank_slope', { rank_slope_scale: 'index' });
      const t = texts(s);
      // 訪日客数 2024 の平均 614.2 → 韓国 881.8/614.2×100 = 144
      expect(t).toEqual(expect.arrayContaining(['144']));
      expect(t.some((x) => x.startsWith('指数：'))).toBe(true);
      expect(s.items.some((i) => i.kind === 'line' && (i as LineItem).dash === 'dash')).toBe(true);
    });
    it('強調は1項目：その項目だけ強調色、ほかは薄いグレー', () => {
      const s = renderWith(pair, 'rank_slope', { highlight: '韓国' });
      const lines = s.items.filter((i): i is LineItem => i.kind === 'line' && (i.width === 2 || i.width === 3));
      expect(lines.filter((l) => l.width === 3)).toHaveLength(1);
      expect(lines.filter((l) => l.width === 2).every((l) => l.color === FOCUS.otherLine)).toBe(true);
    });
    it('片方の指標が空の項目は線を引かず「データなし」。右の指標が無ければ入れ方を案内する', () => {
      const b = pair.periods.base!;
      const miss: Dataset = { ...pair, periods: { ...pair.periods, base: { label: b.label, values: b.values.map((r, i) => (i === 3 ? [9632, null, 10936, 9021] : r)) } } };
      const t = texts(renderWith(miss, 'rank_slope'));
      expect(t).toContain('データなし：中国');
      expect(yAt(renderWith(miss, 'rank_slope'), '中国')).toHaveLength(0);
      expect(texts(renderWith(visits, 'rank_slope')).some((x) => x.startsWith('右の指標のデータがありません'))).toBe(true);
    });
  });
});

describe('幅が変わる縦棒', () => {
  /** 国ごとの人口と1人当たりの消費量 */
  const water: Dataset = {
    schema: 'BUBBLE', rows: ['中国', 'インド', '日本', '米国', 'ブラジル', 'その他のとても長い名前の地域'], cols: ['人口（百万人）', '1人当たり（㎥）'],
    periods: { current: { label: '2000', values: [[1270, 23], [1050, 11], [127, 121], [282, 200], [174, 93], [30, 60]] } },
  };
  const boxes = (sc: ReturnType<typeof renderWith>) => sc.items.filter((i) => i.kind === 'box') as { x: number; w: number; h: number }[];
  it('幅は規模に、高さは水準に比例し、高さの順に並ぶ。PPT と一致する', async () => {
    const s = renderWith(water, 'variable_width', { gridlines: 'light' }, ['reference_line']);
    const b = boxes(s);
    expect(b).toHaveLength(6);
    // 高さの順：米国（200）が左端、幅の比は人口の比
    const us = b[0]!, cn = b.find((x) => Math.abs(x.w / us.w - 1270 / 282) < 0.01);
    expect(cn).toBeDefined();
    expect(us.h / cn!.h).toBeCloseTo(200 / 23, 1);
    const t = texts(s);
    expect(t.some((x) => x.startsWith('加重平均'))).toBe(true);
    expect(t.some((x) => x.includes('人口（百万人）の累計構成比'))).toBe(true);
    // 細い棒は番号になり、下に番号と名前の一覧
    expect(t.some((x) => /^\d+\. その他のとても長い名前の地域$/.test(x))).toBe(true);
    await expectPptxMatches(s);
  });
  it('基準線の値と名前を入れられる。幅と高さの列も選べる', () => {
    const t = texts(renderWith(water, 'variable_width', { ref_value: '50', ref_label: '最低限必要な量' }, ['reference_line']));
    expect(t).toContain('最低限必要な量 50');
    const sw = renderWith(water, 'variable_width', { vw_width: '1人当たり（㎥）', vw_height: '人口（百万人）', vw_sort: 'data' });
    expect(texts(sw).some((x) => x.includes('1人当たり（㎥）の累計構成比'))).toBe(true);
  });
  it('列が1つしかない時は、入れてほしいデータを案内する', () => {
    const one = { ...water, cols: ['人口'], periods: { current: { label: '2000', values: water.periods.current.values.map((r) => [r[0]!]) } } };
    expect(texts(renderWith(one, 'variable_width')).some((x) => x.includes('幅（規模）と高さ（水準）'))).toBe(true);
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

  it('X と Y を入れ替えると、2列目が横軸になり、軸の名前も入れ替わる', () => {
    const t = texts(renderWith(relation, 'scatter', { xy_swap: 'swapped' }));
    const s = renderWith(relation, 'scatter', { xy_swap: 'swapped' });
    // 横軸の名前（下の中央）は「利益率」
    const xTitle = s.items.find((i) => i.kind === 'text' && i.lines.some((l) => l.t === '利益率') && i.align === 'center');
    expect(xTitle).toBeTruthy();
    expect(t).toContain('成長率');
  });
});

describe('2期間の100%積み上げ（カテゴリ別）', () => {
  /** カテゴリ×ブランド、前期25→今期26 */
  const pair: Dataset = {
    schema: 'MEKKO', unit: '€M',
    dimensions: { rows: 'カテゴリ', cols: 'ブランド' },
    rows: ['Air Fryer', 'Full-Auto'],
    cols: ['Versuni', 'A社', 'B社'],
    periods: {
      base: { label: '25', values: [[40, 30, 30], [20, 50, 30]] },
      current: { label: '26', values: [[60, 30, 30], [18, 55, 37]] },
    },
  };
  const pairScene = (controls: Record<string, unknown> = {}) => renderWith(pair, 'share_pair', controls);

  it('合計・市場の伸び率・注目ブランドの増減・凡例が出て、PPT と一致する', async () => {
    const s = pairScene({ highlight: 'Versuni' });
    const t = texts(s);
    // 合計 100→120（+20%）、110→110（+0%）。Versuni の増減 +20 / -2
    expect(t).toEqual(expect.arrayContaining(['Air Fryer', 'Full-Auto', '100', '120', '110', '+20', '-2', 'Versuni', 'A社', 'B社', '25', '26']));
    expect(t.some((x) => x.startsWith('+20') && x.includes('%'))).toBe(true);
    expect(t.some((x) => x.includes('NaN'))).toBe(false);
    for (const it of s.items) {
      if (it.kind === 'table') continue;
      const b = itemBox(it);
      expect(b.x + b.w).toBeLessThanOrEqual(13.333);
      expect(b.y + b.h).toBeLessThanOrEqual(7.5);
    }
    await expectPptxMatches(s);
  });

  it('補完パーツ「全体（合計）のペア」：すべてのカテゴリを足した全体を最後に並べ、PPT と一致する', async () => {
    const s = renderWith(pair, 'share_pair', { highlight: 'Versuni' }, ['total_category']);
    const t = texts(s);
    // 比較 100+100=200 → 現在 120+110=230（+15%）、Versuni 40+20=60 → 60+18=78（+18）
    expect(t).toEqual(expect.arrayContaining(['全体', '200', '230', '+15%', '+18']));
    await expectPptxMatches(s);
    expect(texts(renderWith(pair, 'share_pair', { pair_total_label: 'Global' }, ['total_category']))).toContain('Global');
    // 足せない単位では足さない
    expect(texts(renderWith({ ...pair, unit: '%' }, 'share_pair', {}, ['total_category']))).not.toContain('全体');
  });

  it('棒の高さ「実数」：合計の大きい棒ほど高く、ラベルは %・実数・なしを選べる。PPT と一致する', async () => {
    const heightOf = (sc: ReturnType<typeof pairScene>) => {
      // 積み上げの箱を棒ごと（x）に足した高さ
      const by = new Map<number, number>();
      for (const it of sc.items) if (it.kind === 'box' && it.w > 0.25 && it.w < 1 && it.x > 1) by.set(Math.round(it.x * 100), (by.get(Math.round(it.x * 100)) ?? 0) + it.h);
      return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h);
    };
    const pct = heightOf(pairScene());
    expect(Math.max(...pct) - Math.min(...pct)).toBeLessThan(0.01); // 100% はどれも同じ高さ
    const val = pairScene({ pair_scale: 'value', pair_labels: 'value' });
    const hs = heightOf(val);
    // 合計 100・120（Air Fryer）、100・110（Full-Auto）→ 高さの比も同じ
    expect(hs[1]! / hs[0]!).toBeCloseTo(1.2, 2);
    expect(hs[3]! / hs[2]!).toBeCloseTo(1.1, 2);
    const t = texts(val);
    expect(t).toEqual(expect.arrayContaining(['60', '55', '120']));
    expect(t.some((x) => /^\d+%$/.test(x))).toBe(false);
    expect(texts(pairScene({ pair_labels: 'none' })).some((x) => /^\d+%$/.test(x))).toBe(false);
    await expectPptxMatches(val);
  });

  it('下の段はオフにできる。強調がなければ増減の段は出ない', () => {
    const off = texts(pairScene({ highlight: 'Versuni', pair_growth: false, pair_delta: false }));
    expect(off.some((x) => x.includes('%') && x.startsWith('+20'))).toBe(false);
    expect(off).not.toContain('-2');
    expect(texts(pairScene())).not.toContain('-2');
  });
});

describe('成長率の呼び方（1年は前年比、2年以上は CAGR）', () => {
  it('集合縦棒：2024→2025 は前年比、2021→2025 は CAGR', () => {
    const one = texts(render('clustered_column', { base_target: '2024', compare_target2: '2025' }, ['cagr_note']));
    expect(one).toContain('前年比（2024→2025）');
    expect(one.some((t) => t.startsWith('前年比 '))).toBe(true);
    expect(one.some((t) => t.includes('CAGR'))).toBe(false);
    const four = texts(render('clustered_column', {}, ['cagr_note']));
    expect(four).toContain('CAGR（2021→2025）');
  });

  it('折れ線：表示する年が2年続きなら前年比', () => {
    const t = texts(render('line', { items: ['2024', '2025'] }, ['cagr_note']));
    expect(t.some((x) => x.startsWith('前年比（2024→2025）'))).toBe(true);
  });
});

describe('合計の増減（全体でどうなったか）', () => {
  it('集合縦棒：表示している項目の合計を、基準→比較先で1行に', () => {
    expect(texts(render('clustered_column', {}, ['total_change']))).toContain('合計：280 → 412（+132、+47.1%、CAGR +10.1%）');
    // 2024 の欧州は空欄なので、比べられる3項目の合計
    expect(texts(render('clustered_column', { base_target: '2024', compare_target2: '2025' }, ['total_change']))).toContain('合計：279 → 322（+43、前年比 +15.4%）');
    expect(texts(render('clustered_column')).some((t) => t.startsWith('合計：'))).toBe(false);
  });

  it('差分バー・スロープにも出る（スロープは「掲載N項目計」、名前は変えられる）。PPT と一致する', async () => {
    const v = render('variance_bar', {}, ['total_change']);
    expect(texts(v)).toContain('合計：280 → 412（+132、+47.1%、CAGR +10.1%）');
    await expectPptxMatches(v);
    const s = render('slope', {}, ['total_change']);
    expect(texts(s)).toContain('掲載4項目計：280 → 412（+132、+47.1%、CAGR +10.1%）');
    await expectPptxMatches(s);
    expect(texts(render('slope', { total_label: '主要4市場計' }, ['total_change']))).toContain('主要4市場計：280 → 412（+132、+47.1%、CAGR +10.1%）');
  });

  it('足せない単位（%・率など）では出さない', () => {
    const d: Dataset = { ...trend, unit: '%' };
    expect(texts(renderWith(d, 'clustered_column', {}, ['total_change'])).some((t) => t.startsWith('合計：'))).toBe(false);
  });
});

describe('値ラベルの出し方（なし・すべて・最初と最後・強調だけ）', () => {
  // trend：年×地域、欧州は 2024 が空
  // 値ラベルだけ：なしの時の文字（目盛り・凡例など）を1つずつ引いた残り
  const labels = (controls: Record<string, unknown>, chart: ChartTypeId = 'line') => {
    const base = texts(render(chart, { ...controls, data_labels: 'off' }));
    const out = [...texts(render(chart, controls))];
    for (const b of base) { const i = out.indexOf(b); if (i >= 0) out.splice(i, 1); }
    return out;
  };
  it('折れ線：最初と最後は系列ごとの両端だけ。強調だけは強調した系列だけ', () => {
    const all = labels({ data_labels: 'all' });
    const ends = labels({ data_labels: 'ends' });
    expect(ends.length).toBeLessThan(all.length);
    // 北米 100→150、中国 60→130 の両端は出る。途中（北米 110）は出ない
    expect(ends).toEqual(expect.arrayContaining(['100', '150', '60', '130']));
    expect(ends).not.toContain('110');
    const hl = labels({ data_labels: 'highlight', highlight: '中国' });
    expect(hl).toEqual(expect.arrayContaining(['60', '75', '90', '110', '130']));
    expect(hl).not.toContain('150');
    // 強調が無ければ出さない
    expect(labels({ data_labels: 'highlight' })).not.toContain('150');
  });
  it('縦棒・積み上げ・集合縦棒でも同じ規則', () => {
    for (const chart of ['column_trend', 'stacked_column'] as ChartTypeId[]) {
      expect(labels({ data_labels: 'ends' }, chart).length).toBeLessThan(labels({ data_labels: 'all' }, chart).length);
    }
  });
});

describe('横軸の項目名（自動・小さく・縦書き・間引く）', () => {
  // 四半期が20個並ぶ（2021 Q1 … 2025 Q4）
  const qs = [2021, 2022, 2023, 2024, 2025].flatMap((y) => ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `${y} ${q}`));
  const quarterly: Dataset = {
    schema: 'MATRIX_TIME_SERIES', unit: '千台', dimensions: { rows: '四半期', cols: '地域' },
    rows: qs, cols: ['北米', '欧州'],
    periods: { current: { label: '2025 Q4', values: qs.map((_, i) => [100 + i * 3, 80 + i]) } },
  };
  const catTexts = (s: Scene) => s.items.filter((it): it is Extract<typeof it, { kind: 'text' }> => it.kind === 'text' && it.lines.some((l) => /^20\d\d/.test(l.t) || /^Q\d/.test(l.t)));

  it('単語の切れ目で折り返す', async () => {
    const { wrapWords } = await import('./common');
    expect(wrapWords('2021 Q1', 10, 0.45, 2)).toEqual(['2021', 'Q1']);
    expect(wrapWords('北米', 10, 2, 2)).toEqual(['北米']);
  });

  it.each(['line', 'column_trend', 'stacked_column', 'clustered_column'] as ChartTypeId[])('%s：縦書きは回した文字、間引くは空きができる。PPT も同じ', async (chart) => {
    const v = renderWith(quarterly, chart, { x_labels: 'vertical' });
    const vt = catTexts(v);
    if (chart !== 'clustered_column') expect(vt.filter((t) => t.rotate === -90).length).toBe(20);
    for (const it of v.items) {
      if (it.kind === 'table') continue;
      const b = itemBox(it);
      expect(b.y + b.h).toBeLessThanOrEqual(7.5);
    }
    await expectPptxMatches(v);
    if (chart !== 'clustered_column') {
      const thin = texts(renderWith(quarterly, chart, { x_labels: 'thin' }));
      const shown = qs.filter((q) => thin.includes(q));
      expect(shown.length).toBeLessThan(20);
      expect(shown).toContain('2025 Q4');
      // 小さく：8pt
      const small = catTexts(renderWith(quarterly, chart, { x_labels: 'small' }));
      expect(small.every((t) => t.lines.every((l) => l.size === 8))).toBe(true);
    }
  });
});

describe('CAGR 表の列（増減＋CAGR が既定）', () => {
  const tableHead = (controls: Record<string, unknown>) => {
    const r = validateViewSpec({
      datasetId: 't', layout: { id: 'p03_left_right', ratios: [0.68] },
      panels: [{ id: 'main', slot: 'left', kind: 'chart', chart: 'line', controls }, { id: 'cagr', slot: 'right', kind: 'table', table: 'cagr_table' }],
      slide: { title: 't' }, slideLocale: 'ja',
    }, trend);
    const s = composeSlide(r.spec!, trend);
    const t = s.items.find((i) => i.kind === 'table') as Extract<Scene['items'][number], { kind: 'table' }>;
    return { head: t.rows[0]!.map((c) => c.text), first: t.rows[1]!.map((c) => c.text) };
  };
  it('既定：開始・終了の値は出さず、増減と CAGR', () => {
    const t = tableHead({});
    expect(t.head).toEqual(['地域', '増減', 'CAGR']);
    // 中国 60→130 が CAGR 最大で先頭。増減は +70
    expect(t.first[0]).toBe('中国');
    expect(t.first[1]).toBe('+70');
  });
  it('CAGR だけ／開始・終了＋CAGR／全部', () => {
    expect(tableHead({ cagr_table_cols: 'cagr' }).head).toEqual(['地域', 'CAGR']);
    expect(tableHead({ cagr_table_cols: 'values_cagr' }).head).toEqual(['地域', '2021', '2025', 'CAGR']);
    expect(tableHead({ cagr_table_cols: 'all' }).head).toEqual(['地域', '2021', '2025', '増減', 'CAGR']);
  });
});

describe('四半期・月の横軸（年と取り違えない）', () => {
  const q: Dataset = {
    schema: 'MATRIX_TIME_SERIES', unit: '本', rows: ['2025 Q4', '2026 Q1', '2026 Q2', '2026 Q3'], cols: ['打上げ', '地球観測', '宇宙データ', '投資審査'],
    periods: { current: { label: '', values: [[5, 4, 4, 5], [7, 6, 5, 7], [9, 8, 7, 8], [10, 10, 9, 11]] } },
  };
  it('積み上げ縦棒：最初→最後の期間の伸び率を、最後の棒の横に出す（前年比・CAGR にしない）', () => {
    const s = renderWith(q, 'stacked_column', {}, ['cagr_note']);
    const t = texts(s);
    // 合計 18 → 40：+122.2%。系列：5→10 +100%、4→10 +150%、4→9 +125%、5→11 +120%
    expect(t.some((x) => x.includes('伸び率（2025 Q4→2026 Q3）') && x.includes('122.2%'))).toBe(true);
    expect(t.some((x) => x.includes('前年比') || x.includes('CAGR'))).toBe(false);
    expect(t).toEqual(expect.arrayContaining(['100.0%', '150.0%', '125.0%', '120.0%']));
    // 率は最後の棒（2026 Q3）の右に並ぶ
    const bars = s.items.filter((i) => i.kind === 'box' && (i as { w: number }).w > 0.3) as { x: number; w: number }[];
    const lastRight = Math.max(...bars.map((b) => b.x + b.w));
    const rate = s.items.find((i) => i.kind === 'text' && i.lines?.[0]?.t === '150.0%') as { x: number };
    expect(rate.x).toBeGreaterThanOrEqual(lastRight - 0.01);
  });
  it('折れ線も同じ。年だけの行は今までどおり CAGR・前年比', () => {
    expect(texts(renderWith(q, 'line', {}, ['cagr_note'])).some((x) => x.startsWith('伸び率（2025 Q4→2026 Q3）'))).toBe(true);
  });
});

describe('四半期：集合縦棒の注記とスロープの始点・終点', () => {
  const q: Dataset = {
    schema: 'MATRIX_TIME_SERIES', rows: ['2025 Q4', '2026 Q1', '2026 Q2', '2026 Q3'], cols: ['A', 'B'],
    periods: { current: { label: '', values: [[18, 10], [25, 12], [32, 14], [40, 20]] } },
  };
  it('集合縦棒：「伸び率（2025 Q4→2026 Q3）」、前年比・CAGR と呼ばない', () => {
    const t = texts(renderWith(q, 'clustered_column', {}, ['cagr_note']));
    expect(t.some((x) => x.startsWith('伸び率（2025 Q4→2026 Q3）'))).toBe(true);
    expect(t.some((x) => x.includes('前年比') || x.includes('CAGR'))).toBe(false);
  });
  it('スロープ：初期値は最初（2025 Q4）と最後（2026 Q3）', () => {
    const t = texts(renderWith(q, 'slope'));
    expect(t).toEqual(expect.arrayContaining(['2025 Q4', '2026 Q3', '+122%']));
    expect(t).not.toContain('2026 Q1');
  });
});
