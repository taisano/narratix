import { describe, expect, it } from 'vitest';
import { registry, recipeToViewSpec, type Dataset } from '@/registry';
import { composeSlide } from './layout/compose';
import { checkRecipeData, recipeIssueText, recipeRenderable, renderableRecipeIds } from './recipes';
import { endpoints } from './transform/ops';
import { fromDataset } from './transform/matrix';

const R = registry.recipes;

const sales = (over: Partial<Dataset> = {}): Dataset => ({
  schema: 'MATRIX_TIME_SERIES',
  unit: '億円',
  dimensions: { rows: '年', cols: '地域' },
  rows: ['2021', '2022', '2023', '2024', '2025'],
  cols: ['北米', '欧州', '中国', '日本', '東南アジア'],
  periods: {
    current: {
      label: '売上',
      values: [
        [320, 280, 250, 120, 60], [345, 286, 290, 118, 72], [372, 295, 335, 121, 88],
        [398, 301, 372, 119, 104], [430, 310, 420, 122, 126],
      ],
    },
  },
  ...over,
});

describe('描けるレシピ（今のエンジンで）', () => {
  it('実装済みのチャート・補完パーツ・表だけでできているもの', () => {
    const ids = renderableRecipeIds();
    expect(ids).toEqual(expect.arrayContaining(['TREND_LINE', 'TREND_LINE_AVG', 'TREND_COLUMN', 'TREND_STACKED', 'TREND_SHARE', 'COMP_RANK', 'MIX_MEKKO']));
    // CAGR の表と集合縦棒ができたので、指示書の例の3案が描ける
    expect(recipeRenderable(R.TREND_CAGR_TABLE)).toBe(true);
    expect(recipeRenderable(R.START_END_CAGR)).toBe(true);
    expect(recipeRenderable(R.SIZE_MIX_CAGR)).toBe(true);
    // 100%横棒・差分バー・スロープもできた
    expect(recipeRenderable(R.MIX_BAR100)).toBe(true);
    expect(recipeRenderable(R.COMP_VARIANCE)).toBe(true);
    expect(recipeRenderable(R.TREND_SLOPE)).toBe(true);
  });

  it.each(renderableRecipeIds().filter((id) => R[id].schema === 'MATRIX_TIME_SERIES'))('%s は売上データで1枚に組める', (id) => {
    const spec = recipeToViewSpec(R[id], { datasetId: 'x', slideLocale: 'ja', title: 'T' });
    expect(() => composeSlide(spec, sales())).not.toThrow();
  });
});

describe('データを入れた後の確認（決まった規則と決まった文）', () => {
  it('条件を満たすと ok', () => {
    for (const id of ['TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'START_END_CAGR'] as const) {
      expect(checkRecipeData(R[id], sales())).toEqual({ ok: true, issues: [] });
    }
  });

  it('開始年の値が無いと、指示書の定型文で不足を出す', () => {
    const d = sales();
    d.periods.current.values[0]![2] = null;
    const c = checkRecipeData(R.TREND_CAGR_TABLE, d);
    expect(c.ok).toBe(false);
    expect(c.issues).toEqual([{ severity: 'error', code: 'missing_endpoint', params: { year: 2021, cols: '中国' } }]);
    expect(recipeIssueText(c.issues[0]!, 'ja')).toBe('CAGR を計算するには、開始年と終了年の両方のデータが必要です。不足：2021年の 中国');
    // 年が要らないレシピは作れる
    expect(checkRecipeData(R.TREND_LINE, d).ok).toBe(true);
  });

  it('行が年でないと、年が必要なレシピは作れない', () => {
    const d = sales({ rows: ['A', 'B', 'C', 'D', 'E'] });
    expect(checkRecipeData(R.START_END_CAGR, d).issues.map((i) => i.code)).toEqual(['needs_years']);
    expect(checkRecipeData(R.COMP_RANK, d).ok).toBe(true);
    // 推移のレシピは作れるが、行が時間でないことを知らせる
    const line = checkRecipeData(R.TREND_LINE, d);
    expect(line.ok).toBe(true);
    expect(line.issues.map((i) => i.code)).toEqual(['rows_not_time']);
  });

  it('データの形が違う（Mekko は行×内訳のデータ）', () => {
    const c = checkRecipeData(R.MIX_MEKKO, sales());
    expect(c.issues[0]).toMatchObject({ code: 'schema' });
    expect(recipeIssueText(c.issues[0]!, 'ja')).toContain('行＝横幅にする項目');
    // Mekko のデータなら、推移のレシピも描ける（同じ行×列の数値）
    expect(checkRecipeData(R.TREND_LINE, sales({ schema: 'MEKKO' })).ok).toBe(true);
  });

  it('始点が 0 以下は CAGR が N/A（警告のみ）、系列が多すぎる時も警告', () => {
    const d = sales();
    d.periods.current.values[0]![4] = 0;
    const c = checkRecipeData(R.TREND_CAGR_TABLE, d);
    expect(c.ok).toBe(true);
    expect(c.issues.map((i) => i.code)).toEqual(['cagr_na']);
    const many = sales({ cols: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    many.periods.current.values = many.periods.current.values.map((r) => [...r, 1, 2, 3, 4]);
    expect(checkRecipeData(R.TREND_LINE, many).issues.map((i) => i.code)).toEqual(['too_many_series']);
  });

  it('比較期間が無いと、成長率の表付き Mekko は作れない', () => {
    const d = sales({ schema: 'MEKKO' });
    expect(checkRecipeData(R.MIX_MEKKO_GROWTH, d).issues.map((i) => i.code)).toContain('needs_base');
  });

  it('英語の文', () => {
    const d = sales();
    d.periods.current.values[4]![0] = null;
    d.periods.current.values[4]![1] = null;
    const c = checkRecipeData(R.TREND_CAGR_TABLE, d);
    expect(recipeIssueText(c.issues[0]!, 'en')).toBe('CAGR needs data for both the start and end year. Missing: 北米, 欧州 in 2025');
  });
});

describe('最初と最後の時点だけ（endpoints）', () => {
  it('年なら最小の年と最大の年、そうでなければ先頭と末尾', () => {
    const m = endpoints(fromDataset(sales({ rows: ['2023', '2021', '2025', '2022', '2024'] })));
    expect(m.rows).toEqual(['2021', '2025']);
    const V = sales().periods.current.values;
    expect(m.current.values).toEqual([V[1], V[2]]);
    const n = endpoints(fromDataset(sales({ rows: ['A', 'B', 'C', 'D', 'E'] })));
    expect(n.rows).toEqual(['A', 'E']);
  });
});

describe('CAGR の表と集合縦棒', () => {
  const texts = (id: keyof typeof R, over: Partial<Dataset> = {}) =>
    composeSlide(recipeToViewSpec(R[id], { datasetId: 'x', slideLocale: 'ja', title: 'T' }), sales(over)).items
      .flatMap((i) => (i.kind === 'text' ? i.lines.map((l) => l.t) : i.kind === 'table' ? i.rows.flat().map((c) => c.text) : []));

  it('CAGR の表：高い順、開始年と終了年の値、見出し', () => {
    const t = texts('TREND_CAGR_TABLE');
    expect(t).toContain('CAGR（2021→2025）');
    // 東南アジア（60→126）が一番、日本（120→122）が一番下
    const rows = t.filter((x) => ['北米', '欧州', '中国', '日本', '東南アジア'].includes(x));
    expect(rows.slice(-5)).toEqual(['東南アジア', '中国', '北米', '欧州', '日本']);
    expect(t).toContain('20.4%');
  });

  it('全体の拡大と構成：2時点の積み上げ＋CAGR の表', () => {
    const t = texts('SIZE_MIX_CAGR');
    expect(t).toContain('2021');
    expect(t).toContain('2025');
    expect(t).not.toContain('2023');
    expect(t).toContain('CAGR（2021→2025）');
  });

  it('開始と終了：基準＝最初の年、比較先＝最後の年、CAGR を添える', () => {
    const t = texts('START_END_CAGR');
    expect(t).toEqual(expect.arrayContaining(['2021', '2025', 'CAGR 20.4%', 'CAGR（2021→2025）']));
  });

  it('集合縦棒の増減ラベル（↑ +12）は比較期間のデータが無くても使える', () => {
    const spec = recipeToViewSpec(R.START_END_CAGR, { datasetId: 'x', slideLocale: 'ja', title: 'T' });
    spec.panels[0]!.inChartComplements = [{ id: 'delta_labels' }];
    const t = composeSlide(spec, sales()).items.flatMap((i) => (i.kind === 'text' ? i.lines.map((l) => l.t) : []));
    expect(t).toContain('↑ +170');
    expect(checkRecipeData(R.START_END_CAGR, sales()).ok).toBe(true);
  });

  it('行が年でないと、CAGR の表は理由を出す', () => {
    const t = texts('TREND_CAGR_TABLE', { rows: ['A', 'B', 'C', 'D', 'E'] });
    expect(t.join('')).toContain('年');
  });
});

describe('100%横棒・差分バー・スロープ', () => {
  const texts = (id: keyof typeof R, controls: Record<string, unknown> = {}) => {
    const spec = recipeToViewSpec(R[id], { datasetId: 'x', slideLocale: 'ja', title: 'T' });
    spec.panels[0]!.controls = { ...spec.panels[0]!.controls, ...controls };
    return composeSlide(spec, sales()).items.flatMap((i) => (i.kind === 'text' || i.kind === 'box' ? (i.lines ?? []).map((l) => l.t) : []));
  };

  it('2時点の構成：最初と最後の年だけ、構成比を棒の中に', () => {
    const t = texts('MIX_BAR100');
    expect(t).toContain('2021');
    expect(t).toContain('2025');
    expect(t).not.toContain('2023');
    // 2025 年の北米は 430 / 1,408 ＝ 31%
    expect(t).toContain('31%');
  });

  it('差分バー：差の大きい順、符号付き、見出しに期間', () => {
    const t = texts('COMP_VARIANCE');
    expect(t).toContain('2021 → 2025 の差');
    const names = t.filter((x) => ['北米', '欧州', '中国', '日本', '東南アジア'].includes(x));
    expect(names).toEqual(['中国', '北米', '東南アジア', '欧州', '日本']);
    expect(t).toEqual(expect.arrayContaining(['+170', '+110', '+66', '+30', '+2']));
  });

  it('スロープ：両端に系列名と値、年は見出しに', () => {
    const t = texts('TREND_SLOPE');
    expect(t).toEqual(expect.arrayContaining(['2021', '2025', '北米  320', '430  北米', '東南アジア  60', '126  東南アジア']));
  });
});
