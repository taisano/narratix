import { z } from 'zod';
import {
  ADDITIVITY, ADVISOR_ACTIONS, AUDIENCE_IDS, COMPARISON_INTENTS, COMPOSITION_INTENTS, ConsultationClassificationSchema, GOAL_CODES,
  MISSING_INFO, SERIES_COUNTS, TIME_MODES, type ConsultationClassification,
} from '@/registry';
import type { AiProvider, AiResult } from './provider';

/**
 * AI 相談：相談の文を分類する（ConsultationClassification と同じ形）。切り口の選び方と並べ方はルール（rankRecipes）のまま。
 * AI には分類の定義だけを渡す。正解表（cases.ts / cases-validation.ts）の文は例に使わない（点が当てにならなくなるため）。
 */

const NEEDS = ['true', 'false', 'unknown'] as const;
const AUDIENCES = [...AUDIENCE_IDS, 'UNKNOWN'] as const;
const nullable = (description: string) => ({ type: ['string', 'null'], description });
const enumOf = (values: readonly string[], description: string) => ({ type: 'string', enum: [...values], description });

/** OpenAI の strict な JSON Schema（全項目が必須、分からない時は null / UNKNOWN / unknown） */
export const CONSULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rationale: { type: 'string', description: '判断の要点（1文、80字まで）' },
    primary_goal: enumOf(GOAL_CODES, 'いちばん伝えたいこと'),
    expected_action: enumOf(ADVISOR_ACTIONS, '案を出す／確認する／作れない'),
    missing_info: { type: 'array', items: enumOf(MISSING_INFO, '確認で聞くこと'), description: 'CLARIFY の時だけ' },
    audience: enumOf(AUDIENCES, '見せる相手'),
    time_scope: nullable('期間（例：2021-2025、5y）。書かれていなければ null'),
    time_mode: enumOf(TIME_MODES, '時間の扱い'),
    comparison_dimension: nullable('比べる対象の切り口（例：地域、製品）'),
    measure: nullable('指標（例：売上、利益率）'),
    comparison_intent: enumOf(COMPARISON_INTENTS, '比較の意味'),
    composition_intent: enumOf(COMPOSITION_INTENTS, '構成の意味'),
    measure_additivity: enumOf(ADDITIVITY, '指標を足し合わせられるか'),
    series_count: enumOf(SERIES_COUNTS, '比べる項目が1つか複数か'),
    needs_exact_values: enumOf(NEEDS, '正確な数値が要るか'),
    needs_size_context: enumOf(NEEDS, '規模（大きさ）も伝えたいか'),
    needs_rate_context: enumOf(NEEDS, '成長率・伸び率も伝えたいか'),
    business_question: nullable('答えたい問いを1文で（相談文から言える範囲で）'),
    decision_context: nullable('何を決めるための資料か（書かれていれば）'),
    confidence: { type: 'number', description: '0〜1' },
  },
  required: [
    'rationale', 'primary_goal', 'expected_action', 'missing_info', 'audience', 'time_scope', 'time_mode', 'comparison_dimension', 'measure',
    'comparison_intent', 'composition_intent', 'measure_additivity', 'series_count', 'needs_exact_values', 'needs_size_context', 'needs_rate_context',
    'business_question', 'decision_context', 'confidence',
  ],
} as const;

const need = z.enum(NEEDS).transform((v) => (v === 'unknown' ? 'unknown' : v === 'true'));

/** AI の返事の形（検証用） */
export const ConsultAiSchema = z.object({
  rationale: z.string(),
  primary_goal: z.enum(GOAL_CODES),
  expected_action: z.enum(ADVISOR_ACTIONS),
  missing_info: z.array(z.enum(MISSING_INFO)),
  audience: z.enum(AUDIENCES),
  time_scope: z.string().nullable(),
  time_mode: z.enum(TIME_MODES),
  comparison_dimension: z.string().nullable(),
  measure: z.string().nullable(),
  comparison_intent: z.enum(COMPARISON_INTENTS),
  composition_intent: z.enum(COMPOSITION_INTENTS),
  measure_additivity: z.enum(ADDITIVITY),
  series_count: z.enum(SERIES_COUNTS),
  needs_exact_values: need,
  needs_size_context: need,
  needs_rate_context: need,
  business_question: z.string().nullable(),
  decision_context: z.string().nullable(),
  confidence: z.number(),
});
export type ConsultAi = z.infer<typeof ConsultAiSchema>;

export const CONSULT_SYSTEM = `あなたは、ビジネス資料のチャート選びを手伝うアシスタントです。
ユーザーの相談文（日本語か英語）を読み、下の定義どおりに分類して JSON で返します。チャートの種類は選びません（アプリが分類から選びます）。

大原則
- 相談文に書かれていること、はっきり読み取れることだけで決める。分からない項目は null / UNKNOWN / unknown にする（推測で埋めない）
- 言葉の表面ではなく、ユーザーが最終的に何を見せたい・決めたいかで判断する

primary_goal（いちばん伝えたいこと）
- TREND：時間とともにどう変わったか（推移、伸びてきた軌跡、どこが一番速く伸びたか）。
  年ごとの値を並べて見せる話（比べる相手が年や月そのもの）も TREND。金額の内訳を積み上げた推移（何が全体の伸びを支えたか）も TREND
- COMPARISON：時間以外の項目（地域・製品・拠点など）どうしの大小・順位・差（予算と実績の差、前年と今年の項目ごとの増減、ランキング、平均との差）
- COMPOSITION：全体の中の割合・シェア・構成比が主役の時（構成比がどう変わったか、シェアが伸びたか、ある時点の内訳、規模と中身）
- CONTRIBUTION：1つの数字（例：営業利益）の始点から終点までの増減を、要因（数量・価格・コストなど）に分けて、何がどれだけ効いたかを示す時だけ。
  「どの事業が全体の伸びを支えたか」のように内訳の推移を見る話は CONTRIBUTION ではなく TREND（composition_intent は BREAKDOWN）
- RELATIONSHIP：項目ごとに2つ以上の指標を持ち、その関係や位置づけを見る（例：製品ごとの市場成長率と利益率で投資先を選ぶ、相関、ポジショニング）。
  「成長率」「利益率」が指標の名前として並んでいる時は、時間の推移（TREND）ではない
- EVALUATION：複数の評価軸で点数をつけて総合的に評価する（スコアカード、強み・弱みの評価）

expected_action
- RECOMMEND：ふつうはこれ。多少あいまいでも、目的か指標のどちらかが分かれば案を出す
- CLARIFY：何の数字か（指標）も、何を知りたいか（見方）も書かれていない時（例：「数字をまとめたい」）。
  または「平均より伸びている」のように、伸び率を平均と比べる基準（単純平均か全体の伸び率か）で答えが変わる時。
  値そのものを平均と比べる（平均を下回る店舗を探す、など）のははっきりしているので RECOMMEND（comparison_intent は AVERAGE_GAP）
- UNSUPPORTED：primary_goal が EVALUATION の時だけ（このアプリには評価のチャートがまだない）
missing_info（CLARIFY の時だけ。ほかは空の配列）
- MEASURE：指標が分からない／VIEW：何を知りたいかが分からない／DECISION：何を決めるための資料か分からない／AVERAGE_BASIS：平均の基準が分からない

audience：EXECUTIVE_MEETING（経営会議・役員・経営陣）、SALES_MEETING（営業会議・顧客への提案）、REPORT（報告書・月報・資料）、OTHER、UNKNOWN（書かれていない）

time_mode（時間の扱い）
- NONE：1時点（今期の内訳、最新の順位など）
- MULTI_PERIOD：期間を通した推移や伸び（「推移」「過去5年」「2021〜2025年に」「from 2021 to 2025」「月次」）
- TWO_POINT：2つの時点そのものを並べて比べると書かれた時だけ（「前年と今年で」「前年比」「2021年と2025年で」「開始と終了」）
- UNKNOWN：時間を思わせる言葉（推移・変化・伸び・年・今期など）はあるが、どれか決められない時。時間の言葉も期間も何もなければ NONE
time_scope：年や期間の長さが数字で書かれている時だけ「2021-2025」「5y」の形。「前年と今年」「今期」のように数字がなければ null

comparison_intent（比較の意味）
- LEVEL：大小・順位（どこが一番大きいか）
- DELTA：差の大きさを見せたい時（予算と実績の差、前年からどれだけ増えた・減ったか）。「どう違うか」「どう変わったか」だけなら DELTA にしない
- RANK_CHANGE：順位の入れ替わり（抜いた・逆転した）
- AVERAGE_GAP：平均との差（平均より上か下か）
- NONE：比べる話ではない／UNKNOWN：分からない
composition_intent（構成の意味）
- SHARE：割合・シェア・構成比（構成比の推移や、シェアが伸びたかも SHARE）
- SIZE_AND_SHARE：全体や各部分の大きさと、その中身の割合の両方（例：国ごとの市場規模とその中のシェア）
- BREAKDOWN：金額の全体の推移とその内訳（何が全体の伸びを支えているか、費用の内訳の推移）
- NONE／UNKNOWN

measure_additivity：元になる指標を足し合わせられるか。ADDITIVE（売上・件数・人数・費用など）、NON_ADDITIVE（利益率・平均・単価・指数・満足度など、合計に意味がないもの）、UNKNOWN。
  シェア・構成比は、足せる量（売上など）を割合にしたものなので ADDITIVE として扱う
series_count：SINGLE（全社の売上だけなど1系列）、MULTIPLE（地域別・製品別・競合と比べるなど複数）、UNKNOWN。
  シェア・構成・内訳の話は、全体を分けた複数の部分があるので MULTIPLE（「自社のシェア」も、自社とそれ以外に分かれる）
needs_exact_values / needs_size_context / needs_rate_context：相談文で求められていれば "true"。書かれていなければ "unknown"（"false" はほぼ使わない）
  - needs_rate_context は成長率・伸び率・CAGR を伝えたい時。関係（RELATIONSHIP）で成長率が指標の1つとして出てくるだけなら "unknown"
comparison_dimension：比べる切り口（地域・製品・事業・チャネル・競合など）。「年ごと」「月別」のような時間の単位は入れない
measure：指標の名前（売上、営業利益、シェア、利益率など）
business_question：答えたい問いを短い1文で。decision_context：何を決めるための資料か（書かれていれば）
confidence：分類の確かさ（0〜1）。rationale：判断の要点を1文で

例（形の参考。これと同じ文が来るとは限らない）
- 「店舗ごとの客単価を今月だけ並べて、低い店を洗い出したい」→ COMPARISON、time_mode NONE、comparison_intent LEVEL、measure 客単価、NON_ADDITIVE、MULTIPLE
- 「有料会員の割合が、この2年でどう変わったかを報告したい」→ COMPOSITION、MULTI_PERIOD、composition_intent SHARE、ADDITIVE、audience REPORT
- 「受注額の月次の推移を、どの営業チームが支えているか分けて見せたい」→ TREND、MULTI_PERIOD、composition_intent BREAKDOWN、ADDITIVE、MULTIPLE
- 「チームの数字を見やすくしたい」→ CLARIFY、missing_info [MEASURE, VIEW]`;

/** AI の分類を、アプリの分類（ConsultationClassification）に直す。アプリの約束（評価は作れない、確認以外は聞くことなし）もここで守る */
export function toClassification(a: ConsultAi): ConsultationClassification {
  const action = a.primary_goal === 'EVALUATION' ? 'UNSUPPORTED' : a.expected_action === 'UNSUPPORTED' ? 'RECOMMEND' : a.expected_action;
  const asked = [...new Set(a.missing_info)];
  const missing = action !== 'CLARIFY' ? [] : asked.length ? asked : (['VIEW'] as const);
  return ConsultationClassificationSchema.parse({
    primary_goal: a.primary_goal,
    business_question: a.business_question,
    audience: a.audience,
    // 期間は数字が書かれている時だけ（「前年と今年」は期間ではない）
    time_scope: a.time_scope && /\d/.test(a.time_scope) ? a.time_scope : null,
    comparison_dimension: a.comparison_dimension,
    measure: a.measure,
    decision_context: a.decision_context,
    needs_exact_values: a.needs_exact_values,
    needs_size_context: a.needs_size_context,
    needs_rate_context: a.needs_rate_context,
    confidence: Math.min(1, Math.max(0, a.confidence)),
    expected_action: action,
    missing_info: missing,
    time_mode: a.time_mode,
    comparison_intent: a.comparison_intent,
    composition_intent: a.composition_intent,
    // 構成（シェア・内訳）の話なら、元の量は足せる（シェアを「率」と見て構成の案が全部消えるのを防ぐ）
    measure_additivity: a.measure_additivity === 'NON_ADDITIVE' && ['SHARE', 'SIZE_AND_SHARE', 'BREAKDOWN'].includes(a.composition_intent) ? 'UNKNOWN' : a.measure_additivity,
    // 構成の話は、全体を分けた部分が複数ある（「自社のシェア」も自社とそれ以外）
    series_count: a.series_count === 'SINGLE' && ['SHARE', 'SIZE_AND_SHARE', 'BREAKDOWN'].includes(a.composition_intent) ? 'MULTIPLE' : a.series_count,
  });
}

/** 相談文の長さの上限（これより長い文は送らない） */
export const CONSULT_MAX_CHARS = 800;

export async function classifyWithAi(text: string, provider: AiProvider): Promise<AiResult<ConsultationClassification>> {
  const input = text.trim().slice(0, CONSULT_MAX_CHARS);
  const r = await provider.json({
    feature: 'ai_consult',
    system: CONSULT_SYSTEM,
    user: `相談文：\n${input}`,
    jsonSchema: CONSULT_JSON_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'consultation_classification',
    schema: ConsultAiSchema,
  });
  return r.ok ? { ok: true, data: toClassification(r.data), usage: r.usage } : r;
}
