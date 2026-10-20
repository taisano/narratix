import { describe, expect, it } from 'vitest';
import { analyzeTable, resolveRoles } from './session';
import { draftWarnings } from './warnings';

const run = (tsv: string) => {
  const a = analyzeTable(tsv); if (!a.ok) throw new Error('unreadable');
  const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error('manual');
  return draftWarnings(a.check, r.map, a.profile);
};

describe('作る前の指摘', () => {
  it('合計の行は含めていないと知らせる（note）', () => {
    const w = run('店\t売上\nZZ_A\t10\nZZ_B\t20\nZZ_C\t30\n合計\t60');
    expect(w.map((x) => x.key)).toContain('draft.warn.totalRows');
    expect(w.find((x) => x.key === 'draft.warn.totalRows')!.level).toBe('note');
  });
  it('項目が2つしかない表は要確認（warn）で、先に出る', () => {
    const w = run('店\t売上\nZZ_A\t10\nZZ_B\t20');
    expect(w[0]).toMatchObject({ key: 'draft.warn.fewItems', level: 'warn' });
  });
  it('数値として読めないセルは要確認', () => {
    const w = run(['店\t売上', ...Array.from({ length: 9 }, (_, i) => `ZZ_${i}\t${10 + i}`), 'ZZ_X\t約20'].join('\n'));
    expect(w.some((x) => x.level === 'warn')).toBe(true);
  });
  it('問題のない表は指摘なし', () => {
    expect(run('店\t売上\nZZ_A\t10\nZZ_B\t20\nZZ_C\t30\nZZ_D\t40')).toEqual([]);
  });
  it('水準の指標が2つ以上ある時、主にした指標を知らせる', () => {
    const w = run('店\t客単価\t粗利率\nZZ_A\t1200\t10\nZZ_B\t900\t12\nZZ_C\t640\t8\nZZ_D\t700\t9');
    expect(w.map((x) => x.key)).toContain('draft.warn.primaryGuess');
  });
});
