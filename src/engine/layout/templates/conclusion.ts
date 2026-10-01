import type { SceneItem, TextLine } from '../../scene';
import { FOCUS, INK, SEC, WHITE, mixColor } from '../../theme';
import { wrapText } from '../../text';
import { TABLE_STYLE, lineH, type TableBox } from './comparison';
import type { ConclusionContent, ConclusionLook, Reason } from './types';

/**
 * 結論＋3つの根拠（STORY_TEXT_CONCLUSION_REASONS）の配置。結論はメッセージタイトル（枠のタイトル）で、本文には重ねない。
 * 根拠は入れたものだけ（空の根拠は出さない＝見本の文言を PPT に出さない）。2つなら2列、1つなら広いカード1枚。
 * カードの描き方（番号・細いアクセントライン・見出し・説明・参照）は、この後の言葉の型でも使う
 */

export const CARD_STYLE = {
  gap: 0.3,
  pad: 0.22,
  border: '#D5DBE0',
  accent: TABLE_STYLE.accent,
  number: FOCUS.primary,
  caveatFill: '#F3F5F7',
  headSizes: [18, 17, 16, 15, 14],
  bodySizes: [14, 13, 12, 11],
  minBody: 11,
} as const;

/** 入っている根拠（見出しか説明のどちらかがある） */
export const filledReasons = (c: ConclusionContent): Reason[] => c.reasons.filter((r) => r.heading.trim() || r.body.trim());

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: 'left' | 'center' | 'right' = 'left'): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

/** 根拠の位置 → 参照の文字（参照先が無ければ null） */
export type RefLabel = (ref: string) => string | null;

export function layoutConclusion(c: ConclusionContent, look: ConclusionLook, area: TableBox, refLabel: RefLabel): { items: SceneItem[]; dense: boolean } {
  const S = CARD_STYLE;
  const items: SceneItem[] = [];
  let bottom = area.y + area.h;
  // 前提・留意点：カードのすぐ下に薄い背景で（高さは先に取っておく）
  const caveatLines = look.showCaveat && c.caveat.trim() ? wrapText(c.caveat.trim(), 12, area.w - 2 * S.pad, 3) : [];
  const caveatH = caveatLines.length ? caveatLines.length * lineH(12) + 0.24 : 0;
  const placeCaveat = (y: number) => {
    if (!caveatH) return;
    items.push({ kind: 'box', x: area.x, y, w: area.w, h: caveatH, fill: S.caveatFill });
    items.push(text(area.x + S.pad, y + 0.12, area.w - 2 * S.pad, caveatH - 0.24, caveatLines.map((t) => ({ t, size: 12, color: INK }))));
  };
  if (caveatH) bottom -= caveatH + 0.24;
  const shown = c.reasons.map((r, i) => ({ r, i })).filter(({ r }) => r.heading.trim() || r.body.trim());
  const top = area.y + 0.1;
  if (!shown.length) { placeCaveat(top); return { items, dense: false }; }
  const availH = bottom - top;
  const vertical = look.layout === 'vertical';
  const n = shown.length;

  // カードの大きさ。横並び：同じ幅・同じ高さ。縦並び：同じ高さで上から
  const cardW = vertical ? area.w : (area.w - S.gap * (n - 1)) / n;
  const gapV = 0.2;
  const cardH = vertical ? (availH - gapV * (n - 1)) / n : availH;
  const numW = vertical ? 0.9 : 0;
  const headW = vertical ? Math.min(3.8, (cardW - numW) * 0.36) : cardW - 2 * S.pad;
  const bodyW = vertical ? cardW - numW - headW - 3 * S.pad : cardW - 2 * S.pad;
  const numH = look.showNumbers && !vertical ? 0.5 : 0;
  const refOf = (r: Reason) => (look.showRefs && r.ref ? refLabel(r.ref) : null);
  const refH = (r: Reason) => (refOf(r) ? lineH(11) + 0.1 : 0);

  // 文字の大きさ：全部のカードに入る大きさ（最小は minBody。入らなければ知らせる）
  const need = (hs: number, bs: number) => Math.max(...shown.map(({ r }) => {
    const hl = r.heading.trim() ? wrapText(r.heading.trim(), hs, headW, 3).length * lineH(hs) : 0;
    const bl = r.body.trim() ? wrapText(r.body.trim(), bs, bodyW, 12).length * lineH(bs) : 0;
    return vertical ? Math.max(hl, bl + refH(r)) + 2 * S.pad : numH + hl + (hl && bl ? 0.14 : 0) + bl + refH(r) + 2 * S.pad + 0.08;
  }));
  let hs: number = S.headSizes[0], bs: number = S.bodySizes[0];
  outer: for (const b of S.bodySizes) for (const h of S.headSizes) {
    hs = h; bs = b;
    if (need(h, b) <= cardH) break outer;
  }
  const dense = need(hs, bs) > cardH;
  // カードの高さは中身に合わせる（全部同じ高さ。空きが大きくなりすぎないよう、少しの余白まで）
  const h0 = dense ? need(hs, bs) : Math.min(cardH, Math.max(need(hs, bs) + (vertical ? 0.3 : 0.7), vertical ? 1.1 : 2.6));

  const al = look.align ?? 'left';
  shown.forEach(({ r, i }, k) => {
    const em = look.emphasis === i;
    const x = vertical ? area.x : area.x + k * (cardW + S.gap);
    const y = vertical ? top + k * (h0 + gapV) : top;
    const ch = h0;
    const accent = em ? S.accent : S.number;
    items.push({ kind: 'box', x, y, w: cardW, h: ch, fill: em ? mixColor(S.accent, WHITE, 0.9) : WHITE, line: em ? S.accent : S.border });
    // 細いアクセントライン（順序の目印）
    if (vertical) items.push({ kind: 'line', x1: x, y1: y, x2: x, y2: y + ch, color: accent, width: em ? 4 : 3 });
    else items.push({ kind: 'line', x1: x, y1: y, x2: x + cardW, y2: y, color: accent, width: em ? 4 : 3 });
    const num = String(k + 1).padStart(2, '0');
    let cy = y + S.pad;
    if (vertical) {
      if (look.showNumbers) items.push(text(x + 0.2, cy - 0.04, numW - 0.2, 0.5, [{ t: num, size: 22, bold: true, color: accent }], al));
      const hx = x + numW + S.pad;
      if (r.heading.trim()) {
        const hl = wrapText(r.heading.trim(), hs, headW, 3);
        items.push(text(hx, cy, headW, hl.length * lineH(hs), hl.map((t) => ({ t, size: hs, bold: true, color: INK })), al));
      }
      const bx = hx + headW + S.pad;
      if (r.body.trim()) {
        const bl = wrapText(r.body.trim(), bs, bodyW, 12);
        items.push(text(bx, cy, bodyW, bl.length * lineH(bs), bl.map((t) => ({ t, size: bs, color: INK })), al));
        cy += bl.length * lineH(bs) + 0.1;
      }
      const ref = refOf(r);
      if (ref) items.push(text(bx, y + ch - S.pad - lineH(11), bodyW, lineH(11), [{ t: ref, size: 11, color: SEC }], al));
      return;
    }
    if (look.showNumbers) { items.push(text(x + S.pad, cy - 0.04, cardW - 2 * S.pad, numH, [{ t: num, size: 22, bold: true, color: accent }], al)); cy += numH; }
    if (r.heading.trim()) {
      const hl = wrapText(r.heading.trim(), hs, headW, 3);
      items.push(text(x + S.pad, cy, headW, hl.length * lineH(hs), hl.map((t) => ({ t, size: hs, bold: true, color: INK })), al));
      cy += hl.length * lineH(hs) + 0.14;
    }
    if (r.body.trim()) {
      const bl = wrapText(r.body.trim(), bs, bodyW, 12);
      items.push(text(x + S.pad, cy, bodyW, bl.length * lineH(bs), bl.map((t) => ({ t, size: bs, color: INK })), al));
    }
    const ref = refOf(r);
    if (ref) items.push(text(x + S.pad, y + ch - S.pad - lineH(11), bodyW, lineH(11), [{ t: ref, size: 11, color: SEC }], al));
  });
  placeCaveat(top + (vertical ? n * h0 + (n - 1) * gapV : h0) + 0.24);
  return { items, dense };
}
