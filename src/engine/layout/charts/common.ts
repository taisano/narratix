import { formatMetric, type NumberFormat } from '../../format';
import type { Rect, SceneItem } from '../../scene';
import type { ValueScale } from '../../scale';
import { textWidth, wrapText } from '../../text';
import { AXIS, INK, SEC } from '../../theme';

export interface LegendEntry {
  name: string;
  color: string;
  shape: 'box' | 'line';
}

const LEGEND_ROW = 0.28;

/**
 * パネル上部の帯：左に凡例（入り切らなければ折り返す）、右に注記（単位など）。
 * 返す height の下からチャートを描く。
 */
export function layoutHeader(rect: Rect, entries: LegendEntry[], note: string | null, leftNote: string | null = null): { items: SceneItem[]; height: number } {
  const items: SceneItem[] = [];
  const noteW = note ? Math.min(rect.w * 0.55, textWidth(note, 10) * 1.1 + 0.3) : 0;
  const right = rect.x + rect.w - noteW - (note ? 0.2 : 0);
  let lx = rect.x, row = 0;
  const y = (r: number) => rect.y + r * LEGEND_ROW;
  if (leftNote) {
    const w = textWidth(leftNote, 10) * 1.1 + 0.3;
    items.push({ kind: 'text', x: lx, y: y(0) - 0.03, w, h: 0.24, lines: [{ t: leftNote, size: 10, bold: true, color: INK }], align: 'left', valign: 'middle' });
    lx += w + 0.3;
  }
  for (const e of entries) {
    const tw = textWidth(e.name, 10) + 0.05;
    const need = 0.2 + tw + 0.28;
    if (lx + need > right && lx > rect.x) { row++; lx = rect.x; }
    if (e.shape === 'box') items.push({ kind: 'box', x: lx, y: y(row) + 0.03, w: 0.14, h: 0.14, fill: e.color });
    else items.push({ kind: 'line', x1: lx - 0.02, y1: y(row) + 0.1, x2: lx + 0.16, y2: y(row) + 0.1, color: e.color, width: 2.25 });
    items.push({ kind: 'text', x: lx + 0.2, y: y(row) - 0.03, w: tw + 0.1, h: 0.24, lines: [{ t: e.name, size: 10, color: SEC }], align: 'left', valign: 'middle' });
    lx += need;
  }
  if (note) items.push({ kind: 'text', x: rect.x + rect.w - noteW, y: y(0) - 0.03, w: noteW, h: 0.24, lines: [{ t: note, size: 10, color: SEC }], align: 'right', valign: 'middle' });
  const used = entries.length || note || leftNote;
  return { items, height: used ? (row + 1) * LEGEND_ROW + 0.14 : 0.1 };
}

/** 値の目盛ラベルの幅（縦軸の左の余白） */
export function tickGutter(scale: ValueScale, fmt: (v: number) => string): number {
  return Math.max(0.35, ...scale.ticks.map((t) => textWidth(fmt(t), 9))) + 0.16;
}

export const tickFormatter = (nf: NumberFormat) => (v: number) => formatMetric(v, nf);

/** 縦の値軸：目盛ラベル（左）、目盛線、0 の基準線 */
export function verticalValueAxis(plot: Rect, scale: ValueScale, fmt: (v: number) => string, gridlines: 'off' | 'light' | 'on'): SceneItem[] {
  const items: SceneItem[] = [];
  const yOf = (v: number) => plot.y + plot.h * (1 - scale.ratio(v));
  for (const t of scale.ticks) {
    const y = yOf(t);
    items.push({ kind: 'text', x: plot.x - 1.1, y: y - 0.1, w: 1.02, h: 0.2, lines: [{ t: fmt(t), size: 9, color: AXIS.label }], align: 'right', valign: 'middle' });
    if (gridlines !== 'off' && t !== 0) {
      items.push({ kind: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, color: gridlines === 'on' ? AXIS.gridStrong : AXIS.grid, width: 0.75 });
    }
  }
  const zeroY = yOf(Math.min(Math.max(0, scale.min), scale.max));
  items.push({ kind: 'line', x1: plot.x, y1: zeroY, x2: plot.x + plot.w, y2: zeroY, color: AXIS.base, width: 1 });
  return items;
}

/** 横の値軸（横棒用）：目盛ラベル（下）、目盛線、0 の基準線 */
export function horizontalValueAxis(plot: Rect, scale: ValueScale, fmt: (v: number) => string, gridlines: 'off' | 'light' | 'on'): SceneItem[] {
  const items: SceneItem[] = [];
  const xOf = (v: number) => plot.x + plot.w * scale.ratio(v);
  for (const t of scale.ticks) {
    const x = xOf(t);
    items.push({ kind: 'text', x: x - 0.5, y: plot.y + plot.h + 0.05, w: 1, h: 0.2, lines: [{ t: fmt(t), size: 9, color: AXIS.label }], align: 'center', valign: 'top' });
    if (gridlines !== 'off' && t !== 0) {
      items.push({ kind: 'line', x1: x, y1: plot.y, x2: x, y2: plot.y + plot.h, color: gridlines === 'on' ? AXIS.gridStrong : AXIS.grid, width: 0.75 });
    }
  }
  const zeroX = xOf(Math.min(Math.max(0, scale.min), scale.max));
  items.push({ kind: 'line', x1: zeroX, y1: plot.y, x2: zeroX, y2: plot.y + plot.h, color: AXIS.base, width: 1 });
  return items;
}

/** 横軸の項目名（縦のチャート用）。各項目の幅に2行まで折り返す */
export function categoryLabelsBelow(plot: Rect, labels: string[], size = 10): SceneItem[] {
  const slot = plot.w / Math.max(1, labels.length);
  return labels.map((t, i) => ({
    kind: 'text' as const, x: plot.x + slot * i, y: plot.y + plot.h + 0.06, w: slot, h: 0.4,
    lines: wrapText(t, size, slot - 0.04, 2).map((l) => ({ t: l, size, bold: true, color: INK })),
    align: 'center' as const, valign: 'top' as const,
  }));
}

/** 縦軸の項目名（横棒用）。左の余白に右寄せ */
export function categoryLabelsLeft(plot: Rect, labels: string[], gutterX: number, size = 10): SceneItem[] {
  const slot = plot.h / Math.max(1, labels.length);
  const w = plot.x - gutterX - 0.1;
  return labels.map((t, i) => ({
    kind: 'text' as const, x: gutterX, y: plot.y + slot * i + slot / 2 - 0.2, w, h: 0.4,
    lines: wrapText(t, size, w, 2).map((l) => ({ t: l, size, bold: true, color: INK })),
    align: 'right' as const, valign: 'middle' as const,
  }));
}

/** 横棒の左の余白（項目名の幅。パネル幅の 35% まで） */
export function labelGutter(labels: string[], rectW: number, size = 10): number {
  return Math.min(rectW * 0.35, Math.max(0.6, ...labels.map((l) => textWidth(l, size))) + 0.2);
}

export const CATEGORY_H = 0.45;

/** 横軸の項目名の出し方：自動／小さく／縦書き／間引く（見せ方の「横軸の項目名」） */
export type XLabelMode = 'auto' | 'small' | 'vertical' | 'thin';

/** 単語（空白）の切れ目を優先して折り返す（「2021 Q1」を「2021」「Q1」に）。1語が長すぎる時だけ文字で切る */
export function wrapWords(t: string, size: number, maxW: number, maxLines: number): string[] {
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return wrapText(t, size, maxW, maxLines);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (line && textWidth(next, size) > maxW) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  if (out.some((l) => textWidth(l, size) > maxW) || out.length > maxLines) return wrapText(t, size, maxW, maxLines);
  return out;
}

/**
 * 横軸の項目名（縦棒・折れ線など）。項目が多い時に、小さくする・縦書き・間引くを選べる。
 * h：項目名に使う高さ（プロットの下に取る）。draw(plot)：項目名を置く
 */
export function categoryAxis(mode: XLabelMode | undefined, labels: string[], approxPlotW: number, size0 = 10): { h: number; draw: (plot: Rect) => SceneItem[] } {
  const n = Math.max(1, labels.length);
  const slot0 = approxPlotW / n;
  const fits = (sz: number, w: number) => labels.every((l) => wrapWords(l, sz, w - 0.04, 2).every((x) => textWidth(x, sz) <= w - 0.04) && wrapWords(l, sz, w - 0.04, 2).length <= 2);
  const m: XLabelMode = mode ?? 'auto';
  if (m === 'vertical') {
    const sz = 9;
    const len = Math.min(1.8, Math.max(0.3, ...labels.map((l) => textWidth(l, sz))) + 0.12);
    return {
      h: len + 0.1,
      draw: (plot) => {
        const slot = plot.w / n;
        return labels.map((t, i) => {
          const cx = plot.x + slot * i + slot / 2, cy = plot.y + plot.h + 0.06 + len / 2;
          return { kind: 'text' as const, x: cx - len / 2, y: cy - 0.11, w: len, h: 0.22, lines: [{ t, size: sz, bold: true, color: INK }], align: 'right' as const, valign: 'middle' as const, rotate: -90 };
        });
      },
    };
  }
  const sz = m === 'small' ? 8 : m === 'auto' && !fits(size0, slot0) ? 8 : size0;
  // 間引く：1行に収まるよう、k 個おきに出す（最後の項目は必ず出す）
  const k = m === 'thin' ? Math.max(1, Math.ceil(Math.max(...labels.map((l) => textWidth(l, sz))) / Math.max(0.1, slot0 - 0.06))) : 1;
  return {
    h: CATEGORY_H,
    draw: (plot) => {
      const slot = plot.w / n;
      return labels.map((t, i) => {
        // 最後の項目は必ず出し、そのすぐ手前（重なる所）は出さない
        const shown = k === 1 || i === n - 1 || (i % k === 0 && n - 1 - i >= k);
        const w = k > 1 ? slot * k : slot;
        return {
          kind: 'text' as const, x: plot.x + slot * i + slot / 2 - w / 2, y: plot.y + plot.h + 0.06, w, h: 0.4,
          lines: shown ? (k > 1 ? [t] : wrapWords(t, sz, slot - 0.04, 2)).map((l) => ({ t: l, size: sz, bold: true, color: INK })) : [],
          align: 'center' as const, valign: 'top' as const,
        };
      });
    },
  };
}
