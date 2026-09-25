import type { Locale } from '@/registry';

/**
 * スライドに自動で入る文言（slideLocale に従う）。画面の文言（messages/*.json）とは分ける。
 * {name} は差し込み。
 */
const SLIDE_TEXT = {
  ja: {
    periodYear: '{year}年',
    mekkoNote: '幅：{period}の市場規模（{unit}）　高さ：{cols}の構成比',
    mixAxis: '{cols}構成比',
    paren: '（{text}）',
    valueShare: '{value}（{pct}）',
    cagr: 'CAGR',
    periodGrowth: '伸び率',
    market: '市場全体',
    total: '全体',
    others: 'その他',
    colsFallback: 'セグメント',
    rowsFallback: '項目',
    sum: '合計',
    dataTitle: '元データ（単位：{unit}）',
    unitNote: '単位：{unit}',
    asOf: '{target}時点',
    average: '平均 {value}',
    cagrRange: 'CAGR（{from}→{to}）',
    cagrShort: 'CAGR {value}',
    cagrNeedsYears: 'CAGR を計算するには、行に年（例：2021、2025）が2つ以上必要です。',
    diffUp: '↑ {value}',
    diffDown: '↓ {value}',
    needTwoRows: '基準と比較先を比べるには、行が2つ以上必要です。',
    diffBetween: '{from} → {to} の差',
    needTwoPoints: '2つの時点を比べるには、行が2つ以上必要です。',
    pairNeedsBase: 'カテゴリごとの2期間の比較には、比較期間（例：前年）のデータが必要です。データ欄の「比較」の表に入れてください。',
    pairTotal: '合計',
    pairTotalUnit: '合計（{unit}）',
    pairGrowth: '市場の伸び率',
    pairDelta: '{name} の増減',
    pairDeltaUnit: '{name} の増減（{unit}）',
    bridgeNeeds: '1行目に始点、最後の行に終点、そのあいだに要因を1つ以上入れてください。',
    bridgeAdjust: 'その他 / 調整',
    bridgeNet: '{from} → {to}：{diff}（{rate}）',
    bridgeNetNoRate: '{from} → {to}：{diff}',
    posDrivers: '増加要因',
    negDrivers: '減少要因',
    noDrivers: 'なし',
    relNeeds: '2列目までに X と Y の数値を入れてください（3列目は大きさ）。',
    relCorr: '相関係数 r = {r}（{desc}）',
    relSize: 'バブルの大きさ＝{name}',
    median: '中央値 {value}',
    corrStrongPos: '強い正の関係', corrModPos: '中程度の正の関係', corrWeakPos: '弱い正の関係', corrNone: '明確な関係は弱い',
    corrWeakNeg: '弱い負の関係', corrModNeg: '中程度の負の関係', corrStrongNeg: '強い負の関係',
  },
  en: {
    periodYear: '{year}',
    mekkoNote: 'Width: {period} market size ({unit})   Height: {cols} mix',
    mixAxis: '{cols} mix',
    paren: '({text})',
    valueShare: '{value} ({pct})',
    cagr: 'CAGR',
    periodGrowth: 'growth',
    market: 'Market',
    total: 'Total',
    others: 'Other',
    colsFallback: 'segment',
    rowsFallback: 'Item',
    sum: 'Total',
    dataTitle: 'Source data (unit: {unit})',
    unitNote: 'Unit: {unit}',
    asOf: 'As of {target}',
    average: 'Average {value}',
    cagrRange: 'CAGR ({from}→{to})',
    cagrShort: 'CAGR {value}',
    cagrNeedsYears: 'CAGR needs at least two years in the rows (e.g. 2021, 2025).',
    diffUp: '↑ {value}',
    diffDown: '↓ {value}',
    needTwoRows: 'Needs at least two rows to compare a base and a comparison.',
    diffBetween: 'Change {from} → {to}',
    needTwoPoints: 'Needs at least two rows to compare two points.',
    pairNeedsBase: 'Comparing two periods by category needs the comparison-period data. Enter it in the “Comparison” table.',
    pairTotal: 'Total',
    pairTotalUnit: 'Total ({unit})',
    pairGrowth: 'Market growth',
    pairDelta: 'Change in {name}',
    pairDeltaUnit: 'Change in {name} ({unit})',
    bridgeNeeds: 'Put the start in the first row, the end in the last row, and at least one driver in between.',
    bridgeAdjust: 'Other / adjustment',
    bridgeNet: '{from} → {to}: {diff} ({rate})',
    bridgeNetNoRate: '{from} → {to}: {diff}',
    posDrivers: 'Positive drivers',
    negDrivers: 'Negative drivers',
    noDrivers: 'None',
    relNeeds: 'Put X and Y values in the first two columns (the third is size).',
    relCorr: 'Correlation r = {r} ({desc})',
    relSize: 'Bubble size = {name}',
    median: 'Median {value}',
    corrStrongPos: 'strong positive relationship', corrModPos: 'moderate positive relationship', corrWeakPos: 'weak positive relationship', corrNone: 'weak or unclear relationship',
    corrWeakNeg: 'weak negative relationship', corrModNeg: 'moderate negative relationship', corrStrongNeg: 'strong negative relationship',
  },
} satisfies Record<Locale, Record<string, string>>;

export type SlideTextKey = keyof (typeof SLIDE_TEXT)['ja'];

export function slideText(locale: Locale, key: SlideTextKey, vars: Record<string, string | number> = {}): string {
  const tpl = SLIDE_TEXT[locale][key];
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** 期間ラベルの表示。4桁の年なら「2025年」、それ以外はそのまま */
export function periodText(locale: Locale, label: string): string {
  return /^\d{4}$/.test(label) ? slideText(locale, 'periodYear', { year: label }) : label;
}

/** PPT 出力のフォント（言語ごとの既定。社内規定に合わせて変更できるようにする予定） */
export const SLIDE_FONTS: Record<Locale, string> = { ja: 'Meiryo', en: 'Arial' };
