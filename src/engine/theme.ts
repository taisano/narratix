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

export function palette(id?: string) {
  return PALETTES[id ?? 'default'] ?? PALETTES.default!;
}

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
