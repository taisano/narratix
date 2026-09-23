import { describe, expect, it } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { composeSlide } from '@/engine';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import type { Scene, TableItem } from '@/engine/scene';
import { SLIDE_FONTS } from '@/i18n/slide';
import { initialState, toDataset, validateState } from '@/features/mekko-builder/state';
import { buildPptx } from './scene-to-pptx';

const EMU = 914400;

async function slideXml(scenes: Scene[], font = 'Meiryo'): Promise<string[]> {
  const pptx = buildPptx(PptxGenJS, scenes.map((scene) => ({ scene, font })));
  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  return Promise.all(scenes.map((_, i) => zip.file(`ppt/slides/slide${i + 1}.xml`)!.async('string')));
}

const shapes = (xml: string) =>
  [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => {
    const off = m[1]!.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/)!;
    const ext = m[1]!.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/)!;
    const texts = [...m[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]);
    return { x: +off[1]!, y: +off[2]!, w: +ext[1]!, h: +ext[2]!, texts };
  });

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

describe('Scene → PPTX（図形で組む）', () => {
  const s = initialState();
  const scene = composeSlide(validateState(s).spec!, toDataset(s));

  it('すべての図形・文字の位置と大きさがプレビューと同じ（EMU で ±1）', async () => {
    const [xml] = await slideXml([scene]);
    const expected = scene.items.filter((i) => i.kind === 'box' || (i.kind === 'text' && i.lines.some((l) => l.t)));
    const got = shapes(xml!);
    expect(got).toHaveLength(expected.length);
    expected.forEach((it, i) => {
      if (it.kind === 'table') return;
      const g = got[i]!;
      expect(Math.abs(g.x - it.x * EMU), `x of #${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs(g.y - it.y * EMU), `y of #${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs(g.w - it.w * EMU), `w of #${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs(g.h - it.h * EMU), `h of #${i}`).toBeLessThanOrEqual(1);
      expect(g.texts.map((t) => unescape(t!))).toEqual((it.lines ?? []).map((l) => l.t));
    });
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
