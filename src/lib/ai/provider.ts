/**
 * AI の呼び出し口（下準備。まだどこからも呼ばない）。
 *
 * - サーバー側（Route Handler）からだけ使う。API キーは .env.local / Vercel の環境変数 OPENAI_API_KEY に置き、
 *   画面側のコードに import しない（NEXT_PUBLIC_ を付けない）
 * - AI 相談もヘッダー提案も、この1つの口を通す。モデルの切り替え・タイムアウト・記録をここにまとめる
 * - キーがない・失敗した時は null を返し、呼び出し側はルール版（相談）か「今は使えません」（ヘッダー）に戻る
 */

import type { z } from 'zod';
import type { AiFeatureId } from './plans';

export interface AiJsonRequest<T> {
  feature: AiFeatureId;
  system: string;
  user: string;
  /** 返してほしい JSON の形。返ってきたものはこれで検証し、合わなければ null 扱い */
  schema: z.ZodType<T>;
  /** 返答の上限（トークン）。費用の上限にもなる */
  maxOutputTokens: number;
  temperature?: number;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface AiProvider {
  readonly name: string;
  json<T>(req: AiJsonRequest<T>): Promise<{ data: T; usage: AiUsage } | null>;
}

/** 機能ごとのモデルと上限（仮）。モデル名は実装時に最新の一覧と料金を確認して決める。安いモデルから始め、正解表の点で選ぶ */
export const AI_MODELS: Record<AiFeatureId, { model: string; maxOutputTokens: number; timeoutMs: number }> = {
  ai_consult: { model: process.env.OPENAI_MODEL_CONSULT ?? 'gpt-4o-mini', maxOutputTokens: 600, timeoutMs: 12_000 },
  ai_headline: { model: process.env.OPENAI_MODEL_HEADLINE ?? 'gpt-4o-mini', maxOutputTokens: 500, timeoutMs: 12_000 },
};

/** キーが設定されているか（サーバー側だけで意味がある） */
export const aiConfigured = (): boolean => typeof process !== 'undefined' && !!process.env.OPENAI_API_KEY;

/** キーがない時・テスト用：常に null（ルール版に戻る） */
export const disabledProvider: AiProvider = {
  name: 'disabled',
  async json() {
    return null;
  },
};
