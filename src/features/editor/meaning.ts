import { isRateName } from '@/engine/layout/charts/combo-config';
import { isTimeAxis, timeRange } from '@/engine/transform/cagr';
import { registry, type ChartTypeId } from '@/registry';
import { activeComplements, isSwapped, toDataset, viewAxes, type BuilderState } from './state';

/**
 * チャートの意味の品質チェック（docs/decisions.md「意味の整合性」）。
 * 数が読めても、その組み合わせにビジネス上・数学上の意味があるとは限らない。
 * 例：売上（億円）と粗利率（%）を Mekko で合算する、円とドルを同じ軸に並べる、CAGR の始点が 0。
 * 決まった規則だけ（AI は使わない）。直し方（別のチャート・列を外す・単位を変える）も返す
 */

// ──────────── 指標の種類 ────────────

export type MetricKind = 'amount' | 'rate' | 'count' | 'people' | 'time' | 'index' | 'unknown';
export type Currency = 'JPY' | 'USD' | 'EUR' | 'CNY' | 'GBP';

export interface Metric { name: string; kind: MetricKind; currency?: Currency; unit?: string }

export const CURRENCY: [RegExp, Currency][] = [
  [/円|¥|JPY/i, 'JPY'], [/ドル|\$|USD/i, 'USD'], [/ユーロ|€|EUR/i, 'EUR'], [/人民元|CNY|RMB|(?<![a-z])元/i, 'CNY'], [/ポンド|£|GBP/i, 'GBP'],
];
// 名前で見る言葉（1文字の「人」「本」などは「日本」「名古屋」と紛れるので、名前では使わない）
const COUNT = /件数|台数|個数|店舗数|回数|社数|本数|契約数|数量|出荷数|販売数|units?\b|count|orders?\b|stores?\b/i;
const PEOPLE = /人数|社員|従業員|会員|ユーザー|顧客数|来場者|訪問者|visitors?|users?\b|employees?|headcount|people|customers?\b/i;
const TIME = /時間|日数|所要|hours?\b|days?\b|minutes?\b|lead ?time/i;
const INDEX = /指数|index|スコア|score|点数|満足度|NPS/i;
// 単位（括弧の中・値の後ろ）で見る記号
const UNIT_COUNT = /^(件|台|個|回|店|社|本|枚|箇所|契約)$/;
const UNIT_PEOPLE = /^(人|名|千人|万人)$/;
const UNIT_TIME = /^(時間|日|分|秒|h|hrs?|days?)$/i;
const AMOUNT = /売上|売上高|収益|利益|費用|コスト|原価|金額|予算|実績|市場規模|投資|価格|revenue|sales|profit|cost|spend|budget|amount|price|value|gmv|ebitda/i;

/** 名前（と表の単位）から指標の種類を決める。率は「率・%・シェア・margin」など（縦棒＋折れ線と同じ判定） */
export function metricOf(name: string, tableUnit?: string): Metric {
  const inParen = /[（(]([^）)]+)[）)]\s*$/.exec(name)?.[1];
  const unit = inParen ?? undefined;
  const cur = CURRENCY.find(([re]) => re.test(unit ?? '') || re.test(name))?.[1];
  if (isRateName(name) || /%|％|pt\b|ポイント差/.test(unit ?? '')) return { name, kind: 'rate', unit };
  if (cur) return { name, kind: 'amount', currency: cur, unit };
  const u = (unit ?? '').trim();
  if (UNIT_PEOPLE.test(u) || PEOPLE.test(name)) return { name, kind: 'people', unit };
  if (UNIT_TIME.test(u) || (TIME.test(name) && !AMOUNT.test(name))) return { name, kind: 'time', unit };
  if (INDEX.test(name) || /^(pt|点|ポイント)$/.test(u)) return { name, kind: 'index', unit };
  if (UNIT_COUNT.test(u) || (COUNT.test(name) && !AMOUNT.test(name))) return { name, kind: 'count', unit };
  if (AMOUNT.test(name)) {
    const tc = tableUnit ? CURRENCY.find(([re]) => re.test(tableUnit))?.[1] : undefined;
    return { name, kind: 'amount', ...(tc ? { currency: tc } : {}), unit };
  }
  // 名前で分からなければ、表の単位から
  if (tableUnit) {
    if (/%|％/.test(tableUnit)) return { name, kind: 'rate' };
    const tc = CURRENCY.find(([re]) => re.test(tableUnit))?.[1];
    if (tc) return { name, kind: 'amount', currency: tc };
  }
  return { name, kind: 'unknown', unit };
}

/** 足し合わせてよい組み合わせか（同じ種類・同じ通貨。種類が分からないものは、分かるものに合わせる） */
export function sumGroups(ms: Metric[]): Metric[][] {
  const key = (m: Metric) => (m.kind === 'amount' ? `amount:${m.currency ?? '?'}` : m.kind);
  const known = ms.filter((m) => m.kind !== 'unknown');
  const groups = new Map<string, Metric[]>();
  for (const m of known) groups.set(key(m), [...(groups.get(key(m)) ?? []), m]);
  // 通貨の分からない金額は、通貨が1つだけならそれと同じとみなす
  const amounts = [...groups.keys()].filter((k) => k.startsWith('amount:') && k !== 'amount:?');
  if (amounts.length === 1 && groups.has('amount:?')) {
    groups.set(amounts[0]!, [...groups.get(amounts[0]!)!, ...groups.get('amount:?')!]);
    groups.delete('amount:?');
  }
  return [...groups.values()];
}

// ──────────── チャートの意味のチェック ────────────

/** 系列を足し合わせるチャート（積み上げ・構成比・Mekko） */
export const ADDITIVE: ChartTypeId[] = ['stacked_column', 'stacked_100', 'mekko', 'bar_100', 'share_pair'];
/** 1つの値の軸に系列を並べるチャート（通貨・単位が混ざると比べられない） */
const ONE_AXIS: ChartTypeId[] = ['line', 'column_trend', 'bar_trend', 'bar_rank', 'column_compare', 'clustered_column', 'variance_bar', 'slope', ...ADDITIVE];

export type MeaningLevel = 'error' | 'warning' | 'info';
export type MeaningFix =
  | { kind: 'chart'; chart: ChartTypeId }
  | { kind: 'hide'; cols: string[] }
  | { kind: 'unit'; unit: string };

export interface MeaningIssue {
  code: string;
  level: MeaningLevel;
  vars?: Record<string, string | number>;
  /** 問題の系列・項目（名前） */
  targets?: string[];
  fixes?: MeaningFix[];
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100));
const labelOf = (m: Metric) => (m.unit ? m.name : m.name);

export function meaningIssues(s: BuilderState): MeaningIssue[] {
  const out: MeaningIssue[] = [];
  const chart = s.chart;
  const d = toDataset(s);
  const { rows, cols } = viewAxes(s);
  const purpose = registry.charts[chart].purpose;
  const tableUnit = d.unit ?? undefined;
  const metrics = cols.map((c) => metricOf(c, tableUnit));
  const rowsTime = isTimeAxis(rows);
  const values = s.dataset.periods.current.values;
  // 見えている行・列の値（入れ替え・絞り込みの後）
  const sw = isSwapped(s);
  const at = (r: string, c: string): number | null => {
    const ri = (sw ? s.dataset.cols : s.dataset.rows).indexOf(r), ci = (sw ? s.dataset.rows : s.dataset.cols).indexOf(c);
    if (ri < 0 || ci < 0) return null;
    return (sw ? values[ci]?.[ri] : values[ri]?.[ci]) ?? null;
  };

  // 1. 合算の意味：積み上げ・構成比・Mekko で、違う種類（金額と率、円とドル、金額と人数…）を足していないか
  if (ADDITIVE.includes(chart) && cols.length > 1) {
    const groups = sumGroups(metrics);
    if (groups.length > 1) {
      const main = [...groups].sort((a, b) => b.length - a.length)[0]!;
      const others = groups.filter((g) => g !== main).flat();
      const rate = metrics.some((m) => m.kind === 'rate') && metrics.some((m) => m.kind === 'amount');
      out.push({
        code: 'mixed_sum', level: 'error',
        vars: { a: main.map(labelOf).join('・'), b: others.map(labelOf).join('・'), chart },
        targets: others.map((m) => m.name),
        fixes: [
          { kind: 'hide', cols: others.map((m) => m.name) },
          ...(rate ? [{ kind: 'chart' as const, chart: 'combo' as ChartTypeId }] : []),
          ...(!rowsTime && cols.length <= 3 ? [{ kind: 'chart' as const, chart: (cols.length === 3 ? 'bubble' : 'scatter') as ChartTypeId }] : []),
        ],
      });
    }
  }
  // 2. 同じ軸に違う通貨・違う種類（合算しないチャート）
  if (ONE_AXIS.includes(chart) && !ADDITIVE.includes(chart) && cols.length > 1) {
    const currencies = [...new Set(metrics.filter((m) => m.currency).map((m) => m.currency!))];
    if (currencies.length > 1) out.push({ code: 'mixed_currency', level: 'warning', vars: { list: currencies.join('・') }, targets: metrics.filter((m) => m.currency).map((m) => m.name) });
    else {
      const groups = sumGroups(metrics);
      if (groups.length > 1 && metrics.some((m) => m.kind === 'rate') && metrics.some((m) => m.kind !== 'rate' && m.kind !== 'unknown')) {
        const rates = metrics.filter((m) => m.kind === 'rate');
        out.push({ code: 'mixed_axis', level: 'warning', vars: { rates: rates.map(labelOf).join('・') }, targets: rates.map((m) => m.name), fixes: [{ kind: 'chart', chart: 'combo' }, { kind: 'hide', cols: rates.map((m) => m.name) }] });
      }
    }
  }
  // 3. 表の単位と、列の名前の単位が違う（例：スライドは「百万ドル」、列は「売上（億円）」）
  if (tableUnit && purpose !== 'relationship') {
    const named = metrics.filter((m) => m.unit && m.kind !== 'rate');
    const unitCur = CURRENCY.find(([re]) => re.test(tableUnit))?.[1];
    const bad = named.filter((m) => m.currency && unitCur && m.currency !== unitCur || (m.unit && !m.currency && unitCur && m.kind !== 'unknown'));
    if (bad.length && bad[0]!.unit) out.push({ code: 'unit_mismatch', level: 'warning', vars: { unit: tableUnit, col: bad[0]!.name, colUnit: bad[0]!.unit! }, targets: bad.map((m) => m.name), fixes: [{ kind: 'unit', unit: bad[0]!.unit! }] });
  }
  // 4. Mekko・構成比：合計が 0 の項目、マイナス（マイナスは chartAdvice の negative_share で出す）
  if (['mekko', 'stacked_100', 'bar_100'].includes(chart)) {
    const zero = rows.filter((r) => cols.every((c) => (at(r, c) ?? 0) === 0));
    if (zero.length) out.push({ code: 'zero_total', level: 'info', vars: { rows: zero.join('・') }, targets: zero });
  }
  // 5. ウォーターフォール：始点＋増減が終点と合わない、途中に小計
  if (chart === 'waterfall' && rows.length >= 3) {
    const c = cols[0]!;
    const v = rows.map((r) => at(r, c));
    const start = v[0], end = v[v.length - 1];
    if (start != null && end != null) {
      const calc = start + v.slice(1, -1).reduce<number>((a, x) => a + (x ?? 0), 0);
      if (Math.abs(calc - end) > Math.max(1e-6, Math.abs(end) * 1e-9)) {
        const fixed = s.controls.mismatch === 'autofix_end';
        out.push({ code: fixed ? 'bridge_fixed' : 'bridge_mismatch', level: fixed ? 'info' : 'warning', vars: { start: fmt(start), calc: fmt(calc), end: fmt(end), diff: fmt(end - calc), fixed: fixed ? 1 : 0 } });
      }
    }
    const subtotals = rows.slice(1, -1).filter((r) => /(小計|合計|計$|subtotal|total)/i.test(r));
    if (subtotals.length) out.push({ code: 'bridge_subtotals', level: 'warning', vars: { rows: subtotals.join('・') }, targets: subtotals });
  }
  // 6. バブル：大きさが 0・マイナス・空
  if (chart === 'bubble' && cols.length >= 3) {
    const sizeCol = cols[2]!;
    const bad = rows.filter((r) => { const x = at(r, sizeCol); return x == null || x <= 0; });
    if (bad.length) out.push({ code: 'bubble_size', level: 'warning', vars: { col: sizeCol, rows: bad.join('・') }, targets: bad });
  }
  // 7. CAGR（伸び率）：始点が 0 以下、年の間が空いている、暦年と年度の混在
  const recipe = s.recipe ? registry.recipes[s.recipe] : null;
  const cagrOn = activeComplements(s, 'in_chart').includes('cagr_note')
    || !!recipe?.view.panels.some((p) => 'table' in p && p.table === 'cagr_table' && !(s.hiddenParts ?? []).includes(p.id));
  if (cagrOn && rowsTime) {
    const range = timeRange(rows);
    if (range) {
      const first = rows[range.fromIndex]!;
      const badStart = cols.filter((c) => { const x = at(first, c); return x != null && x <= 0; });
      if (badStart.length) out.push({ code: 'cagr_start', level: 'warning', vars: { from: first, cols: badStart.join('・') }, targets: badStart });
      const years = rows.map((r) => Number(/(19|20)\d{2}/.exec(r)?.[0])).filter((y) => Number.isFinite(y) && y > 0);
      const gaps = years.slice(1).some((y, i) => y - years[i]! > 1);
      if (gaps) out.push({ code: 'year_gap', level: 'info', vars: { from: range.from, to: range.to, years: range.to - range.from } });
    }
  }
  if (rowsTime) {
    const fy = rows.filter((r) => /FY|年度|期/i.test(r)), cal = rows.filter((r) => /^(19|20)\d{2}(年)?$/.test(r.trim()));
    if (fy.length && cal.length) out.push({ code: 'fiscal_mix', level: 'warning', vars: { fy: fy[0]!, cal: cal[0]! } });
  }
  return out;
}


/** データの目印（見出しを書いた時と、今のデータが同じか。行・列・値から作る短い文字） */
export function dataSig(d: BuilderState['dataset']): string {
  const s = JSON.stringify([d.rows, d.cols, d.periods.current.values, d.periods.base?.values ?? null]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
