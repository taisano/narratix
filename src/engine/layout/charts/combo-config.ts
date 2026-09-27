import { ACCENT_COLORS, QUIET_STEEL_BLUE as Q, type ChartPalette } from '../../theme';

/**
 * 縦棒＋折れ線（combo）の系列ごとの設定。保存するのは ID と名前だけ（色も ID）。
 * 配列の順＝凡例・棒の並び・線の描く順。設定に無い系列は、名前から推定した既定で後ろに足す
 */
export interface ComboSeriesConfig {
  name: string;
  as?: 'column' | 'line';
  axis?: 'left' | 'right';
  hidden?: boolean;
  /** 'auto'｜'p0'〜'p9'（テーマの色の番号）｜強調の色の ID（red など） */
  color?: string;
  label?: ComboLabel;
  line?: 'solid' | 'dash' | 'dot';
  marker?: 'none' | 'circle' | 'square' | 'diamond';
}
export type ComboLabel = 'none' | 'all' | 'ends' | 'last';

export interface ComboSeries {
  name: string;
  /** データの列の位置 */
  col: number;
  as: 'column' | 'line';
  axis: 'left' | 'right';
  hidden: boolean;
  color: string;
  colorId: string;
  label: ComboLabel;
  line: 'solid' | 'dash' | 'dot';
  marker: 'none' | 'circle' | 'square' | 'diamond';
  /** 率（%）の系列か（名前から推定）。増減はポイント差で出す */
  rate: boolean;
  /** 予算・目標・計画の系列か（実績より淡い色にする） */
  plan: boolean;
}

const RATE = /[%％]|率|比率|割合|シェア|margin|rate|ratio|share|percent|pct|yield/i;
const PLAN = /予算|目標|計画|見込|target|plan|budget|forecast/i;
const MARKERS: ComboSeries['marker'][] = ['circle', 'diamond', 'square', 'circle'];
const LINE_STYLES: ComboSeries['line'][] = ['solid', 'solid', 'dash', 'dot'];

/** 名前から率の系列か（％・率・Margin・Rate・Share など） */
export const isRateName = (name: string) => RATE.test(name);
export const isPlanName = (name: string) => PLAN.test(name);

/** 実績の色を淡くした色（予算・目標の既定） */
export function tint(hex: string, k = 0.5): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** 色の ID → 色（テーマ・自動の番号から） */
export function comboColor(id: string | undefined, pal: ChartPalette, autoIndex: number, as: 'column' | 'line' = 'column', k = autoIndex): string {
  if (id && id in ACCENT_COLORS) return ACCENT_COLORS[id as keyof typeof ACCENT_COLORS];
  const m = id?.match(/^p(\d+)$/);
  if (m) return pal.face(+m[1]!);
  // 単色の濃淡のテーマ：棒は中間の濃さ、線は濃い段階（薄い色の線は見えないため）
  if (pal.id === 'quiet_steel_blue') return as === 'column' ? Q[[3, 2, 4, 1][k % 4]!]! : Q[[6, 5, 4][k % 3]!]!;
  return pal.face(autoIndex);
}

/**
 * 設定と列から、描く系列の一覧（順番どおり）を作る。
 * 既定：率の系列は折れ線・右軸、それ以外は縦棒・左軸（予算・目標は実績と同じ形・軸で淡い色）。
 * 既定の並びは棒の系列のあとに線の系列
 */
export function resolveComboSeries(cols: readonly string[], config: readonly ComboSeriesConfig[] | undefined, pal: ChartPalette): ComboSeries[] {
  const cfg = (Array.isArray(config) ? config : []).filter((c) => c && typeof c.name === 'string' && cols.includes(c.name));
  const listed = cfg.map((c) => c.name);
  const rest = cols.filter((c) => !listed.includes(c));
  // 設定に無い系列：棒 → 線の順で後ろに
  const restSorted = [...rest.filter((n) => !isRateName(n)), ...rest.filter((n) => isRateName(n))];
  const order = [...cfg, ...restSorted.map((name) => ({ name }) as ComboSeriesConfig)];
  let nCol = 0, nLine = 0;
  const colCount = order.filter((c) => (c.as ?? (isRateName(c.name) ? 'line' : 'column')) === 'column').length;
  const out: ComboSeries[] = [];
  for (const c of order) {
    const rate = isRateName(c.name);
    const plan = isPlanName(c.name);
    const as = c.as ?? (rate ? 'line' : 'column');
    const axis = c.axis ?? (rate ? 'right' : 'left');
    // 自動の色：棒は 0 番から、線は棒の後ろの番号から（棒と線が同じ色にならない）
    const kind = as === 'column' ? nCol : nLine;
    const autoIndex = as === 'column' ? nCol++ : colCount + nLine++;
    let color = comboColor(c.color, pal, autoIndex, as, kind);
    // 予算・目標で色が自動なら、同じ形の直前の系列（実績）を淡くした色
    if (plan && (!c.color || c.color === 'auto')) {
      const actual = [...out].reverse().find((s) => s.as === as && !s.plan);
      if (actual) color = as === 'column' ? tint(actual.color, 0.55) : actual.color;
    }
    const k = as === 'line' ? nLine - 1 : 0;
    out.push({
      name: c.name, col: cols.indexOf(c.name), as, axis, hidden: !!c.hidden,
      color, colorId: c.color ?? 'auto',
      label: c.label ?? (as === 'line' ? 'last' : 'none'),
      line: c.line ?? (as === 'line' && plan ? 'dash' : LINE_STYLES[k % LINE_STYLES.length]!),
      marker: c.marker ?? MARKERS[k % MARKERS.length]!,
      rate, plan,
    });
  }
  return out;
}

/** 軸の数値（手入力）。空・数でなければ null＝自動 */
export const axisNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const t = v.replace(/[,，\s]/g, '').replace(/[％%]$/, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
