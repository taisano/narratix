import { describe, expect, it } from 'vitest';
import { emptyDataPackPlan, normalizeDataPackPlan, overviewIncludes, type StoryDataPackPlan } from './dataPackPlan';

const ids = new Set(['q1', 'q2']);
const plan: StoryDataPackPlan = {
  version: 1,
  overview: { titleOverride: '依頼', backgroundOverride: '背景', include: { consultation: true, rules: false } },
  requests: [{
    id: 'r1', label: '売上実績', role: '全体の変化', importance: 'required', origin: 'coach', questionRefs: ['q1', 'q2'], grain: ['地域', '年'],
    fields: [
      { id: 'item', label: '地域', description: '', kind: 'dimension', valueType: 'text', example: '北米', required: true, origin: 'coach' },
      { id: 'u2', label: '担当者', description: '入力者名', kind: 'dimension', valueType: 'text', required: false, origin: 'user' },
      { id: 'value', label: '売上', description: '', kind: 'measure', valueType: 'number', unit: '百万円', required: true, origin: 'coach' },
    ],
    sharedKeys: ['item'], datasetId: 'd1',
  }],
};

describe('データパックの計画を読む', () => {
  it('保存したものをそのまま読み戻せる（出どころは Dataset と項目の両方に残る）', () => {
    const back = normalizeDataPackPlan(JSON.parse(JSON.stringify(plan)), ids);
    expect(back).toEqual(plan);
    expect(back!.requests[0]!.fields.map((x) => x.origin)).toEqual(['coach', 'user', 'coach']);
  });
  it('無い・古い・版が違うものは undefined（古い Story はそのまま開ける）', () => {
    expect(normalizeDataPackPlan(undefined, ids)).toBeUndefined();
    expect(normalizeDataPackPlan(null, ids)).toBeUndefined();
    expect(normalizeDataPackPlan({ version: 2, requests: [] }, ids)).toBeUndefined();
  });
  it('壊れた値は外すか既定に戻し、読めるところは読む', () => {
    const back = normalizeDataPackPlan({
      version: 1,
      overview: { titleOverride: 3, include: { consultation: 'yes', background: false, nope: true } },
      requests: [
        { id: 'a', label: '  A  ', importance: 'custom', origin: 'x', questionRefs: ['q1', 'gone', 3], grain: ['年', '年', ''], sharedKeys: ['f', 'zzz'],
          fields: [
            { id: 'f', label: ' 年 ', kind: 'dimension', valueType: 'xxx', required: 1 },
            { id: 'f', label: '値', kind: 'measure', example: '123' },
            { id: 'e', label: '   ' },
            'bad',
          ] },
        { id: 'a', label: '', fields: [] },
        'bad',
        { label: 'ID無し', fields: [{ label: 'x', kind: 'weird' }] },
      ],
    }, ids)!;
    expect(back.overview).toEqual({ include: { background: false } });
    expect(back.requests).toHaveLength(2);
    const [a, b] = back.requests;
    expect(a).toMatchObject({ id: 'a', label: 'A', importance: 'recommended', origin: 'user', questionRefs: ['q1'], grain: ['年'], sharedKeys: ['f'] });
    expect(b!.id).not.toBe('a');
    // 項目の id の重複は振り直し、空の名前の項目は外す。数値の項目に入力例は置かない
    expect(new Set(a!.fields.map((x) => x.id)).size).toBe(2);
    expect(a!.fields.map((x) => x.label)).toEqual(['年', '値']);
    expect(a!.fields[0]).toMatchObject({ valueType: 'text', required: false, origin: 'user' });
    expect(a!.fields[1]!.example).toBeUndefined();
    expect(b!.fields[0]).toMatchObject({ kind: 'measure', valueType: 'number' });
  });
  it('件数と長さの上限を守る', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, label: `依頼${i}`, fields: Array.from({ length: 50 }, (_, j) => ({ id: `f${j}`, label: `項目${j}` })) }));
    const back = normalizeDataPackPlan({ version: 1, requests: many }, ids)!;
    expect(back.requests).toHaveLength(8);
    expect(back.requests[0]!.fields).toHaveLength(30);
    expect(normalizeDataPackPlan({ version: 1, requests: [{ label: 'x'.repeat(500), fields: [] }] }, ids)!.requests[0]!.label).toHaveLength(100);
  });
  it('存在しなくなった Question への参照は外すが、依頼は残す', () => {
    const back = normalizeDataPackPlan(JSON.parse(JSON.stringify(plan)), new Set(['q2']))!;
    expect(back.requests[0]!.questionRefs).toEqual(['q2']);
    expect(normalizeDataPackPlan(JSON.parse(JSON.stringify(plan)), new Set())!.requests).toHaveLength(1);
  });
  it('Overview の公開の既定：元の相談文だけ非公開、ほかは公開。指定があればそれに従う', () => {
    const base = emptyDataPackPlan();
    expect(overviewIncludes(base, 'consultation')).toBe(false);
    for (const s of ['background', 'purpose', 'questions', 'datasets', 'rules'] as const) expect(overviewIncludes(base, s)).toBe(true);
    expect(overviewIncludes(plan, 'consultation')).toBe(true);
    expect(overviewIncludes(plan, 'rules')).toBe(false);
  });
});
