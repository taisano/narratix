import type { Locale } from '@/registry';
import type { SceneItem } from '../../scene';
import { QUIET_STEEL_BLUE, SEC, mixColor, textOn } from '../../theme';
import { wrapText } from '../../text';
import { parseCell } from './cells';
import { layoutComparisonTable, lineH, type TableBox } from './comparison';
import type { ComparisonContent, ComparisonLook, HeatLook, HeatPalette } from './types';

/**
 * ヒートマップ型の表（STORY_TABLE_HEATMAP）の配置。表は比較表と同じ（中身も共有）。数のセルだけ、値の大きさで背景の濃さを変える。
 * 濃さは「行ごと／列ごと／表全体」の中で比べる（初めは行ごと：単位の違う指標を同じ物差しで比べないため）。
 * 色は紺の濃淡（Quiet Steel Blue）。プラス・マイナスは0を白に、プラスを紺、マイナスを赤の濃淡。濃いセルの文字は白
 */

export const HEAT_STYLE = {
  light: '#F4F7FA',
  dark: QUIET_STEEL_BLUE[6],
  neg: '#B3261E',
  /** 一番薄い色でも、少しは色が付くように（0..1 のうち使う範囲） */
  from: 0.06,
  to: 1,
} as const;

/** 値 → 濃さ（0..1）。比べる範囲の最小・最大から */
export function heatShade(v: number, lo: number, hi: number, direction: HeatLook['direction']): { t: number; neg: boolean } {
  if (direction === 'diverging') {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return m === 0 ? { t: 0, neg: false } : { t: Math.abs(v) / m, neg: v < 0 };
  }
  if (hi === lo) return { t: 0.5, neg: false };
  const t = (v - lo) / (hi - lo);
  return { t: direction === 'low' ? 1 - t : t, neg: false };
}

/**
 * 色の組み合わせ（一番濃い色・マイナスの色）。navy 以外は明るめ：一番濃くても中くらいの明るさで、文字は濃い色のまま読めることが多い
 */
export const HEAT_PALETTES: Record<HeatPalette, { dark: string; neg: string }> = {
  navy: { dark: QUIET_STEEL_BLUE[6], neg: '#B3261E' },
  sky: { dark: '#5B9BD5', neg: '#E06666' },
  teal: { dark: '#3FA796', neg: '#E06666' },
  amber: { dark: '#E8A33D', neg: '#8E7CC3' },
};

export const heatColor = (t: number, neg: boolean, palette: HeatPalette = 'navy'): string => {
  const H = HEAT_STYLE;
  const p = HEAT_PALETTES[palette] ?? HEAT_PALETTES.navy;
  const k = H.from + (H.to - H.from) * Math.max(0, Math.min(1, t));
  return mixColor(H.light, neg ? p.neg : p.dark, k);
};

/** 数のセルの濃さを計算する（行 i・列 j → 背景色）。比べる範囲に数が1つしかなければ中くらい */
export function heatFills(c: ComparisonContent, look: Pick<HeatLook, 'scale' | 'direction' | 'palette'>): Map<string, string> {
  const rows = c.cells;
  const w = Math.max(0, ...rows.map((r) => r.length));
  const cells: { i: number; j: number; v: number }[] = [];
  rows.forEach((r, i) => {
    if (c.headerRow && i === 0) return;
    for (let j = 0; j < w; j++) {
      if (c.headerCol && j === 0) continue;
      const v = parseCell(r[j] ?? '').value;
      if (v != null) cells.push({ i, j, v });
    }
  });
  const key = (x: { i: number; j: number }) => (look.scale === 'row' ? `r${x.i}` : look.scale === 'col' ? `c${x.j}` : 'all');
  const range = new Map<string, { lo: number; hi: number }>();
  for (const x of cells) {
    const r = range.get(key(x));
    range.set(key(x), r ? { lo: Math.min(r.lo, x.v), hi: Math.max(r.hi, x.v) } : { lo: x.v, hi: x.v });
  }
  const out = new Map<string, string>();
  for (const x of cells) {
    const r = range.get(key(x))!;
    const s = heatShade(x.v, r.lo, r.hi, look.direction);
    out.set(`${x.i}:${x.j}`, heatColor(s.t, s.neg, look.palette));
  }
  return out;
}

const legendText = (look: HeatLook, locale: Locale) => {
  const ja = locale === 'ja';
  const scope = ja ? { row: '行ごと', col: '列ごと', all: '表全体' }[look.scale] : { row: 'by row', col: 'by column', all: 'whole table' }[look.scale];
  if (look.direction === 'diverging') return ja ? `色：左＝マイナス、右＝プラス（濃いほど大きい・${scope}）` : `Color: left = negative, right = positive (darker = larger, ${scope})`;
  if (look.direction === 'low') return ja ? `色：濃いほど小さい（${scope}）` : `Color: darker = smaller (${scope})`;
  return ja ? `色：濃いほど大きい（${scope}）` : `Color: darker = larger (${scope})`;
};

export function layoutHeatmap(c: ComparisonContent, look: HeatLook, area: TableBox, locale: Locale): { items: SceneItem[]; dense: boolean } {
  const items: SceneItem[] = [];
  let top = area.y;
  if (look.showLead && c.lead.trim()) {
    const ls = wrapText(c.lead.trim(), 13, area.w, 2);
    items.push({ kind: 'text', x: area.x, y: top, w: area.w, h: ls.length * lineH(13), lines: ls.map((t) => ({ t, size: 13, color: SEC })), align: 'left', valign: 'top' });
    top += ls.length * lineH(13) + 0.16;
  }
  // 下に凡例・注記の高さを先に取っておく
  const legendH = look.showLegend ? 0.3 : 0;
  const noteLines = c.note.trim() ? wrapText(c.note.trim(), 10, area.w, 2) : [];
  const noteH = noteLines.length * lineH(10);
  const bottom = area.y + area.h - (legendH ? legendH + 0.1 : 0) - (noteH ? noteH + 0.14 : 0);
  const fills = heatFills(c, look);
  const cl: ComparisonLook = { ...look, emphasis: { kind: 'none' } };
  const t = layoutComparisonTable(c, cl, { x: area.x, y: top, w: area.w, h: bottom - top }, {
    fill: (i, j) => fills.get(`${i}:${j}`),
    color: (i, j) => { const f = fills.get(`${i}:${j}`); return f ? textOn(f) : undefined; },
  });
  if (t.item) items.push(t.item);
  let y = top + t.height + 0.14;
  if (legendH) {
    // 凡例：薄い→濃いの小さな5つの箱と、読み方
    const steps = look.direction === 'diverging' ? [[1, true], [0.5, true], [0, false], [0.5, false], [1, false]] as const : [[0, false], [0.25, false], [0.5, false], [0.75, false], [1, false]] as const;
    steps.forEach(([v, neg], k) => items.push({ kind: 'box', x: area.x + k * 0.32, y: y + 0.04, w: 0.3, h: 0.18, fill: heatColor(v, neg, look.palette) }));
    items.push({ kind: 'text', x: area.x + 5 * 0.32 + 0.12, y, w: area.w - 1.8, h: 0.26, lines: [{ t: legendText(look, locale), size: 10, color: SEC }], align: 'left', valign: 'middle' });
    y += legendH + 0.1;
  }
  if (noteH) items.push({ kind: 'text', x: area.x, y, w: area.w, h: noteH, lines: noteLines.map((x) => ({ t: x, size: 10, color: SEC })), align: 'left', valign: 'top' });
  return { items, dense: t.dense };
}

