import { describe, expect, it } from 'vitest';
import type { SceneItem } from './scene';
import { fontScaleOf, scaleSceneText, stepFontScale } from './text-style';

describe('chart/table text scale', () => {
  it('supports three restrained sizes', () => {
    expect(fontScaleOf('small')).toBe(0.9);
    expect(fontScaleOf(undefined)).toBe(1);
    expect(fontScaleOf('large')).toBe(1.1);
  });

  it('steps numeric sizes between 60% and 150%', () => {
    expect(stepFontScale(undefined, -1)).toBe(0.9);
    expect(stepFontScale(0.6, -1)).toBe(0.6);
    expect(stepFontScale(1.4, 1)).toBe(1.5);
    expect(stepFontScale(1.5, 1)).toBe(1.5);
    expect(fontScaleOf(9)).toBe(1.5);
  });

  it('scales text and table cells without moving geometry', () => {
    const items: SceneItem[] = [
      { kind: 'text', x: 1, y: 2, w: 3, h: 1, lines: [{ t: 'x', size: 10 }], align: 'left', valign: 'top' },
      { kind: 'table', x: 0, y: 0, rowH: 1, colW: [4], rows: [[{ text: 'y', fill: null, color: '#000', align: 'left', size: 8, bold: false }]] },
    ];
    const scaled = scaleSceneText(items, 'large');
    expect(scaled[0]).toMatchObject({ x: 1, y: 2, w: 3, h: 1, lines: [{ size: 11 }] });
    expect(scaled[1]).toMatchObject({ x: 0, y: 0, rows: [[{ size: 8.8 }]] });
  });
});
