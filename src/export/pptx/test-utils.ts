import { expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { itemBox, type Scene, type SceneItem, type TableItem } from '@/engine/scene';
import { buildPptx } from './scene-to-pptx';

const EMU = 914400;

export async function slideXml(scenes: Scene[], font = 'Meiryo'): Promise<string[]> {
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
    const geom = m[1]!.match(/prstGeom prst="(\w+)"/)?.[1];
    const flipV = /<a:xfrm[^>]*flipV="1"/.test(m[1]!);
    return { x: +off[1]!, y: +off[2]!, w: +ext[1]!, h: +ext[2]!, texts, geom, flipV };
  });

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** PPTX の図形に1対1で対応する Scene のアイテム（文字のないテキストは置かない） */
const drawn = (scene: Scene) =>
  scene.items.filter((i): i is Exclude<SceneItem, TableItem> => i.kind !== 'table' && !(i.kind === 'text' && !i.lines.some((l) => l.t)));

/** Scene の全アイテムが、同じ位置・大きさ・文字で PPTX に置かれているか */
export async function expectPptxMatches(scene: Scene) {
  const [xml] = await slideXml([scene]);
  const expected = drawn(scene);
  const got = shapes(xml!);
  expect(got).toHaveLength(expected.length);
  expected.forEach((it, i) => {
    const g = got[i]!;
    const b = itemBox(it);
    expect(Math.abs(g.x - b.x * EMU), `x of #${i} ${it.kind}`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.y - b.y * EMU), `y of #${i} ${it.kind}`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.w - b.w * EMU), `w of #${i} ${it.kind}`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.h - b.h * EMU), `h of #${i} ${it.kind}`).toBeLessThanOrEqual(1);
    if (it.kind === 'line') {
      expect(g.geom).toBe('line');
      // 右上がりの線は上下反転で表す
      expect(g.flipV, `flip of #${i}`).toBe((it.x2 - it.x1) * (it.y2 - it.y1) < 0);
    } else if (it.kind === 'ellipse') {
      expect(g.geom).toBe('ellipse');
    } else {
      expect(g.texts.map((t) => unescape(t!))).toEqual((it.lines ?? []).map((l) => l.t));
    }
  });
}

