import { describe, expect, it } from 'vitest';
import { deleteMany } from './edit';
import { initialState, sampleFor } from './state';

describe('行・列をまとめて削除', () => {
  it('選んだ行・列を一度に消す。行・列はそれぞれ2つは残す', () => {
    const s = { ...initialState('ja'), ...sampleFor('trend', 'ja') };
    const d = s.dataset;
    const r = deleteMany(s, [0], [0, 1]);
    expect(r.dataset.cols).toEqual(d.cols.slice(2));
    expect(r.dataset.rows).toEqual(d.rows.slice(1));
    expect(r.dataset.periods.current.values[0]).toEqual(d.periods.current.values[1]!.slice(2));
    const all = deleteMany(s, d.rows.map((_, i) => i), d.cols.map((_, k) => k));
    expect(all.dataset.rows.length).toBe(2);
    expect(all.dataset.cols.length).toBe(2);
  });
});
