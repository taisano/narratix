import { describe, expect, it } from 'vitest';
import { sceneToSvg } from './scene-to-svg';
import type { Scene } from '@/engine/scene';

const scene: Scene = {
  width: 13.333, height: 7.5, warnings: [],
  items: [
    { kind: 'text', x: 0.5, y: 0.32, w: 12, h: 0.78, lines: [{ t: 'A & <B>', size: 20, bold: true }], align: 'left', valign: 'top' },
    { kind: 'box', x: 1, y: 1, w: 2, h: 1, fill: '#1F3A5F', line: '#FFFFFF', lines: [{ t: '40%', size: 11, color: '#FFFFFF' }], align: 'center', valign: 'middle' },
    { kind: 'table', x: 0.5, y: 6, colW: [1.75, 2], rowH: 0.34, rows: [[
      { text: '市場全体 CAGR', fill: null, color: '#16202A', align: 'left', size: 10, bold: true },
      { text: '12.0%', fill: '#EAF0F7', color: '#16202A', align: 'center', size: 10.5, bold: false },
    ]] },
  ],
};

describe('sceneToSvg', () => {
  const svg = sceneToSvg(scene);
  it('16:9 の viewBox（96px/インチ）', () => {
    expect(svg).toContain('viewBox="0 0 1280 720"');
  });
  it('文字をエスケープする', () => {
    expect(svg).toContain('A &amp; &lt;B&gt;');
    expect(svg).not.toContain('<B>');
  });
  it('図形・表の位置をインチから px に換算する', () => {
    expect(svg).toContain('<rect x="96" y="96" width="192" height="96" fill="#1F3A5F" stroke="#FFFFFF"');
    expect(svg).toContain('<rect x="216" y="576" width="192" height="32.6" fill="#EAF0F7"');
    expect(svg).toContain('>市場全体 CAGR</text>');
  });
});
