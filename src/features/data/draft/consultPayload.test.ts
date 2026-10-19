import { describe, expect, it } from 'vitest';
import { buildConsultPayload, ConsultPayloadSchema } from './consultPayload';
import * as F from './fixtures';

const ALL = [F.LONG_TSV, F.WIDE_TSV, F.SEVEN_TSV, F.PERIOD_ACROSS_TSV, F.ONE_METRIC_TSV, F.ACTUAL_BUDGET_TSV];
const payloadOf = (tsv: string, q = '何が伸びたか') => buildConsultPayload(q, F.load(tsv).profile);

describe('T-PRIV：AI へ送る最終 payload', () => {
  it('どの固定データでも、目印の項目名・セルの値が payload に含まれない', () => {
    for (const tsv of ALL) {
      const json = JSON.stringify(payloadOf(tsv));
      for (const s of F.SENTINELS) expect(json, s).not.toContain(s);
    }
  });
  it('セルの値（数値・金額・文字）が含まれない。先頭の行も送らない', () => {
    const json = JSON.stringify(payloadOf(F.SEVEN_TSV));
    for (const cell of ['21.2%', '32.8%', '€89', '€128', '37.9', 'Price-led', 'Volume / mix-led', 'Mixed / portfolio']) expect(json, cell).not.toContain(cell);
    const wide = JSON.stringify(payloadOf(F.WIDE_TSV));
    for (const cell of ['2025年1月', '120', '340', '210']) expect(wide, cell).not.toContain(cell);
  });
  it('横持ち表：国・顧客の見出しは series_N に匿名化され、「同じ種類の系列が4列」という構造だけが送られる', () => {
    const p = payloadOf(F.WIDE_TSV);
    expect(p.columns.map((c) => c.name)).toEqual(['月', 'series_1', 'series_2', 'series_3', 'series_4']);
    expect(p.seriesGroups).toEqual([{ prefix: 'series', count: 4 }]);
    expect(p.columns.filter((c) => c.name.startsWith('series')).every((c) => c.nameKind === 'anonymous')).toBe(true);
  });
  it('指標名の見出し（売上・利益率・前年差・CY ASP など）はそのまま送る', () => {
    const p = payloadOf(F.SEVEN_TSV);
    expect(p.columns.filter((c) => c.nameKind === 'metric').map((c) => c.name)).toEqual(['Country', 'CY Value Share', 'vs LY (pp)', 'CY ASP', 'ASP vs LY', 'CY Weighted Dist.', 'Primary Indicator']);
  });
  it('指標名か項目名か判断できない見出し（会社名入り）は送らず匿名化する', () => {
    const p = payloadOf(F.SEVEN_TSV);
    expect(p.columns.slice(7).map((c) => c.name)).toEqual(['col_1', 'col_2']);
    expect(JSON.stringify(p)).not.toContain('ZZ_RIVAL');
  });
  it('列見出しが期間の表：期間の見出しの原文は送らず、期間の種類と数だけ', () => {
    const p = payloadOf(F.PERIOD_ACROSS_TSV);
    expect(p.timeAcrossColumns).toEqual({ periodKind: 'month', count: 3 });
    expect(p.columns.slice(1).map((c) => c.name)).toEqual(['period_1', 'period_2', 'period_3']);
    expect(JSON.stringify(p)).not.toContain('2025年');
  });
  it('許可リスト：未知のキーが紛れると例外になる（strict）', () => {
    const p = payloadOf(F.ONE_METRIC_TSV);
    expect(() => ConsultPayloadSchema.parse({ ...p, rows: [['a', 1]] })).toThrow();
    expect(() => ConsultPayloadSchema.parse({ ...p, columns: [{ ...p.columns[0]!, sample: 'ZZ_ALAND' }] })).toThrow();
  });
  it('payload のキーは許可された集合だけ', () => {
    const p = payloadOf(F.SEVEN_TSV);
    expect(Object.keys(p).sort()).toEqual(['colCount', 'columns', 'question', 'rowCount', 'seriesGroups', 'timeAcrossColumns']);
    for (const c of p.columns) expect(Object.keys(c).every((k) => ['col', 'name', 'nameKind', 'kind', 'unit', 'hasMissing', 'distinct', 'isTimeLike', 'periodKind', 'isRowNames'].includes(k))).toBe(true);
  });
  it('数値だけの見出し（見出し行の誤判定）は、値として送られない', () => {
    const p = buildConsultPayload('q', F.load('国\t1234567\t8675309\nZZ_A\t10\t20\nZZ_B\t30\t40').profile);
    expect(JSON.stringify(p)).not.toMatch(/1234567|8675309/);
  });
  it('質問の文章は送る（ユーザー自身の入力）。長すぎるものは切る', () => {
    expect(payloadOf(F.ONE_METRIC_TSV, '日本の売上は?').question).toBe('日本の売上は?');
    expect(payloadOf(F.ONE_METRIC_TSV, 'a'.repeat(5000)).question.length).toBe(2000);
  });
  it('件数と構造：行数・列数・欠損の有無・期間列の有無が入る', () => {
    const p = payloadOf('月\t売上\n2025年1月\t1\n2025年2月\t-\n2025年3月\t3');
    expect(p).toMatchObject({ rowCount: 3, colCount: 2 });
    expect(p.columns[0]).toMatchObject({ isTimeLike: true, periodKind: 'month' });
    expect(p.columns[1]!.hasMissing).toBe(true);
  });
  it('同じ入力は同じ payload（決定的）', () => {
    expect(payloadOf(F.WIDE_TSV)).toEqual(payloadOf(F.WIDE_TSV));
  });
});
