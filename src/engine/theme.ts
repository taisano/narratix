/** 色と文字の既定値（reference/mekko-builder.html と同じ値） */
export const INK = '#16202A';
export const SEC = '#4A5560';
export const WHITE = '#FFFFFF';

// TODO: モノクロ・高コントラスト・ブランド色のパレットは未定義（registry-spec.md「色のルール」要確認）
export const PALETTES: Record<string, { series: string[]; greys: string[] }> = {
  default: {
    series: ['#1F3A5F', '#E07A2F', '#2E8C7A', '#D9A520', '#7A4E8C', '#6F7F8C', '#A8423A', '#6B7A3A'],
    greys: ['#C3CACE', '#D6DBDE', '#B1BAC0', '#E2E6E8'],
  },
};

/**
 * 推移・比較の系列の色（NarratiX の PROFESSIONAL_DISTINCT_PALETTE）。11系列目からはグレー。
 * 構成系（Mekko、積み上げ、100% 積み上げ）は PALETTES.default（Mekko の見本と同じ）を使う。
 */
export const SERIES_PALETTE = ['#1F3B5C', '#2E6C9E', '#0F766E', '#C9822B', '#7A6F9B', '#7A8450', '#8A817C', '#9AA8B5', '#A06E6E', '#6B8C7A'];
export const OVERFLOW_GREYS = ['#666666', '#808080', '#999999', '#B3B3B3', '#CCCCCC', '#E0E0E0'];

/** 強調（NarratiX の FOCUS_*）：対象は濃紺、それ以外はグレー */
export const FOCUS = { primary: '#0B2D4D', otherBar: '#D0D5DA', otherLine: '#D6DDE5' };

/** 目盛線・軸 */
export const AXIS = { grid: '#E7EDF4', gridStrong: '#C9D1D9', base: '#9AA7B5', label: '#5B6675', reference: '#A64A14' };

export function seriesColor(i: number): string {
  return i < SERIES_PALETTE.length ? SERIES_PALETTE[i]! : OVERFLOW_GREYS[(i - SERIES_PALETTE.length) % OVERFLOW_GREYS.length]!;
}

export function palette(id?: string) {
  return PALETTES[id ?? 'default'] ?? PALETTES.default!;
}

// ──────────── 配色のテーマ（docs/decisions.md「配色のテーマ」） ────────────

/** Quiet Steel Blue（Single Hue）：薄い順に7段階。色の値はここだけで持つ */
export const QUIET_STEEL_BLUE = ['#E6EEF4', '#C3D4E1', '#98B4C9', '#6C94B2', '#427497', '#225474', '#123A59'] as const;

/**
 * 配色のテーマ。default＝今までのマルチカラー（値も順番も変えない）。
 * 保存するのはテーマの ID だけ（色の値は保存しない）。古い保存データ・不明な ID は default
 */
export const THEME_IDS = ['default', 'quiet_steel_blue'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const themeIdOf = (v: unknown): ThemeId => ((THEME_IDS as readonly string[]).includes(v as string) ? (v as ThemeId) : 'default');

const Q = QUIET_STEEL_BLUE;
/** 項目の数ごとの使う段階（濃淡の差を十分に取る）。1つだけなら主要系列の色 */
const QSB_PICK: Record<number, number[]> = {
  1: [5], 2: [2, 5], 3: [1, 3, 6], 4: [1, 2, 4, 6], 5: [0, 2, 3, 4, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};
/** 7つを超える時：隣どうしが同じ・近い色にならない順で繰り返す */
const QSB_CYCLE = [1, 4, 2, 5, 3, 6, 0];

/** Single Hue の n 項目分の色（面：棒・積み上げ・Mekko など）。k 番目の項目の色は [k] */
export function singleHueSeries(n: number): string[] {
  if (n <= 7) return (QSB_PICK[Math.max(1, n)] ?? QSB_PICK[7]!).map((i) => Q[i]!);
  return Array.from({ length: n }, (_, k) => Q[QSB_CYCLE[k % QSB_CYCLE.length]!]!);
}
/** Single Hue の n 本分の線の色（白い背景で見えにくい一番薄い段階は使わない） */
export function singleHueLines(n: number): string[] {
  const L6 = Q.slice(1); // 段階2〜7
  if (n <= 1) return [Q[5]!];
  if (n <= 6) return Array.from({ length: n }, (_, k) => L6[Math.round((k * (L6.length - 1)) / (n - 1))]!);
  return Array.from({ length: n }, (_, k) => L6[[0, 3, 1, 4, 2, 5][k % 6]!]!);
}

/**
 * チャートに渡す配色。default では今までの各チャートの色と全く同じ値を返す（値も順番も変えない）。
 * series：構成の面（積み上げ・Mekko・100%）、face：系列の棒、line：線・点、primary：1色だけの時、
 * secondary：比べる相手（前期など）、groups：グループの色、bubble：グループが無いバブル
 */
export interface ChartPalette {
  id: ThemeId;
  series: string[];
  greys: string[];
  face: (i: number) => string;
  line: (i: number) => string;
  primary: string;
  secondary: string;
  groups: (n: number) => string[];
  groupEmpty: string;
  bubble: string;
  /** 増減の棒のプラスの色。標準は緑（良し悪し）。ストーリーの色（tone=story）では主要の色（マイナスは赤のまま） */
  up: string;
}

/** 色の使い方。story＝ストーリーの全スライドで色の意味をそろえる（良し悪しの緑を使わず、プラスは主要の色） */
export type ColorTone = 'story';
const DIFF_UP = '#2E7D32';

/** default のグループの色（散布図・バブル・幅が変わる縦棒・スロープの強調） */
export const GROUP_DEFAULT = ['#0B2D4D', '#E67E22', '#0F766E', '#8E44AD', '#D64545', '#1D4ED8', '#059669', '#B45309'];
const GROUP_EMPTY = '#B8C0CA';
const cycle = (arr: readonly string[], n: number) => Array.from({ length: n }, (_, k) => arr[k % arr.length]!);

/** テーマと項目の数から配色を決める（項目の数で濃淡の選び方が変わるため、パネルごとに作る） */
export function chartPalette(id: ThemeId, n: number, tone?: ColorTone): ChartPalette {
  const p = basePalette(id, n);
  return { ...p, up: tone === 'story' ? p.primary : DIFF_UP };
}

function basePalette(id: ThemeId, n: number): Omit<ChartPalette, 'up'> {
  if (id === 'quiet_steel_blue') {
    const faces = singleHueSeries(n);
    const lines = singleHueLines(n);
    return {
      id, series: faces, greys: PALETTES.default!.greys,
      face: (i) => faces[i % faces.length]!,
      line: (i) => lines[i % lines.length]!,
      primary: Q[5]!, secondary: Q[2]!,
      // グループは点・線なので一番薄い段階は使わない
      groups: (k) => singleHueLines(k),
      groupEmpty: GROUP_EMPTY, bubble: Q[4]!,
    };
  }
  return {
    id, ...PALETTES.default!, face: seriesColor, line: seriesColor,
    primary: FOCUS.primary, secondary: '#9AA8B5',
    groups: (k) => cycle(GROUP_DEFAULT, k), groupEmpty: GROUP_EMPTY, bubble: '#5B7FA6',
  };
}

/** 特定の項目を強調する色（Plus）。プリセットだけ（色の値は ID から決める） */
export const ACCENT_COLORS = { navy: '#0B2D4D', red: '#C83C32', orange: '#D9772A', teal: '#187F78', purple: '#70509B', gold: '#C5961A' } as const;
export type AccentId = keyof typeof ACCENT_COLORS;
export const accentOf = (v: unknown): string | null => (typeof v === 'string' && v in ACCENT_COLORS ? ACCENT_COLORS[v as AccentId] : null);
/**
 * 1つだけ強調した時の色。選んでいなければ（古い「なし」も）紺（今までの強調の色）。強調した項目だけこの色にし、ほかは薄いグレーにする
 */
export const highlightAccent = (v: unknown): string => accentOf(v) ?? ACCENT_COLORS.navy;

/** 成長率表のセル色（行ごとに正規化する） */
export const HEAT = {
  empty: '#F1F3F2',
  posLow: '#EAF0F7',
  posHigh: '#1F3A5F',
  negLow: '#FBEDE4',
  negHigh: '#A64A14',
};

/** 相対輝度（WCAG） */
export function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 背景色に対して読める文字色（白か濃紺） */
export const textOn = (hex: string) => (lum(hex) < 0.3 ? WHITE : INK);

/** 2色の線形補間 */
export function mixColor(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('');
}
