import { describe, expect, it } from 'vitest';
import { composeSlide } from '@/engine';
import { primaryChart, registry } from '@/registry';
import { planFromPurposes, chooseRecipe, chosenRecipes, toggleChosen } from '../start/plan';
import { renameCol, deleteCol, setCell } from './edit';
import {
  duplicateSlide, fromBuilder, initialProject, moveSlide, normalizeProject, projectFromPlan, removeSlide, selectSlide,
  validateProject, viewOf, viewSpecs, withView,
} from './project';
import { initialState, sampleFor, toDataset } from './state';

const planOf3 = () => {
  let plan = planFromPurposes(['trend']);
  const a = plan.angles[0]!;
  for (const it of a.items.filter((i) => i.role === 'sub')) plan = toggleChosen(plan, a.id, it.recipe);
  return chooseRecipe(plan, 'COMP_RANK');
};

describe('プロジェクト＝データ1つ＋スライド N 枚', () => {
  it('② で選んだ案が1枚ずつスライドになり、データは1つ', () => {
    const plan = planOf3();
    const want = chosenRecipes(plan).map((c) => c.recipe);
    expect(want.length).toBe(4);
    const p = projectFromPlan(plan, initialState(), 'ja')!;
    expect(p.slides.map((s) => s.recipe)).toEqual(want.map((r) => r.id));
    expect(p.slides.map((s) => s.chart)).toEqual(want.map((r) => primaryChart(r)));
    // サンプルのままなら、案に合うサンプル（推移）に替わる
    expect(p.dataset).toEqual(sampleFor('trend').dataset);
    // 見出しは案の問いから始める
    expect(p.slides[0]!.title).toBe(registry.recipes.TREND_LINE.question.ja);
    expect(validateProject(p).ok).toBe(true);
    expect(viewSpecs(p)).toHaveLength(4);
    expect(p.recommendation?.selected_recipe_ids).toEqual(want.map((r) => r.id));
  });

  it('データを直すと全スライドに効き、見出し・設定はスライドごと', () => {
    let p = projectFromPlan(planOf3(), initialState(), 'ja')!;
    const v0 = viewOf(p, 0);
    p = withView(p, 0, setCell({ ...v0, title: '1枚目の見出し' }, 'current', 0, 0, 999));
    expect(viewOf(p, 3).dataset.periods.current.values[0]![0]).toBe(999);
    expect(viewOf(p, 0).title).toBe('1枚目の見出し');
    expect(viewOf(p, 3).title).toBe(registry.recipes.COMP_RANK.question.ja);
    // チャートを替えたスライドは、レシピから外れる
    p = withView(p, 0, { ...viewOf(p, 0), chart: 'column_trend' });
    expect(p.slides[0]!.recipe).toBeNull();
    expect(p.slides[3]!.recipe).toBe('COMP_RANK');
  });

  it('列の名前を変えると、ほかのスライドの設定（強調など）も追いかける', () => {
    let p = projectFromPlan(planOf3(), initialState(), 'ja')!;
    const first = p.dataset.cols[0]!;
    p = withView(p, 3, { ...viewOf(p, 3), controls: { ...viewOf(p, 3).controls, highlight: first } });
    p = withView(p, 0, renameCol(viewOf(p, 0), 0, 'North America'));
    expect(p.slides[3]!.controls.highlight).toBe('North America');
    p = withView(p, 0, deleteCol(viewOf(p, 0), 0));
    expect(p.slides[3]!.controls.highlight).toBeUndefined();
  });

  it('スライドの複製・削除・並べ替え・選択', () => {
    let p = projectFromPlan(planOf3(), initialState(), 'ja')!;
    const src = p.slides[1]!.chart;
    p = duplicateSlide(selectSlide(p, 1));
    expect(p.slides).toHaveLength(5);
    expect(p.current).toBe(2);
    expect(p.slides[2]!.chart).toBe(src);
    expect(p.slides[2]!.recipe).toBeNull();
    expect(new Set(p.slides.map((s) => s.id)).size).toBe(5);
    p = moveSlide(p, 2, -1);
    expect(p.current).toBe(1);
    expect(p.slides[1]!.recipe).toBeNull();
    p = removeSlide(p, 1);
    expect(p.slides).toHaveLength(4);
    // 消したスライドの位置にある次のスライドを選ぶ
    expect(p.current).toBe(1);
    // 最後の1枚は消せない
    let one = initialProject();
    one = removeSlide(one, 0);
    expect(one.slides).toHaveLength(1);
  });

  it('保存形式：v2（1枚）は1枚のプロジェクトとして読める。v3 はそのまま', () => {
    const v2 = { ...initialState(), title: '古い保存' };
    const p = normalizeProject(v2)!;
    expect(p.version).toBe(3);
    expect(p.slides).toHaveLength(1);
    expect(viewOf(p).title).toBe('古い保存');
    const p3 = projectFromPlan(planOf3(), initialState(), 'ja')!;
    expect(normalizeProject(JSON.parse(JSON.stringify(p3)))).toEqual(p3);
    expect(normalizeProject({ version: 3, slides: [] })).toBeNull();
    expect(normalizeProject(null)).toBeNull();
    expect(fromBuilder(initialState()).slides[0]!.chart).toBe('mekko');
  });

  it('自分で入れたデータは替えない', () => {
    const mine = { ...initialState(), dataset: { ...sampleFor('trend').dataset, rows: ['2019', '2020', '2021', '2022', '2023'] } };
    const p = projectFromPlan(planOf3(), mine, 'ja')!;
    expect(p.dataset.rows).toEqual(['2019', '2020', '2021', '2022', '2023']);
  });
});

describe('レシピから作ったスライドは、レシピの構成（表・変換）のまま描く', () => {
  const one = (id: 'TREND_CAGR_TABLE' | 'SIZE_MIX_CAGR' | 'START_END_CAGR') => {
    const p = projectFromPlan(chooseRecipe(planFromPurposes(['trend']), id), initialState(), 'ja')!;
    const i = p.slides.findIndex((s) => s.recipe === id);
    return { p, i };
  };
  const texts = (spec: ReturnType<typeof viewSpecs>[number], p: ReturnType<typeof one>['p']) =>
    JSON.stringify(composeSlide(spec, toDataset(viewOf(p))).items);

  it('推移＋CAGR表：左に折れ線、右に CAGR 表', () => {
    const { p, i } = one('TREND_CAGR_TABLE');
    const v = viewSpecs(p)[i]!;
    expect(v.layout.id).toBe('p03_left_right');
    expect(v.panels.map((x) => x.table ?? x.chart)).toEqual(['line', 'cagr_table']);
    expect(v.recipe?.id).toBe('TREND_CAGR_TABLE');
    expect(validateProject(p).results[i]!.ok).toBe(true);
    expect(texts(v, p)).toContain('CAGR');
  });

  it('規模と構成：最初と最後の年だけの積み上げ＋CAGR表', () => {
    const { p, i } = one('SIZE_MIX_CAGR');
    const v = viewSpecs(p)[i]!;
    const main = v.panels.find((x) => x.id === 'main')!;
    expect(main.transform).toEqual([{ type: 'endpoints' }]);
    expect(main.inChartComplements?.map((c) => c.id)).toContain('total_labels');
    expect(v.panels.some((x) => x.table === 'cagr_table')).toBe(true);
  });

  it('表を外すと1枚のチャートに戻り、チャートを替えるとレシピの構成は使わない', () => {
    const { p, i } = one('TREND_CAGR_TABLE');
    const q = selectSlide(p, i);
    const hidden = withView(q, i, { ...viewOf(q), hiddenParts: ['cagr'] });
    expect(hidden.slides[i]!.hiddenParts).toEqual(['cagr']);
    const v = viewSpecs(hidden)[i]!;
    expect(v.layout.id).toBe('p01_single');
    expect(v.panels).toHaveLength(1);
    expect(v.panels[0]!.slot).toBe('main');
    const other = withView(q, i, { ...viewOf(q), chart: 'column_trend' });
    expect(other.slides[i]!.recipe).toBeNull();
    expect(viewSpecs(other)[i]!.panels).toHaveLength(1);
  });
});
