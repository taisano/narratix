import type { SceneItem, TextLine } from './scene';

export const FONT_SCALE_IDS = ['small', 'standard', 'large'] as const;
export type FontScaleId = (typeof FONT_SCALE_IDS)[number];

export const FONT_SCALE_MIN = 0.6;
export const FONT_SCALE_MAX = 1.5;
export const FONT_SCALE_STEP = 0.1;

export const fontScaleIdOf = (value: unknown): FontScaleId =>
  typeof value === 'string' && (FONT_SCALE_IDS as readonly string[]).includes(value) ? value as FontScaleId : 'standard';

/** 数値は新しい段階調整、文字列は保存済みデータとの互換用。 */
export const fontScaleOf = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
  return ({ small: 0.9, standard: 1, large: 1.1 })[fontScaleIdOf(value)];
};

export const stepFontScale = (value: unknown, direction: -1 | 1): number => {
  const next = fontScaleOf(value) + direction * FONT_SCALE_STEP;
  return Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next)) * 10) / 10;
};

const scaleLine = (line: TextLine, scale: number): TextLine => ({
  ...line,
  size: Math.round(line.size * scale * 10) / 10,
  ...(line.tail ? { tail: { ...line.tail, size: Math.round(line.tail.size * scale * 10) / 10 } } : {}),
});

/** 配置は変えず、チャート・表・言葉の本体に含まれる文字だけを拡大縮小する。 */
export function scaleSceneText(items: SceneItem[], value: unknown): SceneItem[] {
  const scale = fontScaleOf(value);
  if (scale === 1) return items;
  return items.map((item) => {
    if (item.kind === 'table') return { ...item, rows: item.rows.map((row) => row.map((cell) => ({ ...cell, size: Math.round(cell.size * scale * 10) / 10 }))) };
    if (item.kind === 'text' || item.kind === 'box') return item.lines ? { ...item, lines: item.lines.map((line) => scaleLine(line, scale)) } : item;
    return item;
  });
}
