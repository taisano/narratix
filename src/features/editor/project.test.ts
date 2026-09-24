import { describe, expect, it } from 'vitest';
import { registry } from '@/registry';
import { planFromPurposes, chooseRecipe, toggleChosen } from '../start/plan';
import { renameCol, deleteCol, setCell } from './edit';
import {
  duplicateSlide, fromBuilder, initialProject, moveSlide, normalizeProject, projectFromPlan, removeSlide, selectSlide,
  validateProject, viewOf, viewSpecs, withView,
} from './project';
import { initialState, sampleFor } from './state';

const planOf3 = () => {
  let plan = planFromPurposes(['trend']);
  const a = plan.angles[0]!;
  for (const it of a.items.filter((i) => i.role === 'sub')) plan = toggleChosen(plan, a.id, it.recipe);
  return chooseRecipe(plan, 'COMP_RANK');
};

describe('プロジェクト＝データ1つ＋スライド N 枚', () => {
  it('② で選んだ案が1枚ずつスライドになり、データは1つ', () => {
    const p = projectFromPlan(planOf3(), initialState(), 'ja')!;
    expect(p.slides.map((s) => s.recipe)).toEqual(['TREND_LINE', 'TREND_STACKED', 'TREND_COLUMN', 'COMP_RANK']);
    expect(p.slides.map((s) => s.chart)).toEqual(['line', 'stacked_column', 'column_trend', 'bar_rank']);
    // サンプルのままなら、案に合うサンプル（推移）に替わる
    expect(p.dataset).toEqual(sampleFor('trend').dataset);
    // 見出しは案の問いから始める
    expect(p.slides[0]!.title).toBe(registry.recipes.TREND_LINE.question.ja);
    expect(validateProject(p).ok).toBe(true);
    expect(viewSpecs(p)).toHaveLength(4);
    expect(p.recommendation?.selected_recipe_ids).toEqual(['TREND_LINE', 'TREND_STACKED', 'TREND_COLUMN', 'COMP_RANK']);
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
    p = duplicateSlide(selectSlide(p, 1));
    expect(p.slides).toHaveLength(5);
    expect(p.current).toBe(2);
    expect(p.slides[2]!.chart).toBe('stacked_column');
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
