import { describe, expect, it } from 'vitest';
import { composeSlide } from '@/engine';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import type { Scene, TableItem } from '@/engine/scene';
import { SLIDE_FONTS } from '@/i18n/slide';
import { initialState, toDataset, validateState } from '@/features/mekko-builder/state';
import { expectPptxMatches, slideXml } from './test-utils';

const EMU = 914400;
describe('Scene → PPTX（図形で組む）', () => {
  const s = initialState();
  const scene = composeSlide(validateState(s).spec!, toDataset(s));

  it('すべての図形・文字の位置と大きさがプレビューと同じ（EMU で ±1）', async () => {
    await expectPptxMatches(scene);
  });

  it('線と点：位置・向き（右上がり／右下がり）が同じ', async () => {
    const lines: Scene = {
      width: 13.333, height: 7.5, warnings: [],
      items: [
        { kind: 'line', x1: 1, y1: 3, x2: 2, y2: 2, color: '#000000', width: 2 },
        { kind: 'line', x1: 2, y1: 2, x2: 3, y2: 4, color: '#000000', width: 2, dash: true },
        { kind: 'line', x1: 1, y1: 5, x2: 6, y2: 5, color: '#9AA7B5', width: 1 },
        { kind: 'ellipse', x: 1.95, y: 1.95, w: 0.1, h: 0.1, fill: '#0B2D4D' },
      ],
    };
    await expectPptxMatches(lines);
  });

  it('揃えた表の位置・列幅が Mekko の列と同じ', async () => {
    const [xml] = await slideXml([scene]);
    const table = scene.items.find((i): i is TableItem => i.kind === 'table')!;
    const frame = xml!.match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/)![0];
    const off = frame.match(/<a:off x="(\d+)" y="(\d+)"\/>/)!;
    expect(Math.abs(+off[1]! - table.x * EMU)).toBeLessThanOrEqual(1);
    expect(Math.abs(+off[2]! - table.y * EMU)).toBeLessThanOrEqual(1);
    const cols = [...frame.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => +m[1]!);
    expect(cols).toHaveLength(table.colW.length);
    cols.forEach((w, i) => expect(Math.abs(w - table.colW[i]! * EMU)).toBeLessThanOrEqual(1));
    expect(frame).toContain('市場全体 CAGR');
  });

  it('スライドの言語のフォントを使い、表セルの余白はインチで渡す', async () => {
    const [xml] = await slideXml([scene], SLIDE_FONTS.en);
    expect(xml).toContain('typeface="Arial"');
    // margin 0.05in = 45720 EMU（pt として扱われると 635 EMU になり文字が潰れる）
    expect(xml).toMatch(/marL="45720"/);
  });

  it('元データのスライドを2枚目に付けられる', async () => {
    const data = layoutDataSlide(toDataset(s), 'ja');
    const [, xml2] = await slideXml([scene, data]);
    expect(xml2).toContain('元データ（単位：百万ドル）');
    expect(xml2).toContain('2021年');
    expect(xml2).toContain('3,600'); // 中国の2025年合計
  });
});
