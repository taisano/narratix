import { NEXT_STATUS, localize, type Locale, type NextStatus } from '@/registry';
import type { SceneItem, TableCell, TextLine } from '../../scene';
import { INK, SEC, WHITE, mixColor } from '../../theme';
import { wrapText } from '../../text';
import { CARD_STYLE } from './conclusion';
import { TABLE_STYLE, lineH, type TableBox } from './comparison';
import type { NextAction, NextContent, NextLook, TextAlign } from './types';

/**
 * 次のアクション（STORY_TEXT_NEXT_ACTIONS）の配置。結論はメッセージタイトル。上に「ひとこと」（任意）。
 * 表：番号・やること・担当・期限・状態の列（見出しは比較表と同じ紺）。カード：1件ずつ横に並べる。
 * 状態は色付きの文字（未着手＝灰、進行中＝紺、完了＝緑）。強調した行はオレンジの薄い背景。入れていない行は描かない
 */

export const NEXT_STYLE = {
  sizes: [18, 17, 16, 15, 14, 13, 12],
  numW: 0.6, ownerW: 2.0, dueW: 1.4, statusW: 1.3,
  minRowH: 0.62,
  leadSize: 18,
  status: { todo: '#7A8794', doing: CARD_STYLE.number, done: '#2E7D5B' } as Record<NextStatus, string>,
} as const;

export const filledActions = (c: NextContent): NextAction[] => c.items.filter((x) => x.text.trim());

const text = (x: number, y: number, w: number, h: number, lines: TextLine[], align: TextAlign): SceneItem =>
  ({ kind: 'text', x, y, w, h, lines, align, valign: 'top' });

const heads = (locale: Locale) => (locale === 'ja'
  ? { text: 'やること', owner: '担当', due: '期限', status: '状態' }
  : { text: 'Action', owner: 'Owner', due: 'Due', status: 'Status' });

export function layoutNext(c: NextContent, look: NextLook, area: TableBox, locale: Locale): { items: SceneItem[]; dense: boolean } {
  const S = NEXT_STYLE;
  const items: SceneItem[] = [];
  const acts = filledActions(c);
  let top = area.y + 0.1;
  if (look.showLead && c.lead.trim()) {
    const ls = wrapText(c.lead.trim(), S.leadSize, area.w, 2);
    items.push(text(area.x, top, area.w, ls.length * lineH(S.leadSize), ls.map((t) => ({ t, size: S.leadSize, bold: true, color: CARD_STYLE.number })), 'left'));
    top += ls.length * lineH(S.leadSize) + 0.25;
  }
  if (!acts.length) return { items, dense: false };
  const avail = area.y + area.h - top;
  const al: TextAlign = look.align ?? 'left';
  const H = heads(locale);
  const statusText = (s: NextStatus) => localize(NEXT_STATUS[s], locale);
  const tint = mixColor(CARD_STYLE.accent, WHITE, 0.88);

  if (look.layout === 'cards') {
    const n = acts.length;
    const gap = 0.3, pad = CARD_STYLE.pad;
    const cardW = (area.w - gap * (n - 1)) / n;
    const inner = cardW - 2 * pad;
    const metaSize = 14;
    const build = (size: number) => acts.map((a) => {
      const body = wrapText(a.text.trim(), size, inner, 6);
      const meta = [look.showOwner && a.owner.trim() ? `${H.owner}：${a.owner.trim()}` : '', look.showDue && a.due.trim() ? `${H.due}：${a.due.trim()}` : '']
        .filter(Boolean).flatMap((m) => wrapText(m, metaSize, inner, 2));
      const need = 2 * pad + (look.showNumbers ? 0.55 : 0) + body.length * lineH(size) + 0.2 + meta.length * lineH(metaSize) + (look.showStatus ? 0.6 : 0);
      return { a, body, meta, need };
    });
    let size: number = n <= 3 ? 20 : 17;
    let built = build(size);
    for (const s of [20, 19, 18, 17, 16, 15, 14, 13, 12].filter((x) => x <= (n <= 3 ? 20 : 17))) { size = s; built = build(s); if (Math.max(...built.map((b) => b.need)) <= avail) break; }
    const maxNeed = Math.max(...built.map((b) => b.need));
    const dense = maxNeed > avail;
    const cardH = dense ? maxNeed : Math.min(avail, Math.max(maxNeed + 0.4, 4.2));
    built.forEach(({ a, body, meta }, k) => {
      const em = look.emphasis === a.id;
      const x = area.x + k * (cardW + gap);
      items.push({ kind: 'box', x, y: top, w: cardW, h: cardH, fill: em ? tint : WHITE, line: em ? CARD_STYLE.accent : CARD_STYLE.border });
      items.push({ kind: 'line', x1: x, y1: top, x2: x + cardW, y2: top, color: em ? CARD_STYLE.accent : CARD_STYLE.number, width: em ? 4 : 3 });
      let cy = top + pad;
      if (look.showNumbers) { items.push(text(x + pad, cy - 0.04, inner, 0.5, [{ t: String(k + 1).padStart(2, '0'), size: 24, bold: true, color: em ? CARD_STYLE.accent : CARD_STYLE.number }], al)); cy += 0.55; }
      items.push(text(x + pad, cy, inner, body.length * lineH(size), body.map((t) => ({ t, size, bold: true, color: INK })), al));
      // 担当・期限・状態はカードの下に揃える
      let by = top + cardH - pad;
      if (look.showStatus) {
        const pw = 1.4, ph = 0.42;
        by -= ph;
        const px = al === 'left' ? x + pad : al === 'center' ? x + (cardW - pw) / 2 : x + cardW - pad - pw;
        const col = S.status[a.status];
        items.push({ kind: 'box', x: px, y: by, w: pw, h: ph, fill: mixColor(col, WHITE, 0.86), lines: [{ t: statusText(a.status), size: 14, bold: true, color: col }], align: 'center', valign: 'middle' });
        by -= 0.14;
      }
      if (meta.length) {
        const mh = meta.length * lineH(metaSize);
        items.push(text(x + pad, by - mh, inner, mh, meta.map((t) => ({ t, size: metaSize, color: SEC })), al));
      }
    });
    return { items, dense };
  }

  // 表
  const T = TABLE_STYLE;
  const cols: ('num' | 'text' | 'owner' | 'due' | 'status')[] = [
    ...(look.showNumbers ? ['num' as const] : []), 'text', ...(look.showOwner ? ['owner' as const] : []), ...(look.showDue ? ['due' as const] : []), ...(look.showStatus ? ['status' as const] : []),
  ];
  const fixedW = (k: (typeof cols)[number]) => (k === 'num' ? S.numW : k === 'owner' ? S.ownerW : k === 'due' ? S.dueW : k === 'status' ? S.statusW : 0);
  const textW = area.w - cols.reduce((a, k) => a + fixedW(k), 0);
  const colW = cols.map((k) => (k === 'text' ? textW : fixedW(k)));
  const cellText = (a: NextAction, k: (typeof cols)[number], i: number) =>
    (k === 'num' ? String(i + 1) : k === 'text' ? a.text.trim() : k === 'owner' ? a.owner.trim() : k === 'due' ? a.due.trim() : statusText(a.status));
  const attempt = (size: number) => {
    const wrapped = acts.map((a, i) => cols.map((k, j) => wrapText(cellText(a, k, i), k === 'text' ? size : size - 2, colW[j]! - 2 * T.padX, k === 'text' ? 3 : 2)));
    const headH = 0.52;
    const rowHs = [headH, ...wrapped.map((r) => Math.max(S.minRowH, Math.max(1, ...r.map((ls) => ls.length)) * lineH(size) + 2 * T.padY))];
    return { size, wrapped, rowHs, height: rowHs.reduce((a, b) => a + b, 0) };
  };
  let fit = attempt(S.sizes[0]);
  for (const s of S.sizes) { fit = attempt(s); if (fit.height <= avail) break; }
  const dense = fit.height > avail;
  // 余裕があれば行を少し高くして、表がスライドの上の方に小さく固まらないように
  if (!dense) {
    const extra = Math.min(0.3, (avail - fit.height) / acts.length);
    if (extra > 0.05) fit.rowHs = fit.rowHs.map((h, i) => (i === 0 ? h : h + extra));
  }
  const headRow: TableCell[] = cols.map((k) => ({
    text: k === 'num' ? '#' : H[k], fill: T.headFill, color: WHITE, align: k === 'text' ? al : 'center', size: fit.size - 1, bold: true,
  }));
  const body: TableCell[][] = fit.wrapped.map((r, i) => {
    const a = acts[i]!;
    const em = look.emphasis === a.id;
    return r.map((ls, j) => {
      const k = cols[j]!;
      const color = k === 'status' ? S.status[a.status] : k === 'num' ? (em ? CARD_STYLE.accent : CARD_STYLE.number) : k === 'text' ? INK : SEC;
      return { text: ls.join('\n'), fill: em ? tint : null, color, align: k === 'text' ? al : 'center', size: k === 'text' ? fit.size : fit.size - 2, bold: k === 'num' || k === 'status' || em };
    });
  });
  items.push({ kind: 'table', x: area.x, y: top, colW, rowH: fit.rowHs[0]!, rowHs: fit.rowHs, rows: [headRow, ...body], border: { color: T.line, pt: T.linePt }, grid: 'rows', pad: T.padX });
  return { items, dense };
}
