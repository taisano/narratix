import type { JourneyRow } from '@/lib/repo/admin';

/** 利用の流れの集計（管理画面）。ブラウザの中で、取得した記録から数える（ベータ規模）。 */
export interface Flow {
  key: string;
  anon: string;
  start: string;
  end: string;
  occupation: string | null;
  referral: string | null;
  events: JourneyRow[];
}

/** 同じ人（anon_id）の同じ画面セッションを1つの「流れ」にまとめる。新しい流れが先 */
export function groupFlows(rows: JourneyRow[]): Flow[] {
  const map = new Map<string, Flow>();
  for (const r of [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id)) {
    const key = `${r.anon_id}|${r.session_id ?? '-'}`;
    const f = map.get(key) ?? { key, anon: r.anon_id, start: r.occurred_at, end: r.occurred_at, occupation: r.occupation, referral: r.referral, events: [] };
    f.events.push(r); f.end = r.occurred_at;
    f.occupation ??= r.occupation; f.referral ??= r.referral;
    map.set(key, f);
  }
  return [...map.values()].sort((a, b) => b.start.localeCompare(a.start));
}

export interface Metrics {
  users: number; flows: number; consults: number; saves: number; exports: number;
  /** 提案から1つ選んだ回数のうち、おすすめを選んだ回数 */
  pickedRecommended: number; picked: number;
}

const evName = (r: JourneyRow) => (r.kind === 'ev' ? String(r.payload.name ?? '') : '');

export function metricsOf(rows: JourneyRow[]): Metrics {
  const users = new Set<string>(); const flows = new Set<string>();
  const m: Metrics = { users: 0, flows: 0, consults: 0, saves: 0, exports: 0, pickedRecommended: 0, picked: 0 };
  for (const r of rows) {
    users.add(r.anon_id); flows.add(`${r.anon_id}|${r.session_id ?? '-'}`);
    if (r.kind === 'consult') m.consults++;
    else if (r.kind === 'chart_saved') m.saves++;
    else if (r.kind === 'export') m.exports++;
    else if (evName(r) === 'one_presentation_selected') { m.picked++; if (String(r.payload.detail ?? '').includes('recommended')) m.pickedRecommended++; }
  }
  m.users = users.size; m.flows = flows.size;
  return m;
}

/** 人ごとの使用頻度：記録のある日の数（日本時間の日付） */
export type FreqBucket = 'd1' | 'd2_3' | 'd4';
const jstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export function frequencyByUser(rows: JourneyRow[]): Map<string, FreqBucket> {
  const days = new Map<string, Set<string>>();
  for (const r of rows) { const s = days.get(r.anon_id) ?? new Set<string>(); s.add(jstDay(r.occurred_at)); days.set(r.anon_id, s); }
  return new Map([...days].map(([u, s]) => [u, s.size >= 4 ? 'd4' : s.size >= 2 ? 'd2_3' : 'd1'] as [string, FreqBucket]));
}

export interface GroupRow { key: string; metrics: Metrics }
/** 属性（職種・きっかけ・頻度）ごとの指標。人数の多い順 */
export function groupMetrics(rows: JourneyRow[], keyOf: (r: JourneyRow) => string): GroupRow[] {
  const by = new Map<string, JourneyRow[]>();
  for (const r of rows) { const k = keyOf(r); by.set(k, [...(by.get(k) ?? []), r]); }
  return [...by].map(([key, rs]) => ({ key, metrics: metricsOf(rs) })).sort((a, b) => b.metrics.users - a.metrics.users || a.key.localeCompare(b.key));
}

/** 職種×きっかけの人数（同じ人は1回） */
export function crossUsers(rows: JourneyRow[], rowKey: (r: JourneyRow) => string, colKey: (r: JourneyRow) => string): { rows: string[]; cols: string[]; n: Record<string, number> } {
  const seen = new Map<string, Set<string>>();
  const rs = new Set<string>(); const cs = new Set<string>();
  for (const r of rows) {
    const a = rowKey(r); const b = colKey(r); rs.add(a); cs.add(b);
    const k = `${a}|${b}`; const s = seen.get(k) ?? new Set<string>(); s.add(r.anon_id); seen.set(k, s);
  }
  return { rows: [...rs].sort(), cols: [...cs].sort(), n: Object.fromEntries([...seen].map(([k, s]) => [k, s.size])) };
}

/** 保存されたチャートの種類・補完情報の数え上げ */
export function chartStats(rows: JourneyRow[]): { charts: [string, number][]; complements: [string, number][]; saves: number; withComplement: number } {
  const charts = new Map<string, number>(); const comps = new Map<string, number>();
  let saves = 0; let withComplement = 0;
  for (const r of rows) {
    if (r.kind !== 'chart_saved') continue;
    saves++;
    for (const c of (r.payload.charts as string[] | undefined) ?? []) charts.set(c, (charts.get(c) ?? 0) + 1);
    const cs = (r.payload.complements as string[] | undefined) ?? [];
    if (cs.length) withComplement++;
    for (const c of cs) comps.set(c, (comps.get(c) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return { charts: top(charts), complements: top(comps), saves, withComplement };
}

/** 分析用に持ち出す CSV（記録そのまま。user_id は元々ない） */
export function toCsv(rows: JourneyRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['occurred_at', 'anon_id', 'session_id', 'kind', 'occupation', 'referral', 'joined_week', 'payload'];
  return [head.join(','), ...rows.map((r) => [r.occurred_at, r.anon_id, r.session_id, r.kind, r.occupation, r.referral, r.joined_week, JSON.stringify(r.payload)].map(esc).join(','))].join('\n');
}
