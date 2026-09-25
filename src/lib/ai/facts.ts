import type { Dataset, Locale } from '@/registry';
import { cagr, timeRange } from '@/engine/transform/cagr';
import { formatMetric } from '@/engine/format';

/**
 * スライドの「事実」— AI にヘッダー（メッセージ）を書かせる時に渡す、アプリが計算した数字。
 *
 * AI には表そのものではなくこれだけを渡す。数字はすべてアプリ側で計算済みなので、
 * AI の文に出てくる数字は、ここにあるものの丸めでなければならない（number-check.ts で確認する）。
 * 表の向き（行と列の入れ替え）は見え方だけの話なので、事実はデータの形（schema）から作る。
 */

/** amount＝データの単位の値、rate＝率（0.123＝12.3%）、pt＝構成比の差（0.05＝5pt）、ratio＝倍率、corr＝相関係数 */
export type FactKind = 'amount' | 'rate' | 'pt' | 'ratio' | 'corr';

export interface Fact {
  /** 例：cagr:中国、end:北米、share_change:中国/デュアル */
  id: string;
  kind: FactKind;
  value: number;
  /** AI に見せる1行（例：「中国 CAGR（2021→2025）：13.8%」） */
  text: string;
}

export interface SlideFacts {
  schema: Dataset['schema'];
  unit: string;
  locale: Locale;
  /** 行・列が表すもの（例：年 × 地域） */
  dimensions: { rows: string; cols: string };
  /** 比べている期間（例：2021→2025）。なければ null */
  period: { from: string; to: string } | null;
  /** 強調している項目（自社など） */
  highlight: string | null;
  facts: Fact[];
}

export interface FactsInput {
  dataset: Dataset;
  locale: Locale;
  /** 表示している項目・系列だけに絞る（エディタの「項目」「系列」） */
  items?: string[];
  series?: string[];
  highlight?: string | null;
}

/** AI に渡す事実の上限（多すぎると高くなり、要点もぼやける） */
export const MAX_FACTS = 60;

const T = {
  ja: {
    total: '合計', start: '始点', end: '終点', diff: '増減', rate: '伸び率', cagr: 'CAGR', share: '構成比', shareChange: '構成比の変化',
    growthShare: '増加額に占める割合', rank: '順位', maxMin: '最大÷最小', avg: '平均', corr: 'X と Y の相関係数',
    driver: '要因', residual: 'その他 / 調整', topRight: '両方とも平均より上',
  },
  en: {
    total: 'Total', start: 'Start', end: 'End', diff: 'Change', rate: 'Growth', cagr: 'CAGR', share: 'Share', shareChange: 'Share change',
    growthShare: 'Share of total increase', rank: 'Rank', maxMin: 'Max ÷ min', avg: 'Average', corr: 'Correlation of X and Y',
    driver: 'Driver', residual: 'Other / adjustment', topRight: 'Above average on both',
  },
} as const;

const num = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const pct = (v: number) => (v * 100).toFixed(1) + '%';
const pt = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + 'pt';

export function slideFacts(input: FactsInput): SlideFacts {
  const d = pick(input.dataset, input.items, input.series);
  const L = T[input.locale];
  const unit = d.unit ?? '';
  const amt = (v: number) => formatMetric(v) + unit;
  const signedAmt = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + formatMetric(Math.abs(v)) + unit;
  const facts: Fact[] = [];
  const add = (id: string, kind: FactKind, value: number, text: string) => { if (Number.isFinite(value)) facts.push({ id, kind, value, text }); };
  const hl = input.highlight && (d.cols.includes(input.highlight) || d.rows.includes(input.highlight)) ? input.highlight : null;
  let period: SlideFacts['period'] = null;

  const cur = d.periods.current.values;
  const base = d.periods.base?.values;
  const hasBase = !!base && base.some((r) => r.some(num));

  if (d.schema === 'MATRIX_TIME_SERIES') {
    const tr = timeRange(d.rows);
    if (tr) {
      // 行＝年：系列ごとの始点・終点・増減・CAGR、合計、増加額への寄与
      period = { from: String(tr.from), to: String(tr.to) };
      const years = tr.to - tr.from;
      const span = `${tr.from}→${tr.to}`;
      const s = cur[tr.fromIndex]!, e = cur[tr.toIndex]!;
      const sTot = sum(s), eTot = sum(e);
      add('total:start', 'amount', sTot, `${L.total} ${tr.from}：${amt(sTot)}`);
      add('total:end', 'amount', eTot, `${L.total} ${tr.to}：${amt(eTot)}`);
      add('total:diff', 'amount', eTot - sTot, `${L.total} ${L.diff}（${span}）：${signedAmt(eTot - sTot)}`);
      const tc = cagr(sTot, eTot, years);
      if (num(tc)) add('total:cagr', 'rate', tc, `${L.total} ${L.cagr}（${span}）：${pct(tc)}`);
      const rows = d.cols.map((c, j) => ({ c, s: s[j], e: e[j] })).filter((x) => num(x.s) && num(x.e)) as { c: string; s: number; e: number }[];
      const inc = eTot - sTot;
      for (const r of rows) {
        add(`start:${r.c}`, 'amount', r.s, `${r.c} ${tr.from}：${amt(r.s)}`);
        add(`end:${r.c}`, 'amount', r.e, `${r.c} ${tr.to}：${amt(r.e)}`);
        add(`diff:${r.c}`, 'amount', r.e - r.s, `${r.c} ${L.diff}：${signedAmt(r.e - r.s)}`);
        const g = cagr(r.s, r.e, years);
        if (num(g)) add(`cagr:${r.c}`, 'rate', g, `${r.c} ${L.cagr}：${pct(g)}`);
        if (eTot > 0) add(`share_end:${r.c}`, 'rate', r.e / eTot, `${r.c} ${L.share} ${tr.to}：${pct(r.e / eTot)}`);
        if (inc > 0) add(`growth_share:${r.c}`, 'rate', (r.e - r.s) / inc, `${r.c} ${L.growthShare}：${pct((r.e - r.s) / inc)}`);
      }
      ranks(rows.map((r) => ({ name: r.c, v: cagr(r.s, r.e, years) })), 'cagr', L.cagr, facts, input.locale);
      ranks(rows.map((r) => ({ name: r.c, v: r.e })), 'end', `${tr.to}`, facts, input.locale);
      ratio(rows.map((r) => ({ name: r.c, v: r.e })), 'end', L, facts);
    } else {
      itemFacts(d, L, amt, signedAmt, add, facts, input.locale, hasBase);
      if (hasBase) period = { from: d.periods.base!.label, to: d.periods.current.label };
    }
  } else if (d.schema === 'MEKKO') {
    // 行＝項目（地域・カテゴリ）、列＝中身（形状・ブランド）
    if (hasBase) period = { from: d.periods.base!.label, to: d.periods.current.label };
    const grand = sum(cur.map(sum));
    const grandB = hasBase ? sum(base!.map(sum)) : 0;
    add('total:end', 'amount', grand, `${L.total}：${amt(grand)}`);
    if (hasBase && grandB > 0) {
      add('total:start', 'amount', grandB, `${L.total} ${period!.from}：${amt(grandB)}`);
      add('total:rate', 'rate', grand / grandB - 1, `${L.total} ${L.rate}：${pct(grand / grandB - 1)}`);
    }
    d.rows.forEach((r, i) => {
      const t = sum(cur[i]!), tb = hasBase ? sum(base![i]!) : 0;
      add(`row_total:${r}`, 'amount', t, `${r} ${L.total}：${amt(t)}`);
      if (grand > 0) add(`row_share:${r}`, 'rate', t / grand, `${r} ${L.share}（${L.total}）：${pct(t / grand)}`);
      if (hasBase && tb > 0) add(`row_rate:${r}`, 'rate', t / tb - 1, `${r} ${L.rate}：${pct(t / tb - 1)}`);
      d.cols.forEach((c, j) => {
        const v = cur[i]![j], vb = base?.[i]?.[j];
        if (!num(v) || t <= 0) return;
        // 強調がある時は、その列（行）の数字を優先して渡す
        if (hl && hl !== c && hl !== r && d.rows.length * d.cols.length > 20) return;
        add(`share:${r}/${c}`, 'rate', v / t, `${r}・${c} ${L.share}：${pct(v / t)}`);
        if (hasBase && num(vb) && tb > 0) {
          add(`share_change:${r}/${c}`, 'pt', v / t - vb / tb, `${r}・${c} ${L.shareChange}：${pt(v / t - vb / tb)}`);
          add(`diff:${r}/${c}`, 'amount', v - vb, `${r}・${c} ${L.diff}：${signedAmt(v - vb)}`);
        }
      });
    });
    d.cols.forEach((c, j) => {
      const t = sum(cur.map((row) => row[j])), tb = hasBase ? sum(base!.map((row) => row[j])) : 0;
      if (grand > 0) add(`col_share:${c}`, 'rate', t / grand, `${c} ${L.share}（${L.total}）：${pct(t / grand)}`);
      if (hasBase && grandB > 0) add(`col_share_change:${c}`, 'pt', t / grand - tb / grandB, `${c} ${L.shareChange}（${L.total}）：${pt(t / grand - tb / grandB)}`);
      if (hasBase && tb > 0) add(`col_rate:${c}`, 'rate', t / tb - 1, `${c} ${L.rate}：${pct(t / tb - 1)}`);
    });
  } else if (d.schema === 'DRIVER_BRIDGE') {
    // 1行目＝始点、最後の行＝終点、あいだ＝要因（1列目の値）
    const v = cur.map((r) => r[0]);
    const n = d.rows.length;
    const start = v[0], end = v[n - 1];
    if (num(start)) add('start', 'amount', start, `${L.start}（${d.rows[0]}）：${amt(start)}`);
    if (num(end)) add('end', 'amount', end, `${L.end}（${d.rows[n - 1]}）：${amt(end)}`);
    if (num(start) && num(end)) {
      add('diff', 'amount', end - start, `${L.diff}：${signedAmt(end - start)}`);
      if (start > 0) add('rate', 'rate', end / start - 1, `${L.rate}：${pct(end / start - 1)}`);
    }
    const drivers = d.rows.slice(1, -1).map((name, i) => ({ name, v: v[i + 1] })).filter((x): x is { name: string; v: number } => num(x.v));
    for (const x of drivers) add(`driver:${x.name}`, 'amount', x.v, `${L.driver} ${x.name}：${signedAmt(x.v)}`);
    if (num(start) && num(end)) {
      const rest = end - start - sum(drivers.map((x) => x.v));
      if (Math.abs(rest) > 1e-9) add('residual', 'amount', rest, `${L.residual}：${signedAmt(rest)}`);
    }
    const pos = sum(drivers.filter((x) => x.v > 0).map((x) => x.v)), neg = sum(drivers.filter((x) => x.v < 0).map((x) => x.v));
    if (pos) add('drivers:plus', 'amount', pos, `${L.driver}（+）${L.total}：${signedAmt(pos)}`);
    if (neg) add('drivers:minus', 'amount', neg, `${L.driver}（−）${L.total}：${signedAmt(neg)}`);
    ranks(drivers.map((x) => ({ name: x.name, v: Math.abs(x.v) })), 'driver_abs', L.driver, facts, input.locale);
  } else if (d.schema === 'BUBBLE') {
    // 1列目＝X、2列目＝Y、3列目＝大きさ
    const pts = d.rows.map((name, i) => ({ name, x: cur[i]![0], y: cur[i]![1], z: cur[i]![2] })).filter((p) => num(p.x) && num(p.y)) as { name: string; x: number; y: number; z?: number | null }[];
    const [xn = 'X', yn = 'Y', zn] = d.cols;
    const ax = avg(pts.map((p) => p.x)), ay = avg(pts.map((p) => p.y));
    for (const p of pts) {
      add(`x:${p.name}`, 'amount', p.x, `${p.name} ${xn}：${formatMetric(p.x)}`);
      add(`y:${p.name}`, 'amount', p.y, `${p.name} ${yn}：${formatMetric(p.y)}`);
      if (zn && num(p.z)) add(`z:${p.name}`, 'amount', p.z, `${p.name} ${zn}：${formatMetric(p.z)}`);
    }
    if (pts.length) {
      add('avg:x', 'amount', ax, `${xn} ${L.avg}：${formatMetric(ax)}`);
      add('avg:y', 'amount', ay, `${yn} ${L.avg}：${formatMetric(ay)}`);
    }
    const r = corr(pts.map((p) => p.x), pts.map((p) => p.y));
    if (num(r)) add('corr', 'corr', r, `${L.corr}：${r.toFixed(2)}`);
    const tr = pts.filter((p) => p.x > ax && p.y > ay).map((p) => p.name);
    if (tr.length) facts.push({ id: 'top_right', kind: 'ratio', value: tr.length, text: `${L.topRight}：${tr.join('、')}` });
    ranks(pts.map((p) => ({ name: p.name, v: p.x })), 'x', xn, facts, input.locale);
    ranks(pts.map((p) => ({ name: p.name, v: p.y })), 'y', yn, facts, input.locale);
  }

  // 強調している項目の事実を先に（上限で切られないように）
  const ordered = hl ? [...facts.filter((f) => f.id.includes(hl)), ...facts.filter((f) => !f.id.includes(hl))] : facts;
  return {
    schema: d.schema,
    unit,
    locale: input.locale,
    dimensions: { rows: d.dimensions?.rows ?? '', cols: d.dimensions?.cols ?? '' },
    period,
    highlight: hl,
    facts: ordered.slice(0, MAX_FACTS),
  };
}

/** 年ではない行（項目）×列：最新の値・順位・最大÷最小、比較期間があれば増減と伸び率 */
function itemFacts(
  d: Dataset, L: (typeof T)[Locale], amt: (v: number) => string, signedAmt: (v: number) => string,
  add: (id: string, kind: FactKind, value: number, text: string) => void, facts: Fact[], locale: Locale, hasBase: boolean,
) {
  const cur = d.periods.current.values, base = d.periods.base?.values;
  d.cols.forEach((c, j) => {
    const items = d.rows.map((name, i) => ({ name, v: cur[i]![j], b: base?.[i]?.[j] }));
    for (const x of items) {
      if (!num(x.v)) continue;
      const label = d.cols.length > 1 ? `${x.name}・${c}` : x.name;
      add(`value:${x.name}/${c}`, 'amount', x.v, `${label}：${amt(x.v)}`);
      if (hasBase && num(x.b)) {
        add(`diff:${x.name}/${c}`, 'amount', x.v - x.b, `${label} ${L.diff}：${signedAmt(x.v - x.b)}`);
        if (x.b > 0) add(`rate:${x.name}/${c}`, 'rate', x.v / x.b - 1, `${label} ${L.rate}：${pct(x.v / x.b - 1)}`);
      }
    }
    const suffix = d.cols.length > 1 ? `/${c}` : '';
    ranks(items.map((x) => ({ name: x.name, v: x.v })), `value${suffix}`, d.cols.length > 1 ? c : '', facts, locale);
    ratio(items.map((x) => ({ name: x.name, v: x.v })), `value${suffix}`, L, facts);
    const vs = items.map((x) => x.v).filter(num);
    if (vs.length > 1) add(`avg${suffix}`, 'amount', avg(vs), `${d.cols.length > 1 ? c + ' ' : ''}${L.avg}：${amt(avg(vs))}`);
  });
}

/** 上位3つを順位として（例：「CAGR 1位：東南アジア（20.4%）」） */
function ranks(xs: { name: string; v: number | null | undefined }[], id: string, label: string, facts: Fact[], locale: Locale) {
  const sorted = xs.filter((x): x is { name: string; v: number } => num(x.v)).sort((a, b) => b.v - a.v);
  if (sorted.length < 2) return;
  const L = T[locale];
  sorted.slice(0, 3).forEach((x, i) => {
    const place = locale === 'ja' ? `${i + 1}位` : `#${i + 1}`;
    facts.push({ id: `rank:${id}:${i + 1}`, kind: 'ratio', value: i + 1, text: `${label ? label + ' ' : ''}${L.rank} ${place}：${x.name}` });
  });
  const last = sorted[sorted.length - 1]!;
  facts.push({ id: `rank:${id}:last`, kind: 'ratio', value: sorted.length, text: `${label ? label + ' ' : ''}${L.rank} ${locale === 'ja' ? '最下位' : 'last'}：${last.name}` });
}

function ratio(xs: { name: string; v: number | null | undefined }[], id: string, L: (typeof T)[Locale], facts: Fact[]) {
  const vs = xs.filter((x): x is { name: string; v: number } => num(x.v) && x.v > 0).sort((a, b) => b.v - a.v);
  if (vs.length < 2) return;
  const r = vs[0]!.v / vs[vs.length - 1]!.v;
  facts.push({ id: `ratio:${id}`, kind: 'ratio', value: r, text: `${L.maxMin}（${vs[0]!.name}÷${vs[vs.length - 1]!.name}）：${r.toFixed(1)}` });
}

function pick(d: Dataset, items?: string[], series?: string[]): Dataset {
  if (!items && !series) return d;
  const ri = d.rows.map((r, i) => (!items || items.includes(r) ? i : -1)).filter((i) => i >= 0);
  const ci = d.cols.map((c, j) => (!series || series.includes(c) ? j : -1)).filter((j) => j >= 0);
  const cut = (v: (number | null)[][]) => ri.map((i) => ci.map((j) => v[i]?.[j] ?? null));
  return {
    ...d,
    rows: ri.map((i) => d.rows[i]!),
    cols: ci.map((j) => d.cols[j]!),
    ...(d.groups ? { groups: ri.map((i) => d.groups![i] ?? null) } : {}),
    periods: {
      current: { ...d.periods.current, values: cut(d.periods.current.values) },
      ...(d.periods.base ? { base: { ...d.periods.base, values: cut(d.periods.base.values) } } : {}),
    },
  };
}

const sum = (a: readonly (number | null | undefined)[]) => a.reduce<number>((s, v) => s + (num(v) ? v : 0), 0);
const avg = (a: readonly number[]) => (a.length ? sum(a) / a.length : 0);
function corr(x: number[], y: number[]): number | null {
  if (x.length < 3) return null;
  const mx = avg(x), my = avg(y);
  let sxy = 0, sxx = 0, syy = 0;
  x.forEach((xi, i) => { const dx = xi - mx, dy = y[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** プロンプトに入れる形（1行1事実） */
export function factsToText(f: SlideFacts): string {
  const head = [
    `schema: ${f.schema}`,
    f.unit ? `unit: ${f.unit}` : null,
    f.dimensions.rows || f.dimensions.cols ? `rows × cols: ${f.dimensions.rows || '-'} × ${f.dimensions.cols || '-'}` : null,
    f.period ? `period: ${f.period.from} → ${f.period.to}` : null,
    f.highlight ? `highlight: ${f.highlight}` : null,
  ].filter(Boolean);
  return [...head, '', ...f.facts.map((x) => `- [${x.id}] ${x.text}`)].join('\n');
}
