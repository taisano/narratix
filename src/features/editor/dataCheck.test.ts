import { describe, expect, it } from 'vitest';
import { checkPaste, DEFAULT_OPTIONS, readCell } from './dataCheck';
import { DIRTY_CASES } from './__fixtures__/dirty-data';
import { parseNumber } from './edit';

describe('汚れた実データ（30 セット）', () => {
  for (const c of DIRTY_CASES) {
    it(`${c.group}：${c.name}`, () => {
      const r = checkPaste(c.text);
      const codes = r.issues.map((i) => i.code);
      const e = c.expect;
      if (e.error) {
        expect(r.issues.some((i) => i.level === 'error')).toBe(true);
      } else {
        expect(r.table).not.toBeNull();
        expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
      }
      if (e.rows) expect(r.table!.rows).toEqual(e.rows);
      if (e.cols) expect(r.table!.cols).toEqual(e.cols);
      if (e.values) expect(r.table!.values).toEqual(e.values);
      if (e.unit !== undefined) expect(r.summary.unit).toBe(e.unit);
      if (e.codes?.length === 0) expect(codes.filter((x) => x !== 'unitRead')).toEqual([]);
      for (const x of e.codes ?? []) expect(codes, x).toContain(x);
      for (const x of e.not ?? []) expect(codes, x).not.toContain(x);
    });
  }

  it('黙って空欄にしない：表の空欄は「元が空」か、診断で伝えたものだけ', () => {
    for (const c of DIRTY_CASES) {
      const r = checkPaste(c.text);
      if (!r.table) continue;
      const told = r.issues.filter((i) => ['unreadable', 'excelErrors', 'missing'].includes(i.code)).reduce((a, i) => a + Number(i.vars?.n ?? 0), 0);
      const emptyRaw = r.table.raw.flat().filter((v) => v.trim() === '').length;
      expect(r.summary.blanks, c.name).toBe(told + emptyRaw);
    }
  });

  it('文字を 0 にしない', () => {
    expect(readCell('約100').value).toBeNull();
    expect(parseNumber('未定')).toBeNull();
    expect(checkPaste('a\tb\nx\tabc\ny\t1').table!.values[0]).toEqual([null]);
  });

  it('選んだ読み方で表が変わる（合計を残す・% をそのまま・欧州式で読む）', () => {
    const tot = checkPaste('地域\t売上\n北米\t100\n合計\t100', { ...DEFAULT_OPTIONS, dropTotals: false });
    expect(tot.table!.rows).toEqual(['北米', '合計']);
    // 小数を % にする時、計算の誤差（55.00000000000001）を残さない
    expect(checkPaste('p\ts\nA\t60%\nB\t0.55').table!.values).toEqual([[60], [55]]);
    const pct = checkPaste('p\ts\nA\t12%\nB\t0.15', { ...DEFAULT_OPTIONS, percentFix: false });
    expect(pct.table!.values).toEqual([[12], [0.15]]);
    const eu = checkPaste('x\ta\tb\nA\t1.234,5\t2.000\nB\t3,5\t4', { ...DEFAULT_OPTIONS, european: true });
    expect(eu.table!.values).toEqual([[1234.5, 2000], [3.5, 4]]);
    expect(eu.issues.map((i) => i.code)).not.toContain('unreadable');
  });

  it('問題のセルを A1 の位置で示す（貼った表の位置）', () => {
    const r = checkPaste('地域\t2024\t2025\n北米\t100\tabc\n欧州\t#DIV/0!\t5');
    expect(r.issues.find((i) => i.code === 'unreadable')!.cells).toEqual(['C2']);
    expect(r.issues.find((i) => i.code === 'excelErrors')!.cells).toEqual(['B3']);
  });
});
