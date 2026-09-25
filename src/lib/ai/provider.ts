/**
 * AI の呼び出し口。
 *
 * - サーバー側（Route Handler / 評価スクリプト）からだけ使う。API キーは .env.local / Vercel の環境変数 OPENAI_API_KEY に置き、
 *   画面側のコードに import しない（NEXT_PUBLIC_ を付けない）
 * - AI 相談もヘッダー提案も、この1つの口を通す。モデル・タイムアウト・返答の上限をここにまとめる
 * - キーがない・失敗した・形が合わない時は null を返し、呼び出し側はルール版（相談）か「今は使えません」（ヘッダー）に戻る
 * - 送った文・返ってきた文はここでは残さない（記録するのはトークン数と時間だけ）
 */

import type { z } from 'zod';
import type { AiFeatureId } from './plans';

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AiJsonRequest<T> {
  feature: AiFeatureId;
  system: string;
  user: string;
  /** 返してほしい JSON の形（OpenAI の strict な JSON Schema）と名前 */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  /** 返ってきたものはこれで検証し、合わなければ null 扱い */
  schema: z.ZodType<T>;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export type AiResult<T> = { ok: true; data: T; usage: AiUsage } | { ok: false; reason: AiFailure; usage?: AiUsage };
export type AiFailure = 'not_configured' | 'timeout' | 'http' | 'refusal' | 'bad_json' | 'bad_shape' | 'network';

export interface AiProvider {
  readonly name: string;
  json<T>(req: AiJsonRequest<T>): Promise<AiResult<T>>;
}

/**
 * 機能ごとのモデルと上限。2026-09 時点の OpenAI の一覧で、いちばん安い gpt-6-luna（入力 $0.10 / 出力 $0.50 per 1M tokens）から始める。
 * 環境変数で差し替えられる（例：OPENAI_MODEL_CONSULT=gpt-6-sol）。返答の上限は考える分（reasoning）も含む。
 */
export const AI_MODELS: Record<AiFeatureId, { model: string; effort: ReasoningEffort; maxOutputTokens: number; timeoutMs: number }> = {
  ai_consult: {
    model: env('OPENAI_MODEL_CONSULT') ?? 'gpt-6-luna',
    effort: (env('OPENAI_EFFORT_CONSULT') as ReasoningEffort | undefined) ?? 'low',
    maxOutputTokens: 2000,
    timeoutMs: 20_000,
  },
  ai_headline: {
    model: env('OPENAI_MODEL_HEADLINE') ?? 'gpt-6-luna',
    effort: (env('OPENAI_EFFORT_HEADLINE') as ReasoningEffort | undefined) ?? 'low',
    maxOutputTokens: 2000,
    timeoutMs: 20_000,
  },
};

function env(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[name] || undefined : undefined;
}

/** キーが設定されているか（サーバー側だけで意味がある） */
export const aiConfigured = (): boolean => !!env('OPENAI_API_KEY');

/** キーがない時・テスト用：常に失敗（ルール版に戻る） */
export const disabledProvider: AiProvider = {
  name: 'disabled',
  async json() {
    return { ok: false, reason: 'not_configured' };
  },
};

/** 返事の中の文（output → message → output_text）。拒否なら refusal */
export function outputText(body: unknown): { text: string } | { refusal: true } | null {
  const b = body as { output_text?: unknown; output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[] };
  if (typeof b?.output_text === 'string') return { text: b.output_text };
  for (const item of b?.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'refusal') return { refusal: true };
      if (c.type === 'output_text' && typeof c.text === 'string') return { text: c.text };
    }
  }
  return null;
}

/** OpenAI の Responses API（POST /v1/responses、Structured Outputs） */
export function openAiProvider(apiKey = env('OPENAI_API_KEY'), fetchImpl: typeof fetch = fetch): AiProvider {
  return {
    name: 'openai',
    async json<T>(req: AiJsonRequest<T>): Promise<AiResult<T>> {
      if (!apiKey) return { ok: false, reason: 'not_configured' };
      const cfg = AI_MODELS[req.feature];
      const started = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: cfg.model,
            input: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
            text: { format: { type: 'json_schema', name: req.schemaName, schema: req.jsonSchema, strict: true } },
            reasoning: { effort: cfg.effort },
            max_output_tokens: cfg.maxOutputTokens,
            store: false,
          }),
        });
      } catch (e) {
        clearTimeout(timer);
        return { ok: false, reason: (e as Error)?.name === 'AbortError' ? 'timeout' : 'network' };
      }
      clearTimeout(timer);
      const body = (await res.json().catch(() => null)) as { usage?: { input_tokens?: number; output_tokens?: number } } | null;
      const usage: AiUsage = { model: cfg.model, inputTokens: body?.usage?.input_tokens ?? 0, outputTokens: body?.usage?.output_tokens ?? 0, ms: Date.now() - started };
      if (!res.ok || !body) return { ok: false, reason: 'http', usage };
      const out = outputText(body);
      if (!out) return { ok: false, reason: 'bad_json', usage };
      if ('refusal' in out) return { ok: false, reason: 'refusal', usage };
      let raw: unknown;
      try { raw = JSON.parse(out.text); } catch { return { ok: false, reason: 'bad_json', usage }; }
      const parsed = req.schema.safeParse(raw);
      return parsed.success ? { ok: true, data: parsed.data, usage } : { ok: false, reason: 'bad_shape', usage };
    },
  };
}

/** キーがあれば OpenAI、なければ常に失敗する口 */
export const defaultProvider = (): AiProvider => (aiConfigured() ? openAiProvider() : disabledProvider);
