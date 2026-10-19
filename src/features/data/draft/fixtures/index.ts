import { checkPaste } from '@/features/editor/dataCheck';
import { profileTable } from '../profile';

/** 匿名化した固定データ（実在の国名・会社名・顧客名は使わない）。実データは置き換えたうえで回帰テストに足す */

/** 1. 縦持ちの時系列：月・商品・実績・予算 */
export const LONG_TSV = [
  '月\t商品\t実績\t予算',
  '2025年1月\tZZ_PRODUCT_ALPHA\t1200\t1000',
  '2025年1月\tZZ_PRODUCT_BETA\t800\t900',
  '2025年2月\tZZ_PRODUCT_ALPHA\t1350\t1100',
  '2025年2月\tZZ_PRODUCT_BETA\t760\t900',
  '2025年3月\tZZ_PRODUCT_ALPHA\t1500\t1200',
  '2025年3月\tZZ_PRODUCT_BETA\t910\t950',
].join('\n');

/** 2. 横持ちの時系列：行が月、列が国（列見出しが項目名） */
export const WIDE_TSV = [
  '月\tZZ_JAPAN\tZZ_USA\tZZ_GERMANY\tZZ_CLIENT_A',
  '2025年1月\t120\t340\t210\t55',
  '2025年2月\t135\t310\t225\t60',
  '2025年3月\t150\t355\t205\t72',
  '2025年4月\t160\t380\t230\t80',
].join('\n');

/** 3. 7か国型：国・CY の水準・前年差pp・別指標。前年の水準の列は無い */
export const SEVEN_TSV = [
  'Country\tCY Value Share\tvs LY (pp)\tCY ASP\tASP vs LY\tCY Weighted Dist.\tPrimary Indicator\tZZ_RIVAL CY Share\tZZ_RIVAL vs LY (pp)',
  'ZZ_ALAND\t21.2%\t6.9%\t€89\t-8.1%\t32.9\tPrice-led\t14.3%\t-3.5%',
  'ZZ_BORDURIA\t32.8%\t6.9%\t€72\t-5.5%\t31.6\tPrice-led\t12.1%\t-4.9%',
  'ZZ_CASCADIA\t18.5%\t5.5%\t€86\t6.5%\t35.9\tVolume / mix-led\t2.7%\t-0.1%',
  'ZZ_DORNE\t0.3%\t0.2%\t€58\t8.5%\t9.7\tDistribution-led\t14.4%\t-5.5%',
  'ZZ_ELBONIA\t0.1%\t0.1%\t€93\t-9.1%\t16.4\tPrice + distribution\t47.3%\t-8.3%',
  'ZZ_FREEDONIA\t0.0%\t0.0%\t€128\t37.9%\t0.8\tMixed / portfolio\t24.0%\t-8.0%',
  'ZZ_GENOVIA\t0.2%\t-1.4%\t€72\t-8.3%\t37.5\tPrice-led\t17.2%\t-5.1%',
].join('\n');

/** 4. 横持ちの期間：行が商品、列が月（列見出しが期間） */
export const PERIOD_ACROSS_TSV = [
  '商品\t2025年1月\t2025年2月\t2025年3月',
  'ZZ_ITEM_ONE\t100\t110\t120',
  'ZZ_ITEM_TWO\t200\t190\t210',
  'ZZ_ITEM_THREE\t50\t55\t53',
].join('\n');

/** 5. 項目×1指標：国別売上 */
export const ONE_METRIC_TSV = [
  '国\t売上',
  'ZZ_ALAND\t120',
  'ZZ_BORDURIA\t340',
  'ZZ_CASCADIA\t210',
  'ZZ_DORNE\t55',
].join('\n');

/** 6. 実績と予算（項目別） */
export const ACTUAL_BUDGET_TSV = [
  '商品\t実績\t予算',
  'ZZ_PRODUCT_ALPHA\t1200\t1000',
  'ZZ_PRODUCT_BETA\t800\t900',
  'ZZ_PRODUCT_GAMMA\t640\t600',
].join('\n');

export function load(tsv: string) {
  const r = checkPaste(tsv);
  if (!r.table) throw new Error('fixture did not parse');
  return { table: r.table, profile: profileTable(r.table), check: r };
}

/** 固定データに現れる、送ってはいけない目印の文字列 */
export const SENTINELS = ['ZZ_PRODUCT_ALPHA', 'ZZ_PRODUCT_BETA', 'ZZ_PRODUCT_GAMMA', 'ZZ_JAPAN', 'ZZ_USA', 'ZZ_GERMANY', 'ZZ_CLIENT_A',
  'ZZ_ALAND', 'ZZ_BORDURIA', 'ZZ_CASCADIA', 'ZZ_DORNE', 'ZZ_ELBONIA', 'ZZ_FREEDONIA', 'ZZ_GENOVIA', 'ZZ_RIVAL', 'ZZ_ITEM_ONE', 'ZZ_ITEM_TWO', 'ZZ_ITEM_THREE'];
