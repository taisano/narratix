import type { Scene, TextItem, BoxItem } from '@/engine/scene';

/** 1インチ＝96px、1pt＝96/72px（reference/mekko-builder.html と同じ） */
export const PX = 96;
const PT = 96 / 72;
const INK = '#16202A';

export const SVG_FONT = "'Hiragino Sans','Yu Gothic','Meiryo','IBM Plex Sans JP',sans-serif";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n = (v: number) => (Math.round(v * 10) / 10).toString();

type Textual = Pick<TextItem, 'x' | 'y' | 'w' | 'h' | 'align' | 'valign'> & { lines: TextItem['lines']; inset?: boolean };

function svgText(it: Textual): string {
  const lh = (size: number) => size * PT * 1.28;
  const total = it.lines.reduce((s, l) => s + lh(l.size), 0);
  let y = it.valign === 'top' ? it.y * PX : (it.y + it.h / 2) * PX - total / 2;
  const ax = it.align === 'left' ? it.x * PX + (it.inset ? 4 : 0) : it.align === 'right' ? (it.x + it.w) * PX : (it.x + it.w / 2) * PX;
  const anchor = it.align === 'left' ? 'start' : it.align === 'right' ? 'end' : 'middle';
  return it.lines
    .map((l) => {
      y += lh(l.size);
      const yy = y - lh(l.size) * 0.26;
      return `<text x="${n(ax)}" y="${n(yy)}" font-size="${n(l.size * PT)}" font-weight="${l.bold ? 600 : 400}" fill="${l.color ?? INK}" text-anchor="${anchor}">${esc(l.t)}</text>`;
    })
    .join('');
}

function svgBox(b: BoxItem): string {
  let s = `<rect x="${n(b.x * PX)}" y="${n(b.y * PX)}" width="${n(b.w * PX)}" height="${n(b.h * PX)}" fill="${b.fill}"${b.line ? ` stroke="${b.line}" stroke-width="1.5"` : ''}/>`;
  if (b.lines?.length) s += svgText({ ...b, lines: b.lines, align: b.align ?? 'center', valign: b.valign ?? 'middle', inset: true });
  return s;
}

/** Scene を SVG 文字列にする。描画ルールは持たず、配置結果をそのまま描く */
export function sceneToSvg(scene: Scene, opts: { title?: string } = {}): string {
  let s = `<svg viewBox="0 0 ${n(scene.width * PX)} ${n(scene.height * PX)}" xmlns="http://www.w3.org/2000/svg" font-family="${SVG_FONT}" role="img"${opts.title ? ` aria-label="${esc(opts.title)}"` : ''}>`;
  s += '<rect width="100%" height="100%" fill="#FFFFFF"/>';
  for (const it of scene.items) {
    if (it.kind === 'box') s += svgBox(it);
    else if (it.kind === 'text') {
      s += it.rotate ? `<g transform="rotate(${it.rotate} ${n((it.x + it.w / 2) * PX)} ${n((it.y + it.h / 2) * PX)})">${svgText(it)}</g>` : svgText(it);
    }
    else if (it.kind === 'line') {
      s += `<line x1="${n(it.x1 * PX)}" y1="${n(it.y1 * PX)}" x2="${n(it.x2 * PX)}" y2="${n(it.y2 * PX)}" stroke="${it.color}" stroke-width="${n(it.width * PT)}"${it.dash ? ' stroke-dasharray="6 4"' : ''} stroke-linecap="round"/>`;
    } else if (it.kind === 'ellipse') {
      s += `<ellipse cx="${n((it.x + it.w / 2) * PX)}" cy="${n((it.y + it.h / 2) * PX)}" rx="${n((it.w / 2) * PX)}" ry="${n((it.h / 2) * PX)}" fill="${it.fill}"/>`;
    }
    else if (it.kind === 'table') {
      let y = it.y;
      for (const row of it.rows) {
        let x = it.x;
        row.forEach((c, j) => {
          const w = it.colW[j]!;
          const border = it.border ?? { color: '#FFFFFF', pt: 1 };
          if (c.fill || border.color.toUpperCase() !== '#FFFFFF') {
            s += `<rect x="${n(x * PX)}" y="${n(y * PX)}" width="${n(w * PX)}" height="${n(it.rowH * PX)}" fill="${c.fill ?? 'none'}" stroke="${border.color}" stroke-width="${n(border.pt * 1.5)}"/>`;
          }
          s += svgText({ x, y, w, h: it.rowH, lines: [{ t: c.text, size: c.size, bold: c.bold, color: c.color }], align: c.align, valign: 'middle' });
          x += w;
        });
        y += it.rowH;
      }
    }
  }
  return s + '</svg>';
}
