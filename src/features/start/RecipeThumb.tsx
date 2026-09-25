import type { ReactNode } from 'react';
import { registry, type ChartTypeId, type Panel, type RecipeDef } from '@/registry';
import { computeSlots } from '@/engine/layout/slots';

/**
 * レシピの構成を示す抽象的な図（データを入れる前なので、名前・数値・結論に見えるものは描かない）。
 * レシピのレイアウトとパネルから描くので、レシピを足しても図を別に作る必要はない。
 */

const INK = '#1F3A5F';
const MID = '#5B7896';
const LIGHT = '#9AA7B5';
const PALE = '#C3CACE';
const W = 160;
const H = 90;

type Box = { x: number; y: number; w: number; h: number };

const rect = (b: Box, fx: number, fy: number, fw: number, fh: number, fill: string, key: string) => (
  <rect key={key} x={b.x + fx * b.w} y={b.y + fy * b.h} width={Math.max(0.5, fw * b.w)} height={Math.max(0.5, fh * b.h)} fill={fill} rx={0.6} />
);
const poly = (b: Box, pts: [number, number][], stroke: string, key: string, width = 1.6) => (
  <polyline key={key} points={pts.map(([x, y]) => `${b.x + x * b.w},${b.y + y * b.h}`).join(' ')} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" />
);
const base = (b: Box, key: string) => <line key={key} x1={b.x} x2={b.x + b.w} y1={b.y + b.h} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />;

/** チャートの種類ごとの抽象的な形（0〜1 の座標で描き、枠に合わせて伸ばす） */
function glyph(chart: ChartTypeId, b: Box, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  const stack = (x: number, w: number, parts: number[], top: number, colors = [INK, MID, LIGHT, PALE]) => {
    let y = 1;
    parts.forEach((p, i) => { const h = p * (1 - top); y -= h; out.push(rect(b, x, y, w, h, colors[i % colors.length]!, `${k}s${x}-${i}`)); });
  };
  switch (chart) {
    case 'line':
      out.push(base(b, `${k}b`), poly(b, [[0, 0.55], [0.33, 0.45], [0.66, 0.32], [1, 0.12]], INK, `${k}1`), poly(b, [[0, 0.62], [0.33, 0.6], [0.66, 0.55], [1, 0.5]], MID, `${k}2`), poly(b, [[0, 0.85], [0.33, 0.82], [0.66, 0.8], [1, 0.74]], LIGHT, `${k}3`));
      break;
    case 'column_trend':
      [0, 1, 2, 3].forEach((i) => { out.push(rect(b, 0.04 + i * 0.25, 0.5 - i * 0.1, 0.09, 0.5 + i * 0.1, INK, `${k}a${i}`), rect(b, 0.14 + i * 0.25, 0.7 - i * 0.05, 0.09, 0.3 + i * 0.05, LIGHT, `${k}b${i}`)); });
      out.push(base(b, `${k}b`));
      break;
    case 'bar_trend':
      [0, 1, 2, 3].forEach((i) => { out.push(rect(b, 0, 0.04 + i * 0.25, 0.5 + i * 0.12, 0.09, INK, `${k}a${i}`), rect(b, 0, 0.14 + i * 0.25, 0.3 + i * 0.06, 0.09, LIGHT, `${k}b${i}`)); });
      break;
    case 'stacked_column':
      [0, 1, 2, 3, 4].forEach((i) => stack(0.04 + i * 0.2, 0.13, [0.45, 0.33, 0.22], 0.45 - i * 0.1));
      out.push(base(b, `${k}b`));
      break;
    case 'stacked_100':
      [0, 1, 2, 3, 4].forEach((i) => stack(0.04 + i * 0.2, 0.13, [0.45 - i * 0.03, 0.33, 0.22 + i * 0.03], 0));
      break;
    case 'bar_rank':
      [0.95, 0.8, 0.62, 0.45, 0.3].forEach((w, i) => out.push(rect(b, 0, 0.03 + i * 0.2, w, 0.13, i === 0 ? INK : LIGHT, `${k}${i}`)));
      break;
    case 'column_compare':
      [0.95, 0.8, 0.62, 0.45, 0.3].forEach((h, i) => out.push(rect(b, 0.04 + i * 0.2, 1 - h, 0.13, h, i === 0 ? INK : LIGHT, `${k}${i}`)));
      out.push(base(b, `${k}b`));
      break;
    case 'clustered_column':
      [0, 1, 2, 3, 4].forEach((i) => { const a = 0.5 + ((i * 7) % 5) * 0.08; out.push(rect(b, 0.03 + i * 0.2, 1 - a * 0.8, 0.07, a * 0.8, LIGHT, `${k}a${i}`), rect(b, 0.1 + i * 0.2, 1 - a, 0.07, a, INK, `${k}b${i}`)); });
      out.push(base(b, `${k}b`));
      break;
    case 'variance_bar':
      out.push(<line key={`${k}z`} x1={b.x + b.w * 0.45} x2={b.x + b.w * 0.45} y1={b.y} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />);
      [0.4, 0.25, 0.1, -0.15, -0.3].forEach((v, i) => out.push(rect(b, v >= 0 ? 0.45 : 0.45 + v, 0.03 + i * 0.2, Math.abs(v), 0.13, v >= 0 ? INK : LIGHT, `${k}${i}`)));
      break;
    case 'mekko': {
      let x = 0;
      [0.3, 0.26, 0.2, 0.14, 0.1].forEach((w, i) => { stack(x, w - 0.015, [0.4 - i * 0.03, 0.3, 0.3 + i * 0.03], 0); x += w; });
      break;
    }
    case 'bar_100':
      [0, 1].forEach((r) => { let x = 0; [0.4 - r * 0.08, 0.3, 0.3 + r * 0.08].forEach((w, i) => { out.push(rect(b, x, 0.15 + r * 0.45, w - 0.01, 0.28, [INK, MID, LIGHT][i]!, `${k}${r}-${i}`)); x += w; }); });
      break;
    case 'slope':
      out.push(<line key={`${k}l`} x1={b.x + b.w * 0.15} x2={b.x + b.w * 0.15} y1={b.y} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />, <line key={`${k}r`} x1={b.x + b.w * 0.85} x2={b.x + b.w * 0.85} y1={b.y} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />);
      [[0.3, 0.15], [0.45, 0.55], [0.7, 0.4], [0.85, 0.8]].forEach(([a, c], i) => out.push(poly(b, [[0.15, a!], [0.85, c!]], i === 0 ? INK : LIGHT, `${k}${i}`)));
      break;
    case 'waterfall': {
      const steps: [number, number, string][] = [[0, 0.55, INK], [0.55, 0.75, MID], [0.75, 0.85, MID], [0.85, 0.7, '#C9822B'], [0.7, 0.62, '#C9822B'], [0, 0.62, INK]];
      steps.forEach(([a, c], i) => { const lo = Math.min(a, c), hi = Math.max(a, c); out.push(rect(b, 0.02 + i * 0.165, 1 - hi, 0.12, hi - lo, steps[i]![2], `${k}w${i}`)); });
      out.push(base(b, `${k}b`));
      break;
    }
    case 'driver_bar':
      out.push(<line key={`${k}z`} x1={b.x + b.w * 0.4} x2={b.x + b.w * 0.4} y1={b.y} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />);
      [0.5, 0.3, 0.15, -0.25, -0.12].forEach((v, i) => out.push(rect(b, v >= 0 ? 0.4 : 0.4 + v, 0.03 + i * 0.2, Math.abs(v), 0.13, v >= 0 ? MID : '#C9822B', `${k}${i}`)));
      break;
    case 'posneg_bar':
      out.push(rect(b, 0, 0, 0.47, 0.14, '#EAF4FB', `${k}ph`), rect(b, 0.53, 0, 0.47, 0.14, '#FFF0E5', `${k}nh`));
      [0.4, 0.28, 0.15].forEach((w, i) => out.push(rect(b, 0.02, 0.24 + i * 0.25, w, 0.13, MID, `${k}p${i}`)));
      [0.35, 0.18].forEach((w, i) => out.push(rect(b, 0.55, 0.24 + i * 0.25, w, 0.13, '#C9822B', `${k}n${i}`)));
      break;
    case 'scatter':
    case 'bubble': {
      out.push(<line key={`${k}ax`} x1={b.x} x2={b.x + b.w} y1={b.y + b.h} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />, <line key={`${k}ay`} x1={b.x} x2={b.x} y1={b.y} y2={b.y + b.h} stroke={PALE} strokeWidth={0.8} />);
      const pts: [number, number, number][] = [[0.12, 0.8, 0.05], [0.25, 0.62, 0.09], [0.4, 0.55, 0.06], [0.52, 0.42, 0.12], [0.68, 0.35, 0.07], [0.82, 0.18, 0.1], [0.3, 0.3, 0.05]];
      pts.forEach(([x, y, r], i) => out.push(<circle key={`${k}c${i}`} cx={b.x + x * b.w} cy={b.y + y * b.h} r={chart === 'bubble' ? r * b.h : 2.2} fill={chart === 'bubble' ? '#5B7FA6' : INK} fillOpacity={chart === 'bubble' ? 0.85 : 1} />));
      break;
    }
    default:
      out.push(rect(b, 0, 0, 1, 1, '#EEF1F0', `${k}x`));
  }
  return out;
}

/** 表：見出しと行（中身は描かない） */
function tableGlyph(b: Box, k: string): ReactNode[] {
  const out: ReactNode[] = [rect(b, 0, 0, 1, 0.14, PALE, `${k}h`)];
  for (let i = 0; i < 5; i++) {
    out.push(rect(b, 0.02, 0.22 + i * 0.16, 0.42, 0.07, '#DDE2E1', `${k}n${i}`), rect(b, 0.56, 0.22 + i * 0.16, 0.38, 0.07, MID, `${k}v${i}`));
  }
  return out;
}

/** チャートの中の補完パーツの目印（平均線・CAGR 注記・合計ラベル） */
function complementMarks(p: Panel, b: Box, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  for (const c of p.inChartComplements ?? []) {
    if (c.id === 'reference_line') {
      out.push(<line key={`${k}ref`} x1={b.x} x2={b.x + b.w} y1={b.y + b.h * 0.42} y2={b.y + b.h * 0.42} stroke="#C9822B" strokeWidth={1} strokeDasharray="3 2" />);
    }
    if (c.id === 'cagr_note') {
      [0, 1, 2].forEach((i) => out.push(rect(b, 0.88, 0.1 + i * 0.28, 0.12, 0.06, '#C9822B', `${k}cagr${i}`)));
    }
    if (c.id === 'quadrants') {
      out.push(<line key={`${k}qx`} x1={b.x + b.w * 0.5} x2={b.x + b.w * 0.5} y1={b.y} y2={b.y + b.h} stroke="#C9822B" strokeWidth={1} strokeDasharray="3 2" />, <line key={`${k}qy`} x1={b.x} x2={b.x + b.w} y1={b.y + b.h * 0.5} y2={b.y + b.h * 0.5} stroke="#C9822B" strokeWidth={1} strokeDasharray="3 2" />);
    }
    if (c.id === 'total_labels') {
      out.push(<line key={`${k}tot`} x1={b.x} x2={b.x + b.w} y1={b.y - 2} y2={b.y - 2} stroke="#C9822B" strokeWidth={1.4} strokeDasharray="4 3" />);
    }
  }
  return out;
}

export function RecipeThumb({ recipe, extra = [], className }: { recipe: RecipeDef; extra?: string[]; className?: string }) {
  const layout = registry.layouts[recipe.view.layout.id];
  const slots = computeSlots(layout, recipe.view.layout.ratios, { x: 6, y: 8, w: W - 16, h: H - 14 }, { gap: () => 8 });
  const items: ReactNode[] = [];
  recipe.view.panels.forEach((p, i) => {
    const s = slots[p.slot];
    if (!s) return;
    const k = `p${i}`;
    if (p.kind === 'table') items.push(...tableGlyph(s, k));
    else if (p.chart) {
      items.push(...glyph(p.chart, s, k));
      const withExtra: Panel = p.id === 'main' ? { ...p, inChartComplements: [...(p.inChartComplements ?? []), ...extra.map((id) => ({ id: id as never }))] } : p;
      items.push(...complementMarks(withExtra, s, k));
    }
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={W} height={H} fill="#FFFFFF" />
      {items}
    </svg>
  );
}
