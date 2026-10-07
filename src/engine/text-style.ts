import type { SceneItem, TextLine } from './scene';

export const FONT_SCALE_IDS = ['small', 'standard', 'large'] as const;
export type FontScaleId = (typeof FONT_SCALE_IDS)[number];

export const fontScaleIdOf = (value: unknown): FontScaleId =>
  typeof value === 'string' && (FONT_SCALE_IDS as readonly string[]).includes(value) ? value as FontScaleId : 'standard';

export const fontScaleOf = (value: unknown): number => ({ small: 0.9, standard: 1, large: 1.1 })[fontScaleIdOf(value)];

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

