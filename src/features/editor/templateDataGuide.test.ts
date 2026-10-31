import { describe, expect, it } from 'vitest';
import { copyOfLibrary } from '@/lib/repo/library';
import { datasetKey, newProject } from './project';
import type { LibraryItem } from '@/lib/repo/library';

describe('テンプレートを複製した直後の案内', () => {
  const item = (): LibraryItem => ({ id: 'l1', title: '見本', description: '', tags: [], project: newProject('ja'), published: true, sort: 0, updatedAt: '2026-10-31T00:00:00Z' });
  it('複製した時の表の指紋を origin に持ち、同じ表なら一致する', () => {
    const p = copyOfLibrary(item());
    expect(p.origin?.dataKey).toBe(datasetKey(p.dataset));
  });
  it('数字や名前を変えると指紋が変わる（自分のデータに替わった印）', () => {
    const p = copyOfLibrary(item());
    const d = structuredClone(p.dataset);
    d.periods.current.values[0]![0] = 123456789;
    expect(datasetKey(d)).not.toBe(p.origin?.dataKey);
    const e = structuredClone(p.dataset);
    e.cols[0] = '別の名前';
    expect(datasetKey(e)).not.toBe(p.origin?.dataKey);
  });
});
