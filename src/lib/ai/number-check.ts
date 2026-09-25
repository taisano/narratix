import type { Fact } from './facts';

/**
 * AI が書いた文の数字が、アプリの計算した事実（facts.ts）のどれかの丸めになっているかを確かめる。
 * 合わない数字が1つでもある案は、出さないか注意を付ける（有料機能の信頼の要）。
 *
 * - 年（2025年、FY2025、4桁の年）、順位（1位）、数える数（3地域・2社など10以下）は数字として確かめない
 * - 項目名に含まれる数字（「製品A1」「2024年度 営業利益」）は先に取り除く
 * - %・pt・倍・割はそれぞれ率・構成比の差・倍率と、単位のない数字は値（金額など）と比べる
 * - 表示された桁で丸めた範囲なら合っているとみなす。「約」「およそ」が付いていれば 5% までずれてよい
 */

export interface NumberToken {
  raw: string;
  value: number;
  suffix: '' | '%' | 'pt' | 'x' | 'wari';
  approx: boolean;
  index: number;
}

export interface NumberCheck {
  ok: boolean;
  tokens: NumberToken[];
  unknown: NumberToken[];
}

const Z2H = (s: string) => s.replace(/[０-９．，％＋－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const COUNTER = /^(?:つ|個|社|地域|製品|カ国|か国|ヶ国|国|項目|部門|事業|ブランド|カテゴリ|品目|人|名|countries|regions|products|brands|items)/;
const NOT_A_VALUE = /^(?:年度?|月|日|期|位|Q|st|nd|rd|th|年間)/;
const TOKEN = /(約|およそ|ほぼ|about |around |approximately |~)?([+\-−▲△]?)(\d[\d,]*(?:\.\d+)?)\s*(%|pt|ポイント|倍|割|x\b)?/g;

export function extractNumbers(text: string, labels: readonly string[] = []): NumberToken[] {
  let t = Z2H(text);
  // 項目名は先に消す（長い名前から）。位置がずれないよう同じ長さの空白に置き換える
  for (const l of [...labels].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (/\d/.test(l)) t = t.split(Z2H(l)).join(' '.repeat(l.length));
  }
  const out: NumberToken[] = [];
  for (const m of t.matchAll(TOKEN)) {
    const [, approx, , digits, suf] = m;
    const index = m.index ?? 0;
    const before = t.slice(Math.max(0, index - 2), index);
    const after = t.slice(index + m[0].length);
    const value = Number(digits!.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (!suf) {
      if (NOT_A_VALUE.test(after) || /FY|Q$/i.test(before)) continue;
      if (/^\d{4}$/.test(digits!) && value >= 1900 && value <= 2100) continue;
      if (Number.isInteger(value) && value <= 10 && COUNTER.test(after)) continue;
    }
    const suffix = suf === '%' ? '%' : suf === 'pt' || suf === 'ポイント' ? 'pt' : suf === '倍' || suf === 'x' ? 'x' : suf === '割' ? 'wari' : '';
    out.push({ raw: m[0].trim(), value, suffix, approx: !!approx, index });
  }
  return out;
}

const decimals = (raw: string) => /\.(\d+)/.exec(raw)?.[1]?.length ?? 0;

function near(shown: number, target: number, tok: NumberToken): boolean {
  const d = decimals(tok.raw.replace(/[^\d.]/g, ''));
  const tol = 0.5 * Math.pow(10, -d) + 1e-9;
  if (Math.abs(Math.abs(shown) - Math.abs(target)) <= tol) return true;
  // 「約」付き、または大きな数を丸めた時（3,000 と 2,960 など）は 5% まで
  if (tok.approx || (d === 0 && /0$/.test(String(shown)) && Math.abs(shown) >= 100)) {
    return Math.abs(target) > 0 && Math.abs(Math.abs(shown) - Math.abs(target)) / Math.abs(target) <= 0.05;
  }
  return false;
}

function candidates(tok: NumberToken, facts: readonly Fact[]): number[] {
  const of = (k: Fact['kind']) => facts.filter((f) => f.kind === k).map((f) => f.value);
  switch (tok.suffix) {
    case '%': return [...of('rate').map((v) => v * 100), ...of('amount')]; // 値そのものが % の表（利益率など）もある
    case 'pt': return [...of('pt').map((v) => v * 100), ...of('amount')];
    case 'x': return [...of('ratio'), ...of('rate').map((v) => v + 1)];
    case 'wari': return of('rate').map((v) => v * 10);
    default: return [...of('amount'), ...of('corr')];
  }
}

export function checkNumbers(text: string, facts: readonly Fact[], labels: readonly string[] = []): NumberCheck {
  const tokens = extractNumbers(text, labels);
  const unknown = tokens.filter((tok) => !candidates(tok, facts).some((v) => near(tok.value, v, tok)));
  return { ok: unknown.length === 0, tokens, unknown };
}
