import type PptxGenJS from 'pptxgenjs';
import type { BoxItem, Scene, TextItem, TextLine } from '@/engine/scene';

const hex = (c: string) => c.replace('#', '').toUpperCase();

/** Scene に入れる1枚分 */
export interface PptxSlide {
  scene: Scene;
  /** フォント名（スライドの言語で決める） */
  font: string;
}

function runs(lines: TextLine[]) {
  return lines.map((l, i) => ({
    text: l.t,
    options: { fontSize: l.size, bold: !!l.bold, color: hex(l.color ?? '#16202A'), breakLine: i < lines.length - 1 },
  }));
}

const hasText = (lines?: TextLine[]) => !!lines && lines.some((l) => l.t !== '');

/**
 * Scene を「図形で組む（shapes）」方式でスライドに置く。
 * 位置はプレビューと同じインチ値をそのまま使う（PptxGenJS 3.12：テキストの margin は pt、表セルの margin はインチ）。
 */
export function addSceneToSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, { scene, font }: PptxSlide) {
  slide.background = { color: 'FFFFFF' };
  for (const it of scene.items) {
    if (it.kind === 'table') {
      const border = it.border ?? { color: '#FFFFFF', pt: 1 };
      slide.addTable(
        it.rows.map((row) => row.map((c) => ({
          text: c.text,
          options: {
            fill: c.fill ? { color: hex(c.fill) } : undefined,
            color: hex(c.color), align: c.align, bold: c.bold, fontSize: c.size, fontFace: font,
            valign: 'middle' as const, margin: [0, 0.05, 0, 0.05] as [number, number, number, number],
          },
        }))),
        { x: it.x, y: it.y, colW: it.colW, rowH: it.rowH, border: { type: 'solid', pt: border.pt, color: hex(border.color) } },
      );
      continue;
    }
    const base = {
      x: it.x, y: it.y, w: it.w, h: it.h, fontFace: font,
      align: (it as TextItem).align ?? 'center', valign: (it.valign === 'top' ? 'top' : 'middle') as 'top' | 'middle', margin: 0,
    };
    if (it.kind === 'box') {
      const b = it as BoxItem;
      const o = { ...base, shape: pptx.ShapeType.rect, fill: { color: hex(b.fill) }, line: b.line ? { color: hex(b.line), width: 1 } : { type: 'none' as const } };
      if (hasText(b.lines)) slide.addText(runs(b.lines!), o);
      else slide.addShape(pptx.ShapeType.rect, o);
    } else if (hasText(it.lines)) {
      slide.addText(runs(it.lines), { ...base, fit: 'none' });
    }
  }
}

/** 複数枚の Scene から PPTX を組み立てる。PptxGenJS は呼び出し側から渡す（ブラウザでは押した時に読み込むため） */
export function buildPptx(Pptx: typeof PptxGenJS, slides: PptxSlide[], meta: { title?: string } = {}): PptxGenJS {
  const pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE';
  if (meta.title) pptx.title = meta.title;
  for (const s of slides) addSceneToSlide(pptx, pptx.addSlide(), s);
  return pptx;
}
