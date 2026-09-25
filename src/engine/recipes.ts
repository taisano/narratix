import {
  SCHEMA_COMPAT, localize, registry, recipeToViewSpec, validateViewSpec,
  type Dataset, type LocalizedText, type Locale, type RecipeDef, type RecipeId,
} from '@/registry';
import { IMPLEMENTED_CHARTS } from './layout/compose';
import { IMPLEMENTED_COMPLEMENTS } from './layout/charts';
import { timeRange } from './transform/cagr';

/** 描画を実装済みの表 */
export const IMPLEMENTED_TABLES: readonly string[] = ['growth_table', 'cagr_table'];

/** そのレシピを今のエンジンで描けるか（チャート・チャート内の補完パーツ・表がすべて実装済み） */
export function recipeRenderable(r: RecipeDef): boolean {
  return r.view.panels.every((p) => {
    if (p.kind === 'chart') {
      if (!p.chart || !IMPLEMENTED_CHARTS.includes(p.chart)) return false;
      const ok = IMPLEMENTED_COMPLEMENTS[p.chart] ?? [];
      return (p.inChartComplements ?? []).every((c) => ok.includes(c.id));
    }
    if (p.kind === 'table') return !!p.table && IMPLEMENTED_TABLES.includes(p.table);
    return true;
  });
}

export const renderableRecipeIds = (): RecipeId[] =>
  (Object.keys(registry.recipes) as RecipeId[]).filter((id) => recipeRenderable(registry.recipes[id]));

// ──────────── データを入れた後の確認（13章）。AI は使わず、決まった規則と決まった文で ────────────

export type RecipeIssueCode =
  | 'schema' | 'no_values' | 'min_rows' | 'needs_years' | 'missing_endpoint' | 'cagr_na'
  | 'needs_base' | 'too_many_series' | 'rows_not_time' | 'spec';

export interface RecipeIssue {
  severity: 'error' | 'warning';
  code: RecipeIssueCode;
  params: Record<string, string | number>;
}

export interface RecipeCheck {
  /** error が無ければ作れる（warning は作れるが注意） */
  ok: boolean;
  issues: RecipeIssue[];
}

/**
 * 入力したデータで、そのレシピを作れるかを確かめる。
 * endpoints：画面で選んだ基準と比較先（集合縦棒の「差分の基準」「比較先」など）。あればその2つの年で確かめる
 */
export function checkRecipeData(r: RecipeDef, dataset: Dataset, opts: { endpoints?: { from: string; to: string } } = {}): RecipeCheck {
  const issues: RecipeIssue[] = [];
  const err = (code: RecipeIssueCode, params: RecipeIssue['params'] = {}) => issues.push({ severity: 'error', code, params });
  const warn = (code: RecipeIssueCode, params: RecipeIssue['params'] = {}) => issues.push({ severity: 'warning', code, params });
  const req = r.requirements;

  if (!SCHEMA_COMPAT[r.schema].includes(dataset.schema)) err('schema', { schema: r.schema });
  const vals = dataset.periods.current.values;
  if (!vals.some((row) => row.some((v) => v != null))) err('no_values');
  if (req.minRows && dataset.rows.length < req.minRows) err('min_rows', { need: req.minRows, have: dataset.rows.length });

  if (req.timeAxis) {
    const t = chosenRange(dataset.rows, opts.endpoints) ?? timeRange(dataset.rows);
    if (!t) err('needs_years');
    else {
      // 開始年・終了年に値の無い列（CAGR・開始と終了の比較が出せない）
      for (const [idx, year] of [[t.fromIndex, t.from], [t.toIndex, t.to]] as const) {
        const missing = dataset.cols.filter((_, k) => vals[idx]?.[k] == null);
        if (missing.length) err('missing_endpoint', { year, cols: missing.join('、'), metric: t.to - t.from === 1 ? 'yoy' : 'cagr' });
      }
      if (r.derived.includes('cagr')) {
        const na = dataset.cols.filter((_, k) => { const v = vals[t.fromIndex]?.[k]; return v != null && v <= 0; });
        if (na.length) warn('cagr_na', { year: t.from, cols: na.join('、'), metric: t.to - t.from === 1 ? 'yoy' : 'cagr' });
      }
    }
  }
  if (req.base && !dataset.periods.base) err('needs_base');
  // 推移のレシピなのに、行が時間（年など）でないとき（止めずに知らせる）
  if (r.goals[0] === 'trend' && !req.timeAxis && dataset.rows.length >= 2 && !timeRange(dataset.rows)) warn('rows_not_time');
  if (req.maxSeries && dataset.cols.length > req.maxSeries) warn('too_many_series', { max: req.maxSeries, have: dataset.cols.length });

  // レジストリの検証（パネルの組み合わせ・設定の値など）
  if (!issues.some((i) => i.severity === 'error')) {
    const v = validateViewSpec(recipeToViewSpec(r, { datasetId: 'check', slideLocale: 'ja', title: '' }), dataset);
    v.issues.filter((i) => i.severity === 'error').forEach((i) => err('spec', { detail: i.code }));
  }
  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}

/** 選んだ2つの行がどちらも年なら、その範囲（古い方→新しい方） */
function chosenRange(rows: readonly string[], e?: { from: string; to: string }) {
  if (!e) return null;
  const i = rows.indexOf(e.from), j = rows.indexOf(e.to);
  if (i < 0 || j < 0 || i === j) return null;
  const t = timeRange([rows[i]!, rows[j]!]);
  return t ? { ...t, fromIndex: t.fromIndex === 0 ? i : j, toIndex: t.toIndex === 0 ? i : j } : null;
}

const METRIC: Record<string, LocalizedText> = { cagr: { ja: 'CAGR', en: 'CAGR' }, yoy: { ja: '前年比', en: 'YoY growth' } };

const SCHEMA_NEED: Record<string, LocalizedText> = {
  MATRIX_TIME_SERIES: { ja: '行＝時間（年など）× 列＝項目', en: 'rows = time (e.g. years) × columns = items' },
  MEKKO: { ja: '行＝横幅にする項目 × 列＝内訳の項目（足し算できる数値）', en: 'rows = width items × columns = parts (additive values)' },
};

const TEXT: Record<RecipeIssueCode, LocalizedText> = {
  schema: { ja: 'このレシピには、{need} の形のデータが必要です。', en: 'This recipe needs data shaped as {need}.' },
  no_values: { ja: '数値が入っていません。', en: 'No numbers have been entered.' },
  min_rows: { ja: '行が {need} つ以上必要です（今は {have} つ）。', en: 'Needs at least {need} rows (now {have}).' },
  needs_years: { ja: 'CAGR や開始年と終了年の比較には、行に年（例：2021、2025）が2つ以上必要です。', en: 'CAGR and start–end comparisons need at least two years in the rows (e.g. 2021, 2025).' },
  missing_endpoint: { ja: '{metric} を計算するには、開始年と終了年の両方のデータが必要です。不足：{year}年の {cols}', en: '{metric} needs data for both the start and end year. Missing: {cols} in {year}' },
  cagr_na: { ja: '{year}年の値が 0 以下のため、{metric} は計算できません（N/A と表示）：{cols}', en: '{metric} cannot be calculated where the {year} value is 0 or less (shown as N/A): {cols}' },
  needs_base: { ja: '成長率の表には、比較する期間のデータが必要です。', en: 'The growth table needs data for the comparison period.' },
  too_many_series: { ja: '系列が {have} あります。{max} を超えると読みにくくなります。', en: 'There are {have} series; more than {max} gets hard to read.' },
  spec: { ja: 'この組み合わせは作れません（{detail}）。', en: 'This combination cannot be built ({detail}).' },
  rows_not_time: { ja: '行が時間（年など）ではないようです。推移を見せるには、行＝時間のデータを使います。', en: 'The rows do not look like time (e.g. years). Trends need rows = time.' },
};

/** 確認結果の決まった文（画面に出す） */
export function recipeIssueText(issue: RecipeIssue, locale: Locale): string {
  const params: Record<string, string | number> = { ...issue.params };
  if (issue.code === 'schema') params.need = localize(SCHEMA_NEED[String(issue.params.schema)] ?? { en: String(issue.params.schema) }, locale);
  params.metric = localize(METRIC[String(issue.params.metric ?? 'cagr')] ?? METRIC.cagr!, locale);
  if (locale === 'en' && typeof params.cols === 'string') params.cols = params.cols.split('、').join(', ');
  return localize(TEXT[issue.code], locale).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}
