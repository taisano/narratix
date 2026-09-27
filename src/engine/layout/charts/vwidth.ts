import { slideText } from '@/i18n/slide';
import { formatMetric } from '../../format';
import { valueScale } from '../../scale';
import type { Rect, SceneItem } from '../../scene';
import { textWidth } from '../../text';
import { AXIS, FOCUS, INK, SEC, WHITE, highlightAccent, textOn } from '../../theme';
import { layoutHeader, tickFormatter, tickGutter, verticalValueAxis } from './common';
import { envOf, readingNote, type ChartCtx, type ChartLayout } from './context';

/** 幅と高さに使う列（未指定なら：幅＝3列目（大きさ）があればそれ、無ければ1列目。高さ＝2列目） */
export function vwColumns(cols: readonly string[], width?: string, height?: string): { w: number; h: number } | null {
  if (cols.length < 2) return null;
  let w = width && cols.includes(width) ? cols.indexOf(width) : cols.length >= 3 ? 2 : 0;
  let h = height && cols.includes(height) ? cols.indexOf(height) : 1;
  if (w === h) {
    // 同じ列を選んだ時は、もう一方を別の列にずらす
    if (height && cols.includes(height)) w = cols.findIndex((_, k) => k !== h);
    else h = cols.findIndex((_, k) => k !== w);
  }
  return { w, h };
}

/** 基準線の値（数字として読めなければ null） */
export const parseRef = (s: string | undefined): number | null => {
  const t = (s ?? '').replace(/[,，\s]/g, '').replace(/[％%]$/, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

interface Bar { label: string; width: number; height: number; group: string | null }

/**
 * 幅が変わる縦棒：項目ごとに、幅＝規模（人口・売上など）、高さ＝水準（1人当たり・利益率など）。
 * 面積が「規模×水準」（全体の量）になる。横軸は幅の累計構成比（0〜100%）。
 * 名前が棒の幅に入らない項目は番号にして、下に番号と名前の一覧を出す。
 */
export const variableWidth: ChartLayout = (ctx) => {
  const env = envOf(ctx);
  const m = ctx.matrix;
  const cols = vwColumns(m.cols, ctx.control<string>('vw_width'), ctx.control<string>('vw_height'));
  const bars: Bar[] = [];
  if (cols) {
    m.rows.forEach((label, i) => {
      const r = m.current.values[i] ?? [];
      const w = r[cols.w], h = r[cols.h];
      if (w == null || h == null || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0) return;
      bars.push({ label, width: w, height: h, group: m.groups?.[i]?.trim() || null });
    });
  }
  if (!cols || !bars.length) {
    return { items: [{ kind: 'text', x: ctx.rect.x, y: ctx.rect.y, w: ctx.rect.w, h: 0.5, lines: [{ t: slideText(ctx.locale, 'vwNeeds'), size: 10, color: SEC }], align: 'left', valign: 'top' }], anchors: {} };
  }
  const sort = ctx.control<string>('vw_sort') ?? 'height';
  if (sort === 'height') bars.sort((a, b) => b.height - a.height);
  else if (sort === 'width') bars.sort((a, b) => b.width - a.width);

  const nf = env.numberFormat;
  const fmt = tickFormatter(nf);
  const wName = m.cols[cols.w]!, hName = m.cols[cols.h]!;
  const items: SceneItem[] = [];
  const focus = ctx.control<string>('highlight');
  const hl = focus && bars.some((b) => b.label === focus) ? focus : null;
  const groups = [...new Set(bars.map((b) => b.group).filter((g): g is string => !!g))];
  const gc = ctx.palette.groups(groups.length);
  const baseOf = (b: Bar) => (groups.length ? (b.group ? gc[groups.indexOf(b.group)]! : ctx.palette.groupEmpty) : ctx.palette.primary);
  // 強調色（Plus）がある時は強調した棒だけその色、ほかはテーマの色のまま
  const accent = hl ? highlightAccent(ctx.control<string>('highlight_color')) : null;
  const dimOf = (b: Bar) => !!hl && b.label !== hl;
  const colorOf = (b: Bar) => (accent && b.label === hl ? accent : dimOf(b) ? FOCUS.otherBar : baseOf(b));

  // 上：凡例（グループ）と注記（何が幅・高さか）
  const head = layoutHeader(ctx.rect, groups.map((g, k) => ({ name: g, color: gc[k]!, shape: 'box' as const })), readingNote(ctx, slideText(ctx.locale, 'vwNote', { w: wName, h: hName })));
  items.push(...head.items);

  // 基準線：値を入れていればその値、無ければ幅で重みを付けた平均
  const totalW = bars.reduce((a, b) => a + b.width, 0);
  const refOn = ctx.complement('reference_line');
  const refInput = parseRef(ctx.control<string>('ref_value'));
  const refValue = refOn ? (refInput ?? bars.reduce((a, b) => a + b.width * b.height, 0) / totalW) : null;
  const refName = ctx.control<string>('ref_label')?.trim();
  const refText = refValue == null ? '' : refName ? `${refName} ${formatMetric(refValue, nf)}` : refInput != null ? formatMetric(refValue, nf) : slideText(ctx.locale, 'weightedAvg', { value: formatMetric(refValue, nf) });

  const scale = valueScale([0, ...bars.map((b) => b.height), ...(refValue != null ? [refValue] : [])]);
  const gutter = tickGutter(scale, fmt);

  // 名前が棒の幅に入るか（横軸の幅はまだ決まっていないので、ざっと見積もる）
  const approxW = ctx.rect.w - gutter - 0.2;
  const fits = (b: Bar) => textWidth(b.label, 8) + 0.04 <= approxW * (b.width / totalW);
  const numbered = bars.filter((b) => !fits(b));
  const numOf = new Map(numbered.map((b, k) => [b.label, k + 1]));
  // 下：番号と名前の一覧（列に分けて並べる）
  const entryW = numbered.length ? Math.max(...numbered.map((b) => textWidth(`${numOf.get(b.label)}. ${b.label}`, 8))) + 0.3 : 0;
  const perRow = numbered.length ? Math.max(1, Math.floor(approxW / entryW)) : 0;
  const legendRows = numbered.length ? Math.ceil(numbered.length / perRow) : 0;
  const rowH = 0.17;
  const axisH = 0.22 + 0.26;
  const legendH = legendRows ? legendRows * rowH + 0.1 : 0;

  const plot: Rect = {
    x: ctx.rect.x + gutter, y: ctx.rect.y + head.height + 0.4,
    w: ctx.rect.w - gutter - 0.15, h: ctx.rect.h - head.height - 0.4 - axisH - legendH,
  };
  items.push(...verticalValueAxis(plot, scale, fmt, env.gridlines));
  // 縦軸の名前（軸の上、左寄せ）
  items.push({ kind: 'text', x: ctx.rect.x, y: plot.y - 0.34, w: Math.min(ctx.rect.w * 0.6, textWidth(hName, 9) + 0.3), h: 0.2, lines: [{ t: hName, size: 9, bold: true, color: INK }], align: 'left', valign: 'middle' });
  const Y = (v: number) => plot.y + plot.h * (1 - scale.ratio(v));
  const y0 = Y(Math.min(Math.max(0, scale.min), scale.max));

  // 棒と名前が占める場所（基準線の名前を重ならない所に置くため）
  const taken: Rect[] = [];
  let acc = 0;
  for (const b of bars) {
    const x = plot.x + plot.w * (acc / totalW);
    const w = plot.w * (b.width / totalW);
    acc += b.width;
    const yv = Y(b.height);
    const top = Math.min(yv, y0), h = Math.abs(y0 - yv);
    const fill = colorOf(b);
    const val = formatMetric(b.height, nf);
    const inside = env.dataLabels && h >= 0.22 && w >= textWidth(val, 8) + 0.06;
    items.push({ kind: 'box', x, y: top, w, h: Math.max(h, 0.005), fill, line: WHITE, lines: inside ? [{ t: val, size: 8, bold: b.label === hl, color: textOn(fill) }] : [], align: 'center', valign: 'top' });
    // 棒の上（マイナスなら下）に名前か番号
    const tag = numOf.has(b.label) ? String(numOf.get(b.label)) : b.label;
    const tw = Math.max(w, textWidth(tag, 8) + 0.06);
    const ty = b.height >= 0 ? top - 0.19 : top + h + 0.02;
    items.push({ kind: 'text', x: x + w / 2 - tw / 2, y: ty, w: tw, h: 0.17, lines: [{ t: tag, size: 8, bold: b.label === hl, color: dimOf(b) ? SEC : INK }], align: 'center', valign: 'middle' });
    taken.push({ x: Math.min(x, x + w / 2 - tw / 2), y: Math.min(ty, top), w: Math.max(w, tw), h: Math.max(top + h, ty + 0.17) - Math.min(ty, top) });
  }

  // 横軸：幅の累計構成比（0〜100%）
  const axisY = plot.y + plot.h;
  for (let p = 0; p <= 100; p += 20) {
    const x = plot.x + plot.w * (p / 100);
    items.push({ kind: 'line', x1: x, y1: axisY, x2: x, y2: axisY + 0.04, color: AXIS.base, width: 0.75 });
    items.push({ kind: 'text', x: x - 0.3, y: axisY + 0.04, w: 0.6, h: 0.18, lines: [{ t: String(p), size: 8, color: AXIS.label }], align: 'center', valign: 'middle' });
  }
  items.push({ kind: 'text', x: plot.x, y: axisY + 0.22, w: plot.w, h: 0.22, lines: [{ t: slideText(ctx.locale, 'vwWidthAxis', { name: wName }), size: 9, color: SEC }], align: 'center', valign: 'middle' });

  if (refValue != null) {
    const y = Y(refValue);
    items.push({ kind: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, color: AXIS.reference, width: 1, dash: true });
    const lw = textWidth(refText, 9) + 0.2;
    // 名前の置き場所：線の上の右端 → 左端 → 中央 → 線の下の右端 …。棒や名前と重ならない最初の所
    const hit = (r: Rect) => taken.some((t) => r.x < t.x + t.w && t.x < r.x + r.w && r.y < t.y + t.h && t.y < r.y + r.h);
    const xs = [plot.x + plot.w - lw, plot.x + 0.05, plot.x + (plot.w - lw) / 2];
    const spots = [y - 0.23, y + 0.03].flatMap((yy) => xs.map((xx) => ({ x: xx, y: yy, w: lw, h: 0.2 })));
    const at = spots.find((r) => !hit(r) && r.y >= plot.y - 0.05 && r.y + r.h <= plot.y + plot.h) ?? spots[0]!;
    items.push({ kind: 'text', x: at.x, y: at.y, w: lw, h: 0.2, lines: [{ t: refText, size: 9, bold: true, color: AXIS.reference }], align: at.x > plot.x + 0.1 ? 'right' : 'left', valign: 'middle' });
  }

  // 番号と名前の一覧
  numbered.forEach((b, k) => {
    const col = k % perRow, row = Math.floor(k / perRow);
    items.push({
      kind: 'text', x: plot.x + col * entryW, y: axisY + axisH + 0.06 + row * rowH, w: entryW, h: rowH,
      lines: [{ t: `${numOf.get(b.label)}. ${b.label}`, size: 8, color: SEC }], align: 'left', valign: 'middle',
    });
  });
  return { items, anchors: {} };
};
