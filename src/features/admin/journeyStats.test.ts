import { describe, expect, it } from 'vitest';
import type { JourneyRow } from '@/lib/repo/admin';
import { chartStats, crossUsers, frequencyByUser, groupFlows, groupMetrics, metricsOf, toCsv } from './journeyStats';

let id = 0;
const row = (anon: string, at: string, kind: string, payload: Record<string, unknown> = {}, o: Partial<JourneyRow> = {}): JourneyRow =>
  ({ id: ++id, anon_id: anon, occurred_at: at, session_id: 's1', kind, payload, occupation: 'planner', referral: 'x', joined_week: null, ...o });

const rows: JourneyRow[] = [
  row('a', '2026-10-10T01:00:00Z', 'consult', { text: '売上の説明' }),
  row('a', '2026-10-10T01:01:00Z', 'ev', { name: 'one_presentation_selected', detail: 'recommended:r01' }),
  row('a', '2026-10-10T01:02:00Z', 'chart_saved', { charts: ['waterfall'], complements: ['aligned_table'] }),
  row('a', '2026-10-11T01:00:00Z', 'export', { kind: 'ppt' }, { session_id: 's2' }),
  row('b', '2026-10-10T02:00:00Z', 'ev', { name: 'one_presentation_selected', detail: 'other:r02' }, { occupation: 'sales', referral: 'ai' }),
  row('b', '2026-10-10T02:01:00Z', 'chart_saved', { charts: ['mekko'], complements: [] }, { occupation: 'sales', referral: 'ai' }),
];

describe('利用の流れの集計', () => {
  it('人・セッションごとに流れをまとめ、時刻順に並べる', () => {
    const f = groupFlows(rows);
    expect(f).toHaveLength(3);
    expect(f[0]!.anon).toBe('a'); // 一番新しい開始（s2）
    const s1 = f.find((x) => x.key === 'a|s1')!;
    expect(s1.events.map((e) => e.kind)).toEqual(['consult', 'ev', 'chart_saved']);
  });
  it('指標を数える', () => {
    expect(metricsOf(rows)).toEqual({ users: 2, flows: 3, consults: 1, saves: 2, exports: 1, pickedRecommended: 1, picked: 2 });
  });
  it('職種・きっかけごとに分ける', () => {
    const g = groupMetrics(rows, (r) => r.occupation ?? 'unknown');
    expect(g.map((x) => [x.key, x.metrics.users])).toEqual([['planner', 1], ['sales', 1]]);
    const c = crossUsers(rows, (r) => r.occupation ?? '-', (r) => r.referral ?? '-');
    expect(c.n['planner|x']).toBe(1); expect(c.n['sales|ai']).toBe(1);
  });
  it('使用頻度は記録のある日数（日本時間）で分ける', () => {
    const f = frequencyByUser(rows);
    expect(f.get('a')).toBe('d2_3'); expect(f.get('b')).toBe('d1');
  });
  it('チャートの種類と補完情報の使用率', () => {
    const s = chartStats(rows);
    expect(s).toMatchObject({ saves: 2, withComplement: 1 });
    expect(s.charts).toEqual(expect.arrayContaining([['waterfall', 1], ['mekko', 1]]));
  });
  it('CSV は引用符を二重にする', () => {
    expect(toCsv([row('a', '2026-10-10T01:00:00Z', 'consult', { text: 'a"b' })])).toContain('""text""');
  });
});
