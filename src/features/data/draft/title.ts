import { localize, type Dataset, type Locale, type RecipeDef } from '@/registry';

/**
 * 実データで描いた下書きのタイトル。レシピの問い（見本用の一般文）をそのまま出すと、データに合わないことがある
 * （系列が1つなのに「各系列は…」、表なのに「正確な数値は、いくつか」）ので、データの見出しから作る。作れなければレシピの問い
 */
const TREND = new Set(['TREND_LINE', 'TREND_COLUMN']);
const join = (names: string[], ja: boolean) => {
  const shown = names.slice(0, 3);
  return shown.join(ja ? '・' : ', ') + (names.length > 3 ? (ja ? 'など' : ', …') : '');
};
const bare = (h: string) => h.replace(/[（(][^）)]*[）)]\s*$/, '').trim();

/** 縦棒＋折れ線の下書きの初めの系列の設定：描かない列（comboHide）を隠す。無ければ設定なし */
export const draftComboControls = (d: { cols: string[]; comboHide?: string[] }): { combo_series: { name: string; hidden?: boolean }[] } | null =>
  d.comboHide?.length ? { combo_series: d.cols.map((name) => ({ name, ...(d.comboHide!.includes(name) ? { hidden: true } : {}) })) } : null;

export function draftTitle(r: RecipeDef, locale: Locale, d: Pick<Dataset, 'rows' | 'cols'> & { comboHide?: string[] }): string {
  const ja = locale === 'ja';
  if (TREND.has(r.id) && d.cols.length === 1 && d.cols[0]) return ja ? `${d.cols[0]}はどう推移したか` : `How has ${d.cols[0]} moved over time?`;
  if (r.id === 'TABLE_KPI' && d.cols.length >= 1) {
    const names = d.cols.map(bare).filter(Boolean);
    if (names.length) return ja ? `${join(names, true)}の最新の値と、前の期間との比較` : `${join(names, false)}: latest values vs the previous period`;
  }
  if (r.id === 'TABLE_HEAT' && d.cols.length >= 1 && d.rows.length >= 1) {
    const names = d.cols.map(bare).filter(Boolean);
    if (names.length) return ja ? `${join(names, true)}の高低を、濃淡で見る` : `${join(names, false)}: highs and lows`;
  }
  if (r.id === 'EVAL_SMALL_BARS' && d.cols.length >= 2) {
    const names = d.cols.map(bare).filter(Boolean);
    if (names.length) return ja ? `${join(names, true)}を、項目ごとに見比べる` : `${join(names, false)}, item by item`;
  }
  if (r.id === 'TABLE_BASIC' && d.cols.length >= 1 && d.rows.length >= 1) {
    const names = d.cols.map(bare).filter(Boolean);
    // 項目ごとの表（列＝指標）：指標の名前。時系列の表（列＝系列）は系列の名前
    if (names.length) return ja ? `${join(names, true)}の数値` : `${join(names, false)}: figures`;
  }
  if (r.id === 'COMP_COMBO' && d.cols.length >= 2) {
    const names = d.cols.filter((c) => !d.comboHide?.includes(c)).map(bare).filter(Boolean);
    // 行が期間（月・年・四半期など）の表は「期間ごと」
    const periods = d.rows.length >= 2 && d.rows.every((x) => /^\d{4}|^\d{1,2}月|^Q[1-4]|四半期|年度|[0-9]期|週/i.test(x));
    return ja ? `${join(names, true)}を、${periods ? '期間' : '項目'}ごとに1枚で比べる` : `${join(names, false)}, ${periods ? 'period by period' : 'item by item'}`;
  }
  if (r.id === 'TABLE_DELTA' && d.rows.length >= 2) {
    const a = d.rows[0]!, b = d.rows[d.rows.length - 1]!;
    return ja ? `${a}と${b}の差` : `Difference between ${a} and ${b}`;
  }
  return localize(r.question, locale);
}
