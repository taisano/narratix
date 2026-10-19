import { describe, expect, it } from 'vitest';
import { checkPaste } from '@/features/editor/dataCheck';
import { parsePeriod, periodKindOf } from './periods';
import { profileTable, TableTooLarge } from './profile';
import { isSafeHeader, valueKindOfHeader } from './vocab';
import * as F from './fixtures';

describe('T-PROFILE：列の特徴', () => {
  it('7か国型：型と単位（%・€・pp）を判定する', () => {
    const { profile } = F.load(F.SEVEN_TSV);
    const by = Object.fromEntries(profile.columns.map((c) => [c.header, c]));
    expect(by['Country']).toMatchObject({ kind: 'text', isRowNames: true, distinctClass: 'unique' });
    expect(by['CY Value Share']).toMatchObject({ kind: 'percent', unit: '%' });
    expect(by['vs LY (pp)']).toMatchObject({ kind: 'percent', unit: 'pp' });
    expect(by['CY ASP']).toMatchObject({ kind: 'currency', unit: '€' });
    expect(by['CY Weighted Dist.']).toMatchObject({ kind: 'number' });
    expect(by['Primary Indicator']).toMatchObject({ kind: 'text', distinctClass: 'few' });
    expect(profile.rowCount).toBe(7);
  });
  it('縦持ちの時系列：月の列は期間（month）、商品は文字、実績・予算は数値', () => {
    const { profile } = F.load(F.LONG_TSV);
    expect(profile.columns[0]).toMatchObject({ isTimeLike: true, periodKind: 'month', kind: 'date' });
    expect(profile.columns[1]!.kind).toBe('text');
    expect(profile.columns[2]!.kind).toBe('number');
    expect(profile.timeAcrossColumns).toBeNull();
  });
  it('列見出しが期間の表（横持ちの期間）を判定する', () => {
    const { profile } = F.load(F.PERIOD_ACROSS_TSV);
    expect(profile.timeAcrossColumns).toEqual({ cols: [1, 2, 3], periodKind: 'month' });
  });
  it('欠損の有無・欧州表記などは既存の dataCheck と同じ読み方', () => {
    const { profile } = F.load('国\t売上\nA\t1\nB\t-\nC\t3');
    expect(profile.columns[1]!.hasMissing).toBe(true);
    expect(F.load('国\t売上\nA\t1\nB\t2').profile.columns[1]!.hasMissing).toBe(false);
  });
  it('全角の数字・％・マイナスを数として読む', () => {
    const { profile } = F.load('国\t比率\nA\t１２．５％\nB\t－３．０％\nC\t４．０％');
    expect(profile.columns[1]).toMatchObject({ kind: 'percent', unit: '%' });
  });
  it('上限（2000行・200列）を超えると拒否する', () => {
    const rows = ['国\t売上', ...Array.from({ length: 2001 }, (_, i) => `n${i}\t${i}`)].join('\n');
    const r = checkPaste(rows);
    if (r.table) expect(() => profileTable(r.table!)).toThrow(TableTooLarge);
    else expect(r.issues.some((i) => i.level === 'error')).toBe(true);
  });
  it('プロファイルに、セルの値（項目名）は列の見出しを除いて入らない', () => {
    const { profile } = F.load(F.SEVEN_TSV);
    const text = JSON.stringify(profile);
    for (const name of ['ZZ_ALAND', 'ZZ_BORDURIA', 'ZZ_GENOVIA']) expect(text).not.toContain(name);
  });
});

describe('期間の読み取り', () => {
  const cases: [string, string | null][] = [
    ['2025', 'year'], ['２０２５', 'year'], ['FY2025', 'fiscalYear'], ['FY25', 'fiscalYear'], ['2025年度', 'fiscalYear'],
    ['2025年3月', 'month'], ['２０２５年３月', 'month'], ['3月', 'month'], ['Jan-25', 'month'], ['2025-03', 'month'], ['March 2025', 'month'],
    ['Q1', 'quarter'], ['2025Q2', 'quarter'], ['2025年第3四半期', 'quarter'], ['2025/3/1', 'date'], ['2025年3月1日', 'date'],
    ['ZZ_ALAND', null], ['売上', null], ['', null],
  ];
  for (const [raw, kind] of cases) it(`${JSON.stringify(raw)} → ${kind}`, () => expect(parsePeriod(raw)).toBe(kind));
  it('混在は unknown、割合未満は null', () => {
    expect(periodKindOf(['2025年1月', 'Q2'])).toBe('unknown');
    expect(periodKindOf(['2025年1月', '合計', '商品', '商品'])).toBeNull();
  });
  it('日本語と英語の見出しで、横持ちの期間を同じに判定する', () => {
    expect(F.load('Item\tJan-25\tFeb-25\tMar-25\nX\t1\t2\t3\nY\t4\t5\t6').profile.timeAcrossColumns?.periodKind).toBe('month');
    expect(F.load('商品\t2025年度\t2026年度\nX\t1\t2\nY\t3\t4').profile.timeAcrossColumns?.periodKind).toBe('fiscalYear');
  });
});

describe('見出しの語彙（項目名を送らないための判定）', () => {
  it('指標名・修飾語・軸の名前は安全', () => {
    for (const h of ['売上', '利益率', '前年差', 'CY Value Share', 'vs LY (pp)', 'CY ASP', 'Country', '月', '予算', 'Weighted Dist.', '実績（百万円）']) expect(isSafeHeader(h), h).toBe(true);
  });
  it('国名・商品名・顧客名・会社名は安全ではない', () => {
    for (const h of ['日本', '米国', '顧客A', 'Netherlands', 'Italy', 'Germany', 'Poland', 'ZZ_RIVAL CY Share', 'Acme Corp', 'ZZ_PRODUCT_ALPHA', '株式会社テスト']) expect(isSafeHeader(h), h).toBe(false);
  });
  it('値の意味：pp は deltaPoint、前年比は growthRate、vs LY（%）は率、数値の差は deltaAbsolute', () => {
    expect(valueKindOfHeader('vs LY (pp)', 'percent')).toEqual({ valueKind: 'deltaPoint', unit: 'pp' });
    expect(valueKindOfHeader('前年比', 'percent')).toEqual({ valueKind: 'growthRate', unit: '%' });
    expect(valueKindOfHeader('ASP vs LY', 'percent')).toEqual({ valueKind: 'growthRate', unit: '%' });
    expect(valueKindOfHeader('シェア前年差', 'percent')).toEqual({ valueKind: 'deltaPoint', unit: 'pp' });
    expect(valueKindOfHeader('予算差', 'number')).toEqual({ valueKind: 'deltaAbsolute' });
    expect(valueKindOfHeader('売上', 'number')).toEqual({ valueKind: 'level' });
  });
});
