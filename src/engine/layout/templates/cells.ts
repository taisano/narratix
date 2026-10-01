import type { NumberFormatDef } from './types';

/**
 * 比較表のセル：入れた文字から数を読み、見せ方の数の形で書く。数として読めない文字はそのまま
 */

/** 単位の目印（列や行の中で揃っているかの確認に使う） */
export type UnitMark = 'pct' | 'currency' | 'plain';

export interface ParsedCell {
  /** 数として読めれば値（% は 12% → 12） */
  value: number | null;
  mark: UnitMark;
  /** 数の後ろに付いていた単位（例：億円）。無ければ空 */
  suffix: string;
}

const CURRENCY = /^[¥￥$€£]/;
/** 日付・時期の印（「12月」「2024年」「10月末」「上期」など）。数ではなく文字として扱う（数の形を当てない） */
const DATE_SUFFIX = /^(年|月|日|週|期|半期|時|分|Q)/;

/** セルの文字を読む。「1,234」「12%」「¥3,000」「12.5億円」「−3」などを数として読む */
export function parseCell(raw: string): ParsedCell {
  const s = raw.trim().replace(/[，]/g, ',').replace(/[−–—]/g, '-').replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!s) return { value: null, mark: 'plain', suffix: '' };
  const m = /^([¥￥$€£])?\s*([+-]?)\s*([¥￥$€£])?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([%％])?\s*(.*)$/.exec(s);
  if (!m) return { value: null, mark: 'plain', suffix: '' };
  const suffix = (m[7] ?? '').trim();
  // 数の後ろが長い文（「3社が参入」など）なら、数としては読まない
  if (suffix.length > 6 || /\d/.test(suffix)) return { value: null, mark: 'plain', suffix: '' };
  if (!m[6] && DATE_SUFFIX.test(suffix)) return { value: null, mark: 'plain', suffix: '' };
  const value = Number(`${m[2] ?? ''}${m[4]!.replace(/,/g, '')}${m[5] ?? ''}`);
  if (!Number.isFinite(value)) return { value: null, mark: 'plain', suffix: '' };
  const mark: UnitMark = m[6] ? 'pct' : m[1] || m[3] || CURRENCY.test(s) || /円|ドル|ユーロ/.test(suffix) ? 'currency' : 'plain';
  return { value, mark, suffix };
}

export const isNumberCell = (raw: string) => parseCell(raw).value != null;

const withCommas = (n: number, digits: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * 数の形で書く。数として読めない・形が auto なら入れたまま。
 * セルに自分の単位（「件」「億円」など）が付いていて、数の形の単位と違う時も入れたまま（別の単位を付け直さない）
 */
export function formatCell(raw: string, f: NumberFormatDef | undefined): string {
  if (!f || f.kind === 'auto') return raw.trim();
  const p = parseCell(raw);
  if (p.value == null) return raw.trim();
  const unit = f.unit?.trim() ?? '';
  if (p.suffix && p.suffix !== unit) return raw.trim();
  const sign = p.value < 0 ? '−' : '';
  const abs = Math.abs(p.value);
  switch (f.kind) {
    case 'int': return sign + withCommas(Math.round(abs), 0) + unit;
    case 'dec': return sign + withCommas(abs, f.digits ?? 1) + unit;
    // 入れた数に % を付ける（12 → 12%。0.12 を 12% にはしない）
    case 'pct': return sign + withCommas(abs, f.digits ?? 0) + '%' + unit;
    case 'currency': return sign + (f.symbol ?? '¥') + withCommas(abs, f.digits ?? 0) + unit;
    default: return raw.trim();
  }
}

/** 文字の揃え：数は右、短い評価の語（高・中・低、◎、可など）は中央、ほかは左 */
export function alignOf(raw: string): 'left' | 'center' | 'right' {
  const s = raw.trim();
  if (!s) return 'center';
  if (isNumberCell(s)) return 'right';
  return [...s].length <= 4 ? 'center' : 'left';
}
