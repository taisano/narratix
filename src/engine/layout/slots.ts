import type { LayoutNode, SlideLayoutDef } from '@/registry';
import type { Rect } from '../scene';

export const slotsOf = (n: LayoutNode): string[] => ('slot' in n ? [n.slot] : n.children.flatMap(slotsOf));

export interface SlotOptions {
  /** 隣り合う2つの子（それぞれに含まれるスロット）の間隔 */
  gap: (a: string[], b: string[]) => number;
  /** 内容に合わせて縮めたいスロットの大きさ（分割方向の長さ）。比率で決まる大きさより小さい時だけ効く */
  fit?: Record<string, number>;
}

/** レイアウトの分割木と比率から、各スロットの矩形（インチ）を求める */
export function computeSlots(layout: SlideLayoutDef, ratios: readonly number[] | undefined, rect: Rect, opts: SlotOptions): Record<string, Rect> {
  const r = layout.ratios.map((p, i) => ratios?.[i] ?? p.default);
  const out: Record<string, Rect> = {};
  const walk = (node: LayoutNode, box: Rect) => {
    if ('slot' in node) { out[node.slot] = box; return; }
    const horizontal = node.split === 'cols';
    const total = horizontal ? box.w : box.h;
    const kids = node.children;
    const gaps = kids.slice(1).map((k, i) => opts.gap(slotsOf(kids[i]!), slotsOf(k)));
    const avail = total - gaps.reduce((s, g) => s + g, 0);
    let sizes: number[];
    if (node.ratio === 'equal' || kids.length !== 2) {
      sizes = kids.map(() => avail / kids.length);
    } else {
      const a = r[node.ratio]!;
      sizes = [avail * a, avail * (1 - a)];
      kids.forEach((k, i) => {
        const want = 'slot' in k ? opts.fit?.[k.slot] : undefined;
        if (want != null && want < sizes[i]!) {
          const other = 1 - i;
          sizes[other] = sizes[other]! + (sizes[i]! - want);
          sizes[i] = want;
        }
      });
    }
    let pos = horizontal ? box.x : box.y;
    kids.forEach((k, i) => {
      const s = sizes[i]!;
      walk(k, horizontal ? { x: pos, y: box.y, w: s, h: box.h } : { x: box.x, y: pos, w: box.w, h: s });
      pos += s + (gaps[i] ?? 0);
    });
  };
  walk(layout.tree, rect);
  return out;
}
