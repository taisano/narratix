/**
 * かんたん修正の数字の入力を読む。全角の数字・カンマ・空白は許す。
 * 空なら null（値なし）。数字として読めない途中の入力（「-」「1.」など）は undefined（まだ反映しない）
 */
export function parseCellNumber(s: string): number | null | undefined {
  const t = s.normalize('NFKC').replace(/[,\s]/g, '').replace(/[−–—]/g, '-');
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}
