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

export function draftTitle(r: RecipeDef, locale: Locale, d: Pick<Dataset, 'rows' | 'cols'>): string {
  const ja = locale === 'ja';
  if (TREND.has(r.id) && d.cols.length === 1 && d.cols[0]) return ja ? `${d.cols[0]}はどう推移したか` : `How has ${d.cols[0]} moved over time?`;
  if (r.id === 'TABLE_HEAT' && d.cols.length >= 1 && d.rows.length >= 1) {
    const names = d.cols.map(bare).filter(Boolean);
    if (names.length) return ja ? `${join(names, true)}の高低を、濃淡で見る` : `${join(names, false)}: highs and lows`;
  }
  if (r.id === 'TABLE_BASIC' && d.cols.length >= 1 && d.rows.length >= 1) {
    const names = d.cols.map(bare).filter(Boolean);
    // 項目ごとの表（列＝指標）：指標の名前。時系列の表（列＝系列）は系列の名前
    if (names.length) return ja ? `${join(names, true)}の数値` : `${join(names, false)}: figures`;
  }
  if (r.id === 'COMP_COMBO' && d.cols.length >= 2) {
    const names = d.cols.map(bare).filter(Boolean);
    return ja ? `${join(names, true)}を、項目ごとに1枚で比べる` : `${join(names, false)}, item by item`;
  }
  if (r.id === 'TABLE_DELTA' && d.rows.length >= 2) {
    const a = d.rows[0]!, b = d.rows[d.rows.length - 1]!;
    return ja ? `${a}と${b}の差` : `Difference between ${a} and ${b}`;
  }
  return localize(r.question, locale);
}
