import { describe, expect, it } from 'vitest';
import { newProject, ownDataRef, viewOf, validateProject, type ProjectState } from './project';
import { combineSlides, type SetPick } from './slideSet';

const withTitle = (p: ProjectState, title: string, num: number): ProjectState => {
  const q = structuredClone(p);
  q.slides[0]!.title = title;
  q.dataset.periods.current.values[0]![0] = num;
  q.source = `出典：${title}`;
  return q;
};
const pick = (id: string, p: ProjectState, index = 0): SetPick => ({ sourceId: id, sourceLabel: `元${id}`, project: p, index });

describe('スライドセット：選んだスライドを1つのプロジェクトにまとめる', () => {
  const a = withTitle(newProject('ja'), 'A のスライド', 111);
  const b = withTitle(newProject('ja'), 'B のスライド', 222);

  it('1枚目の元のデータは共通のまま、ほかの元は「このスライドだけのデータ」で持つ（混ざらない）', () => {
    const r = combineSlides([pick('a', a), pick('b', b)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.project;
    expect(p.slides.map((s) => s.title)).toEqual(['A のスライド', 'B のスライド']);
    expect(p.slides[0]!.dataRef).toBeUndefined();
    expect(p.dataset.periods.current.values[0]![0]).toBe(111);
    expect(ownDataRef(p, p.slides[1]!)).toBeTruthy();
    expect(viewOf(p, 1).dataset.periods.current.values[0]![0]).toBe(222);
    expect(viewOf(p, 1).source).toBe('出典：B のスライド');
    expect(viewOf(p, 0).source).toBe('出典：A のスライド');
    expect(validateProject(p).ok).toBe(true);
  });
  it('元のチャートは変わらない。スライド id は新しくなる', () => {
    const before = JSON.stringify(b);
    const r = combineSlides([pick('b', b), pick('a', a)]);
    expect(JSON.stringify(b)).toBe(before);
    if (r.ok) expect(r.project.slides[0]!.id).not.toBe(b.slides[0]!.id);
  });
  it('同じ元から複数枚選ぶと、データは1つを共有する。並べ替えた順になる', () => {
    const two = combineSlides([pick('a', a), pick('b', b), pick('b', b), pick('a', a)]);
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const refs = two.project.slides.map((s) => s.dataRef);
    expect(refs[0]).toBeUndefined();
    expect(refs[1]).toBe(refs[2]);
    expect(refs[3]).toBeUndefined();
    expect(Object.keys(two.project.extra ?? {})).toHaveLength(1);
  });
  it('言語が違う元は一緒にできない。何も選んでいなければ空', () => {
    expect(combineSlides([pick('a', a), pick('e', newProject('en'))])).toEqual({ ok: false, reason: 'locale_mismatch' });
    expect(combineSlides([])).toEqual({ ok: false, reason: 'empty' });
  });
  it('元の「複製元」「推薦」「下書き」は引き継がない', () => {
    const o: ProjectState = { ...a, origin: { kind: 'library', id: 'x', title: 't' } };
    const r = combineSlides([pick('o', o)]);
    expect(r.ok && r.project.origin).toBeFalsy();
  });
});
