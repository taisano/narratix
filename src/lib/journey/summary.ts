import type { JourneyPayload } from './journey';

/**
 * 保存したチャートの「形」だけを取り出す。表の値・行や列の名前・タイトル・注記・出典・コントロールの値は読まない。
 * 受け取る型は必要な最小限にして、うっかり他の項目を足せないようにしている。
 */
interface SlideLike { recipe: string | null; chart: string; complements: Partial<Record<string, boolean>> }
interface ProjectLike {
  dataset: { rows: unknown[]; cols: unknown[]; periods: Record<string, unknown> };
  slides: SlideLike[];
  recommendation?: { entry_mode: string; creation_mode?: string; recommended_recipe_ids: string[]; selected_recipe_ids: string[]; consultation_history_id?: string };
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export function summarizeChart(p: ProjectLike): JourneyPayload {
  const rec = p.recommendation;
  return {
    slides: p.slides.length,
    rows: p.dataset.rows.length,
    cols: p.dataset.cols.length,
    periods: Object.keys(p.dataset.periods).length,
    recipes: uniq(p.slides.map((s) => s.recipe)),
    charts: uniq(p.slides.map((s) => s.chart)),
    complements: uniq(p.slides.flatMap((s) => Object.entries(s.complements).filter(([, on]) => on).map(([id]) => id))),
    ...(rec ? {
      recommended: rec.recommended_recipe_ids, selected: rec.selected_recipe_ids,
      entry: rec.entry_mode.toLowerCase(), ...(rec.creation_mode ? { mode: rec.creation_mode.toLowerCase() } : {}),
      fromConsult: !!rec.consultation_history_id,
    } : {}),
  };
}
