import { z } from 'zod';
import type { Locale } from '@/registry';
import { factsToText, type SlideFacts } from './facts';
import { checkNumbers, type NumberToken } from './number-check';

/**
 * スライドのヘッダー（メッセージ）を AI に提案・修正させる時の、頼み方と受け取り方（下準備。まだ呼ばない）。
 *
 * - 提案（suggest）：事実から3案。結論・事実・示唆の3つの型
 * - 修正（revise）：ユーザーの文を、意味を変えずに直す（結論を先に、短く、数字を事実に合わせる）
 * - 返ってきた案は validateHeadline で確かめる。合わない数字・長すぎる案は注意付きか除外
 */

export const HEADLINE_STYLES = ['conclusion', 'fact', 'implication'] as const;
export type HeadlineStyle = (typeof HEADLINE_STYLES)[number];

export const HEADLINE_STYLE_LABEL: Record<HeadlineStyle, { ja: string; en: string }> = {
  conclusion: { ja: '結論', en: 'Conclusion' },
  fact: { ja: '事実', en: 'Fact' },
  implication: { ja: '示唆', en: 'Implication' },
};

/** ヘッダーの長さの上限（日本語は全角換算の文字数、英語は文字数）。スライドの見出し2行に収まる目安 */
export const HEADLINE_MAX = { ja: 60, en: 120 } as const;

export const HeadlineResponseSchema = z.object({
  candidates: z
    .array(z.object({
      style: z.enum(HEADLINE_STYLES),
      text: z.string().min(1).max(300),
      /** 使った事実の id（facts.ts）。数字の出どころを画面で示せるように */
      fact_ids: z.array(z.string()).max(8),
    }))
    .min(1)
    .max(3),
  /** 修正の時だけ：何を直したか（1行） */
  note: z.string().max(200).optional(),
});
export type HeadlineResponse = z.infer<typeof HeadlineResponseSchema>;

export interface HeadlineRequest {
  mode: 'suggest' | 'revise';
  locale: Locale;
  facts: SlideFacts;
  /** レシピの問い（例：どこが大きく、どこが伸びているか） */
  question?: string;
  /** チャートの名前（例：Mekko） */
  chart?: string;
  audience?: 'EXECUTIVE_MEETING' | 'REPORT' | 'UNKNOWN';
  /** 今のヘッダー（修正の時は必須） */
  current?: string;
  /** ユーザーが伝えたいこと（相談の文。あれば） */
  intent?: string;
}

const SYSTEM = {
  ja: `あなたはコンサルティング会社のスライド作成の専門家です。チャートの上に置く1文のメッセージ（ヘッダー）を書きます。
守ること：
- 数字は「事実」に書かれたものだけを使う。計算し直したり、新しい数字を作ったりしない（丸めるのはよい）
- 事実にない原因・予測・評価を断定しない。「示唆」の案だけ、事実から言えることを控えめに書いてよい
- 結論を先に。主語（何が）と、どうなったか（伸びた・縮んだ・差が開いた）をはっきり
- ${HEADLINE_MAX.ja}文字以内。句点で2文に分けてもよい。体言止めより「〜した」「〜している」
- 強調（highlight）がある時は、その項目を主語にした案を少なくとも1つ入れる
- 返すのは JSON だけ。形は {"candidates":[{"style":"conclusion|fact|implication","text":"...","fact_ids":["..."]}],"note":"..."}`,
  en: `You are an expert at writing consulting-style slides. You write the one-sentence message (headline) above a chart.
Rules:
- Use only numbers listed in the facts. Do not recompute or invent numbers (rounding is fine).
- Do not assert causes, forecasts or judgements that are not in the facts. Only the "implication" candidate may state a cautious takeaway.
- Lead with the conclusion: what changed and how.
- At most ${HEADLINE_MAX.en} characters.
- If a highlight is given, at least one candidate makes it the subject.
- Return JSON only: {"candidates":[{"style":"conclusion|fact|implication","text":"...","fact_ids":["..."]}],"note":"..."}`,
} as const;

export function buildHeadlinePrompt(req: HeadlineRequest): { system: string; user: string } {
  const ja = req.locale === 'ja';
  const lines = [
    req.chart ? (ja ? `チャート：${req.chart}` : `Chart: ${req.chart}`) : null,
    req.question ? (ja ? `このスライドの問い：${req.question}` : `Question this slide answers: ${req.question}`) : null,
    req.audience && req.audience !== 'UNKNOWN' ? (ja ? `相手：${req.audience === 'EXECUTIVE_MEETING' ? '経営会議' : '報告書'}` : `Audience: ${req.audience}`) : null,
    req.intent ? (ja ? `ユーザーが伝えたいこと：${req.intent}` : `What the user wants to say: ${req.intent}`) : null,
    '',
    ja ? '事実：' : 'Facts:',
    factsToText(req.facts),
    '',
    req.mode === 'revise'
      ? (ja
        ? `今のヘッダー：「${req.current ?? ''}」\nこの文の言いたいことを変えずに直してください。数字が事実と合わなければ事実に合わせる。案は最大3つ（1つ目が一番おすすめ）。note に何を直したかを1行で。`
        : `Current headline: "${req.current ?? ''}"\nImprove it without changing what it says. Fix numbers that do not match the facts. Up to 3 candidates (best first). Put a one-line note on what you changed.`)
      : (ja
        ? 'ヘッダーの案を3つ。conclusion（結論）・fact（事実）・implication（示唆）を1つずつ。'
        : 'Write 3 headline candidates: one each of conclusion, fact and implication.'),
  ];
  return { system: SYSTEM[req.locale], user: lines.filter((l) => l !== null).join('\n') };
}

export interface HeadlineIssue {
  code: 'unknown_number' | 'too_long' | 'unknown_fact';
  token?: NumberToken;
  factId?: string;
}

export interface CheckedCandidate {
  style: HeadlineStyle;
  text: string;
  factIds: string[];
  issues: HeadlineIssue[];
}

/** 全角を2、半角を1として数え、2で割る（全角換算の文字数） */
export const zenLength = (s: string) => [...s].reduce((n, c) => n + (/[\u0000-ÿ]/.test(c) ? 1 : 2), 0) / 2;

/** 返ってきた案を確かめる。数字が事実と合わない案は unknown_number（画面では出さないか、注意を付ける） */
export function validateHeadline(res: HeadlineResponse, facts: SlideFacts, labels: readonly string[] = []): CheckedCandidate[] {
  const ids = new Set(facts.facts.map((f) => f.id));
  return res.candidates.map((c) => {
    const issues: HeadlineIssue[] = [];
    for (const token of checkNumbers(c.text, facts.facts, labels).unknown) issues.push({ code: 'unknown_number', token });
    const len = facts.locale === 'ja' ? zenLength(c.text) : c.text.length;
    if (len > HEADLINE_MAX[facts.locale]) issues.push({ code: 'too_long' });
    for (const id of c.fact_ids) if (!ids.has(id)) issues.push({ code: 'unknown_fact', factId: id });
    return { style: c.style, text: c.text.trim(), factIds: c.fact_ids.filter((id) => ids.has(id)), issues };
  });
}

/** 画面に出す案：数字の合わない案は外し、長すぎる案は注意付きで残す */
export const usableCandidates = (xs: CheckedCandidate[]) => xs.filter((c) => !c.issues.some((i) => i.code === 'unknown_number'));
