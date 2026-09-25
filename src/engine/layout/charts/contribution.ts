import { slideText } from '@/i18n/slide';
import { formatMetric, type NumberFormat } from '../../format';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { AXIS, INK, SEC } from '../../theme';
import type { Matrix } from '../../transform/matrix';
import { CATEGORY_H, categoryLabelsBelow, layoutHeader, tickFormatter, tickGutter, verticalValueAxis, labelGutter, categoryLabelsLeft } from './common';
import { envOf, type ChartCtx, type ChartLayout } from './context';

/** 要因の色（NarratiX の getDriverColorSet_ と同じ） */
export const DRIVER_COLORS = {
  default: { startEnd: '#163A5B', positive: '#2E6C9E', negative: '#D27C2C', connector: '#CBD5E1', positiveBg: '#EAF4FB', negativeBg: '#FFF0E5' },
  mono: { startEnd: '#334155', positive: '#64748B', negative: '#94A3B8', connector: '#CBD5E1', positiveBg: '#F1F5F9', negativeBg: '#E2E8F0' },
  high_contrast: { startEnd: '#0B1F33', positive: '#1565C0', negative: '#EF6C00', connector: '#94A3B8', positiveBg: '#DDEBFA', negativeBg: '#FDE7D3' },
} as const;

const EPS = 0.000001;

export interface Driver { label: string; value: number; order: number; adjustment?: boolean }
export interface BridgeContext {
  start: { label: string; value: number };
  end: { label: string; value: number };
  drivers: Driver[];
  /** 終点が空欄で、始点＋要因の合計から計算した */
  endComputed: boolean;
  /** 終点と合わない差を「その他 / 調整」として足した／終点を合計に合わせた */
  gapAdded: boolean;
  endFixed: boolean;
  net: number;
  rate: number | null;
}

/**
 * 始点・要因・終点（NarratiX の parseDriverBridgeRows_ / buildDriverContextFromInfo_ と同じ規則）。
 * 1行目＝始点、最後の行＝終点、あいだ＝要因。値は1列目。
 * 終点が空なら始点＋要因の合計。合わなければ既定は差を「その他 / 調整」に、「終点を自動補正」なら終点を合計に合わせる。
 * 値0の要因は「値0の要因を表示」がオンの時だけ（調整は常に）。並び順は driver_sort。
 */
export function bridgeContext(m: Matrix, ctl: { sort?: string; showZero?: boolean; mismatch?: string; adjustLabel: string }): BridgeContext | null {
  if (m.rows.length < 3 || !m.cols.length) return null;
  const v = (i: number) => m.current.values[i]?.[0] ?? null;
  const start = v(0);
  if (start == null) return null;
  const drivers: Driver[] = [];
  for (let i = 1; i < m.rows.length - 1; i++) {
    const x = v(i);
    if (x == null) continue;
    drivers.push({ label: m.rows[i]!, value: x, order: i });
  }
  if (!drivers.length) return null;
  const calc = start + drivers.reduce((a, d) => a + d.value, 0);
  const endIn = v(m.rows.length - 1);
  let end = endIn ?? calc;
  let gapAdded = false, endFixed = false;
  if (endIn != null && Math.abs(endIn - calc) > EPS) {
    if (ctl.mismatch === 'autofix_end') { end = calc; endFixed = true; }
    else { drivers.push({ label: ctl.adjustLabel, value: endIn - calc, order: 999999, adjustment: true }); gapAdded = true; }
  }
  const visible = drivers.filter((d) => ctl.showZero || Math.abs(d.value) > EPS || d.adjustment);
  const sign = (d: Driver, posFirst: boolean) => (d.value > 0 ? (posFirst ? 0 : 1) : d.value < 0 ? (posFirst ? 1 : 0) : 2);
  const mode = ctl.sort ?? 'impact_desc';
  visible.sort((a, b) => {
    if (mode === 'input' || mode === 'custom') return a.order - b.order;
    const posFirst = mode !== 'negative_first';
    const s = sign(a, posFirst) - sign(b, posFirst);
    if (s) return s;
    const d = mode === 'impact_asc' ? Math.abs(a.value) - Math.abs(b.value) : Math.abs(b.value) - Math.abs(a.value);
    return d || a.order - b.order;
  });
  return {
    start: { label: m.rows[0]!, value: start }, end: { label: m.rows[m.rows.length - 1]!, value: end },
    drivers: visible, endComputed: endIn == null, gapAdded, endFixed,
    net: end - start, rate: start ? (end - start) / Math.abs(start) : null,
  };
}

/** 差のラベル：+12 / -3.5 / 0（NarratiX の formatDriverSignedValue_） */
export function signedMetric(v: number, nf: NumberFormat): string {
  if (Math.abs(v) < EPS) return '0';
  return (v > 0 ? '+' : '-') + formatMetric(Math.abs(v), nf);
}

function contextOf(ctx: ChartCtx) {
  return bridgeContext(ctx.matrix, {
    sort: ctx.control<string>('driver_sort'),
    showZero: ctx.control<boolean>('show_zero') === true,
    mismatch: ctx.control<string>('mismatch'),
    adjustLabel: slideText(ctx.locale, 'bridgeAdjust'),
  });
}
const colorsOf = (ctx: ChartCtx) => DRIVER_COLORS[(ctx.control<string>('posneg_color') ?? 'default') as keyof typeof DRIVER_COLORS] ?? DRIVER_COLORS.default;
const needs = (ctx: ChartCtx): { items: SceneItem[]; anchors: Record<string, never> } => ({
  items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.5, lines: [{ t: slideText(ctx.locale, 'bridgeNeeds'), size: 10, color: SEC }], align: 'left', valign: 'top' }],
  anchors: {},
});
const netNote = (ctx: ChartCtx, b: BridgeContext, nf: NumberFormat) => {
  const vars = { from: formatMetric(b.start.value, nf), to: formatMetric(b.end.value, nf), diff: signedMetric(b.net, nf) };
  return b.rate == null ? slideText(ctx.locale, 'bridgeNetNoRate', vars) : slideText(ctx.locale, 'bridgeNet', { ...vars, rate: signedMetric(b.rate * 100, 'raw').replace(/^([+-]?[\d,.]+)$/, '$1%') });
};

/**
 * ウォーターフォール：始点（濃紺）→ 要因（増加は青、減少は橙で浮かせる）→ 終点（濃紺）。
 * 値ラベルは棒の上（始点・終点は値、要因は符号付き）。連結線は前の棒の終わりの高さで結ぶ。
 */
export const waterfall: ChartLayout = (ctx) => {
  const b = contextOf(ctx);
  if (!b) return needs(ctx);
  const env = envOf(ctx);
  const C = colorsOf(ctx);
  const nf = env.numberFormat;
  const fmt = tickFormatter(nf);
  const items: SceneItem[] = [];
  const unit = ctx.unit ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null;
  const head = layoutHeader(ctx.rect, [], unit, netNote(ctx, b, nf));
  items.push(...head.items);
  type Bar = { label: string; from: number; to: number; kind: 'total' | 'pos' | 'neg'; value: number };
  const bars: Bar[] = [{ label: b.start.label, from: 0, to: b.start.value, kind: 'total', value: b.start.value }];
  let run = b.start.value;
  for (const d of b.drivers) { bars.push({ label: d.label, from: run, to: run + d.value, kind: d.value >= 0 ? 'pos' : 'neg', value: d.value }); run += d.value; }
  bars.push({ label: b.end.label, from: 0, to: b.end.value, kind: 'total', value: b.end.value });
  const scale = valueScale(bars.flatMap((x) => [x.from, x.to]));
  const g = tickGutter(scale, fmt);
  const top = ctx.rect.y + head.height + 0.25;
  const plot: Rect = { x: ctx.rect.x + g, y: top, w: ctx.rect.w - g - 0.1, h: ctx.rect.y + ctx.rect.h - top - CATEGORY_H };
  items.push(...verticalValueAxis(plot, scale, fmt, env.gridlines));
  items.push(...categoryLabelsBelow(plot, bars.map((x) => x.label), bars.length > 8 ? 9 : 10));
  const yOf = (v: number) => plot.y + plot.h * (1 - scale.ratio(v));
  const slot = plot.w / bars.length;
  const bw = Math.min(slot * 0.62, 1.1);
  const connectors = ctx.control<boolean>('connectors') !== false;
  bars.forEach((x, i) => {
    const bx = plot.x + slot * i + (slot - bw) / 2;
    const y1 = yOf(Math.max(x.from, x.to)), y2 = yOf(Math.min(x.from, x.to));
    const fill = x.kind === 'total' ? C.startEnd : x.kind === 'pos' ? C.positive : C.negative;
    items.push({ kind: 'box', x: bx, y: y1, w: bw, h: Math.max(0.01, y2 - y1), fill });
    const t = x.kind === 'total' ? formatMetric(x.value, nf) : signedMetric(x.value, nf);
    items.push({ kind: 'text', x: bx - 0.3, y: y1 - 0.22, w: bw + 0.6, h: 0.2, lines: [{ t, size: 9, bold: true, color: fill }], align: 'center', valign: 'middle' });
    // 連結線：この棒の終わりの高さから、次の棒の始まりへ（終点の手前まで）
    if (connectors && i < bars.length - 2) {
      const y = yOf(x.to);
      items.push({ kind: 'line', x1: bx + bw, y1: y, x2: bx + slot, y2: y, color: C.connector, width: 0.75 });
    }
  });
  return { items, anchors: {} };
};

/** 要因バー：要因だけを横棒で（増加は右、減少は左）。どの要因が一番効いたかを見る */
export const driverBar: ChartLayout = (ctx) => {
  const b = contextOf(ctx);
  if (!b) return needs(ctx);
  const env = envOf(ctx);
  const C = colorsOf(ctx);
  const nf = env.numberFormat;
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, [], ctx.unit ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null, netNote(ctx, b, nf));
  items.push(...head.items);
  const cats = b.drivers.map((d) => d.label);
  const labels = b.drivers.map((d) => signedMetric(d.value, nf));
  const lw = Math.max(...labels.map((t) => t.length * 0.075)) + 0.2;
  const hasNeg = b.drivers.some((d) => d.value < 0);
  const g = labelGutter(cats, ctx.rect.w);
  const plot: Rect = { x: ctx.rect.x + g + (hasNeg ? lw : 0), y: ctx.rect.y + head.height + 0.1, w: ctx.rect.w - g - (hasNeg ? lw : 0) - lw, h: ctx.rect.h - head.height - 0.2 };
  items.push(...categoryLabelsLeft(plot, cats, ctx.rect.x));
  const scale = valueScale([0, ...b.drivers.map((d) => d.value)]);
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  const zero = xOf(Math.min(Math.max(0, scale.min), scale.max));
  const slot = plot.h / cats.length;
  const bh = Math.min(slot * 0.56, 0.45);
  b.drivers.forEach((d, i) => {
    const y = plot.y + slot * i + (slot - bh) / 2;
    const p = xOf(d.value);
    const fill = d.value >= 0 ? C.positive : C.negative;
    items.push({ kind: 'box', x: Math.min(p, zero), y, w: Math.max(0.01, Math.abs(p - zero)), h: bh, fill });
    const pos = d.value >= 0;
    items.push({ kind: 'text', x: pos ? p + 0.06 : p - 0.06 - lw, y: y + bh / 2 - 0.11, w: lw, h: 0.22, lines: [{ t: labels[i]!, size: 10, bold: true, color: fill }], align: pos ? 'left' : 'right', valign: 'middle' });
  });
  items.push({ kind: 'line', x1: zero, y1: plot.y, x2: zero, y2: plot.y + plot.h, color: AXIS.base, width: 1 });
  return { items, anchors: {} };
};

/** プラス・マイナスバー：増加要因と減少要因を左右2つの枠に分けて、大きさ（絶対値）で並べる。棒の長さは両方で同じ尺度 */
export const posnegBar: ChartLayout = (ctx) => {
  const b = contextOf(ctx);
  if (!b) return needs(ctx);
  const env = envOf(ctx);
  const C = colorsOf(ctx);
  const nf = env.numberFormat;
  const items: SceneItem[] = [];
  const head = layoutHeader(ctx.rect, [], ctx.unit ? slideText(ctx.locale, 'unitNote', { unit: ctx.unit }) : null, netNote(ctx, b, nf));
  items.push(...head.items);
  const pos = b.drivers.filter((d) => d.value > EPS).sort((x, y) => y.value - x.value);
  const neg = b.drivers.filter((d) => d.value < -EPS).sort((x, y) => x.value - y.value);
  const maxAbs = Math.max(EPS, ...b.drivers.map((d) => Math.abs(d.value)));
  const gap = 0.3;
  const pw = (ctx.rect.w - gap) / 2;
  const top = ctx.rect.y + head.height + 0.1;
  const rows = Math.max(pos.length, neg.length, 1);
  const titleH = 0.32;
  const slot = Math.min(0.62, (ctx.rect.y + ctx.rect.h - top - titleH - 0.1) / rows);
  const bh = Math.min(slot * 0.56, 0.42);
  const panel = (x: number, title: string, list: Driver[], bg: string, color: string) => {
    items.push({ kind: 'box', x, y: top, w: pw, h: titleH, fill: bg });
    items.push({ kind: 'text', x: x + 0.1, y: top, w: pw - 0.2, h: titleH, lines: [{ t: title, size: 10, bold: true, color: INK }], align: 'left', valign: 'middle' });
    const labelW = Math.min(pw * 0.38, labelGutter(list.map((d) => d.label), pw));
    const valW = 0.8;
    const cw = pw - labelW - valW - 0.1;
    if (!list.length) {
      items.push({ kind: 'text', x, y: top + titleH + 0.08, w: pw, h: 0.24, lines: [{ t: slideText(ctx.locale, 'noDrivers'), size: 10, color: SEC }], align: 'left', valign: 'middle' });
      return;
    }
    list.forEach((d, i) => {
      const y = top + titleH + 0.08 + slot * i;
      items.push({ kind: 'text', x, y: y + bh / 2 - 0.12, w: labelW - 0.08, h: 0.24, lines: [{ t: d.label, size: 10, bold: true, color: INK }], align: 'right', valign: 'middle' });
      const w = Math.max(0.01, (Math.abs(d.value) / maxAbs) * cw);
      items.push({ kind: 'box', x: x + labelW, y, w, h: bh, fill: color });
      items.push({ kind: 'text', x: x + labelW + w + 0.06, y: y + bh / 2 - 0.11, w: valW, h: 0.22, lines: [{ t: signedMetric(d.value, nf), size: 10, bold: true, color }], align: 'left', valign: 'middle' });
    });
  };
  panel(ctx.rect.x, slideText(ctx.locale, 'posDrivers'), pos, C.positiveBg, C.positive);
  panel(ctx.rect.x + pw + gap, slideText(ctx.locale, 'negDrivers'), neg, C.negativeBg, C.negative);
  return { items, anchors: {} };
};
