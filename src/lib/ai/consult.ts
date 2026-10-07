import { z } from 'zod';
import {
  ADDITIVITY, ADVISOR_ACTIONS, AUDIENCE_IDS, COMPARISON_INTENTS, COMPOSITION_INTENTS, ConsultationClassificationSchema, GOAL_CODES,
  DESIRED_YES_IDS, MISSING_INFO, OUTCOME_DIRECTION_IDS, PROOF_NEED_IDS, ROUTE_SIGNAL_IDS, SERIES_COUNTS, STORY_SCOPE_IDS, TIME_MODES,
  type ConsultationClassification, type StoryReading,
} from '@/registry';
import type { AiProvider, AiResult } from './provider';
import { ConsultationAnalysisV2Schema } from '@/registry/consultation-model';

/**
 * AI 相談：相談の文を分類する（ConsultationClassification と同じ形）。切り口の選び方と並べ方はルール（rankRecipes）のまま。
 * AI には分類の定義だけを渡す。正解表（cases.ts / cases-validation.ts）の文は例に使わない（点が当てにならなくなるため）。
 */

const NEEDS = ['true', 'false', 'unknown'] as const;
const AUDIENCES = [...AUDIENCE_IDS, 'UNKNOWN'] as const;
const nullable = (description: string) => ({ type: ['string', 'null'], description });
const enumOf = (values: readonly string[], description: string) => ({ type: 'string', enum: [...values], description });

/** Story 用の読み取り（docs/story-spec.md 5.2）。既存の分類は壊さずに足す */
const STORY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  description: '1枚で答えるか、複数の Question からなる Story かを決めるための読み取り',
  properties: {
    decision_question: nullable('この資料で最終的に決めたい・答えたい問いを1文で（相談文から言える範囲で）'),
    desired_yes: enumOf([...DESIRED_YES_IDS, 'UNKNOWN'], '読み手に期待する状態'),
    primary_barrier: nullable('その Yes を得るのに最も大きい障害・疑問を1文で（書かれていれば）'),
    proof_needs: { type: 'array', items: enumOf(PROOF_NEED_IDS, '証明要求'), description: '問いに答えるためにデータで示す必要があること（相談文にあるものだけ。重要な順）' },
    scope_candidate: enumOf(STORY_SCOPE_IDS, '1枚／Story／独立した複数の相談／確認が必要'),
    route_signals: { type: 'array', items: enumOf(ROUTE_SIGNAL_IDS, '相談文に表れる動き'), description: '3つまで' },
    outcome_direction: enumOf(OUTCOME_DIRECTION_IDS, '結果の向き'),
    confidence: { type: 'number', description: 'この読み取りの確かさ（0〜1）' },
  },
  required: ['decision_question', 'desired_yes', 'primary_barrier', 'proof_needs', 'scope_candidate', 'route_signals', 'outcome_direction', 'confidence'],
} as const;

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
    focus_phrases: { type: 'array', items: { type: 'string' }, description: 'primary_goal を決めるのに重視した相談文の言葉（相談文からそのまま抜き出す。3つまで）' },
    story: STORY_JSON_SCHEMA,
    alternative: {
      anyOf: [
        {
          type: 'object', additionalProperties: false,
          description: '相談文に、答え方（チャート）の違う別の問いがはっきり含まれている時だけ',
          properties: {
            question: { type: 'string', description: 'もう1つの問いを短い1文で' },
            primary_goal: enumOf(GOAL_CODES, 'もう1つの問いの目的'),
            time_mode: enumOf(TIME_MODES, '時間の扱い'),
            comparison_intent: enumOf(COMPARISON_INTENTS, '比較の意味'),
            composition_intent: enumOf(COMPOSITION_INTENTS, '構成の意味'),
            needs_size_context: enumOf(NEEDS, '規模も伝えたいか'),
            needs_rate_context: enumOf(NEEDS, '成長率も伝えたいか'),
            focus_phrases: { type: 'array', items: { type: 'string' }, description: 'この問いの根拠の言葉（相談文からそのまま。3つまで）' },
          },
          required: ['question', 'primary_goal', 'time_mode', 'comparison_intent', 'composition_intent', 'needs_size_context', 'needs_rate_context', 'focus_phrases'],
        },
        { type: 'null' },
      ],
    },
  },
  required: [
    'rationale', 'primary_goal', 'expected_action', 'missing_info', 'audience', 'time_scope', 'time_mode', 'comparison_dimension', 'measure',
    'comparison_intent', 'composition_intent', 'measure_additivity', 'series_count', 'needs_exact_values', 'needs_size_context', 'needs_rate_context',
    'business_question', 'decision_context', 'confidence', 'focus_phrases', 'story', 'alternative',
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
  focus_phrases: z.array(z.string()).default([]),
  // 古い返事（Story の読み取りが無い）も読めるように
  story: z.object({
    decision_question: z.string().nullable(),
    desired_yes: z.enum([...DESIRED_YES_IDS, 'UNKNOWN']),
    primary_barrier: z.string().nullable(),
    proof_needs: z.array(z.string()),
    scope_candidate: z.enum(STORY_SCOPE_IDS),
    route_signals: z.array(z.string()),
    outcome_direction: z.enum(OUTCOME_DIRECTION_IDS),
    confidence: z.number(),
  }).nullable().default(null),
  alternative: z.object({
    question: z.string(),
    primary_goal: z.enum(GOAL_CODES),
    time_mode: z.enum(TIME_MODES),
    comparison_intent: z.enum(COMPARISON_INTENTS),
    composition_intent: z.enum(COMPOSITION_INTENTS),
    needs_size_context: need,
    needs_rate_context: need,
    focus_phrases: z.array(z.string()).default([]),
  }).nullable().default(null),
  // Stage 3: 5層相談分析（後方互換性：既存のnullは保持）
  analysis_v2: ConsultationAnalysisV2Schema.nullable().default(null),
});

export type ConsultAi = z.infer<typeof ConsultAiSchema>;

export const CONSULT_SYSTEM = `あなたは、ビジネス資料のチャート選びを手伝うアシスタントです。
ユーザーの相談文（日本語か英語）を読み、下の定義どおりに分類して JSON で返します。チャートの種類は選びません（アプリが分類から選びます）。

大原則
- 文で答える項目（business_question・decision_context・rationale・alternative.question・story.decision_question・story.primary_barrier）は、
  「出力の言語」で書く（相談文の言語と違っても）。focus_phrases だけは相談文から一字一句そのまま抜き出す
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
  「成長率」「利益率」が指標の名前として並んでいる時は、時間の推移（TREND）ではない。
  ただし「規模と成長率」が同じ指標（例：売上）の大きさと伸びのことで、期間（例：2021〜2025年）の推移があるなら RELATIONSHIP ではなく TREND
  （needs_size_context と needs_rate_context を "true" にする）。RELATIONSHIP は、利益率など別の指標が並ぶ時
  項目ごとの「規模（人口・売上・台数など）」と「水準（1人当たり・単価・利益率など）」を一緒に見せ、規模の大きい項目が基準より上か下かを伝えたい時も
  RELATIONSHIP（needs_size_context を "true" にする）
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

focus_phrases：primary_goal などを決めるのに重視した言葉を、相談文から一字一句そのまま抜き出す（3つまで。言い換えない）
alternative：相談文に、見せ方の違う2つの問いがはっきり混ざっている時だけ、もう1つの問いを返す（ふつうは null）。
  例：期間の推移（どこが伸び、どこが停滞したか＝TREND）と、今の位置づけ（規模が大きく成長率も高いのはどこか＝RELATIONSHIP）の両方が書かれている。
  primary_goal と同じ目的なら返さない。もう1つの問いも、相談文に書かれている範囲で分類する
story（1枚か Story かを決めるための読み取り。チャートや結論は決めない）
- decision_question：この資料で最終的に決めたい・答えたい問い（例：どの市場を優先して追うべきか）。書かれていなければ business_question と同じでよい
- desired_yes：読み手に期待する状態。RECOGNITION（事実・問題・機会を認識してもらう。報告・共有）、INTERPRETATION（原因や意味に納得してもらう。理由の特定）、
  SELECTION（選択肢から方向を選んでもらう。優先・比較して決める）、FEASIBILITY（実行できると納得してもらう）、COMMITMENT（予算・人員・行動の承認）、UNKNOWN。
  相談文に書かれている範囲で決める（報告したいだけなら RECOGNITION。承認・実行まで書かれていなければ広げない）
- primary_barrier：その Yes を得るのに最も大きい疑問・障害（例：市場規模と回復率で候補が一致しない）。書かれていなければ null
- proof_needs：問いに答えるためにデータで示す必要があること。OVERALL_CHANGE（全体の変化）、GROWTH_SPEED（伸びの速さ）、CONTRIBUTION（全体の増減への寄与。算術的な寄与で原因ではない）、
  CURRENT_MIX（今の構成）、MIX_CHANGE（構成比の変化）、SIZE_CONTEXT（規模）、SEGMENT_DIFFERENCE（項目間の差）、RANKING（順位）、TARGET_GAP（目標・平均との差）、
  SECOND_METRIC（別の指標での見え方）、ITEM_SHARE（特定項目の比率）、BRIDGE（始点から終点への内訳）、RELATIONSHIP（2指標の関連。因果ではない）、POSITIONING（位置づけ）。
  相談文から読み取れるものだけを、重要な順に
- scope_candidate：ONE_SLIDE_STORY（一つの中心の問いに1枚で答える）、STORY_FLOW（一つの決めたい問いに向けて、順序のある複数の問いを確かめる必要がある。
  事実→差→理由→判断のように）、MULTIPLE_QUESTIONS（互いに独立した相談が混ざっている）、CLARIFY（事実を見せるだけか、理由・判断まで求めるかが読み取れない）。
  問いが複数あるだけでは STORY_FLOW にしない（同じ決めたい問いに向かっている時だけ）
- route_signals：相談文に表れる動き（3つまで）。DATA_DISCOVERY（データから全体像や差を見つける）、MISMATCH（全体と違う差・例外、指標で見え方が違う）、
  EXPLANATION（違い・変化を説明する）、ROOT_CAUSE（原因を特定する）、PRIORITIZATION（候補から選ぶ・優先順位）、URGENCY（今動く必要）、INVESTMENT（投資・予算の判断）、
  VALIDATION（主張・仮説の検証）、EXECUTION（実行計画・展開）、ANSWER_READY（結論が決まっていて承認を得たい）
- outcome_direction：結果の向き。POSITIVE（伸びた・良い）、NEGATIVE（落ちた・悪い）、MIXED（両方）、NEUTRAL、UNKNOWN
- confidence：この読み取りの確かさ（0〜1）

補足（相談文のあとに「補足」がある時）：ユーザーが提案を見て書き足した意図。相談文より優先して分類し直す

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

/** AI の読み取り：重視した言葉と、もう1つの問い（あれば）、Story 用の読み取り（あれば） */
export interface ConsultReading {
  focus: string[];
  alternative: { question: string; classification: ConsultationClassification; focus: string[] } | null;
  story?: StoryReading | null;
}

/** 相談文に「1枚で」「複数枚」などの明示があるか（規則。AI には決めさせない） */
export function explicitSize(text: string): StoryReading['explicitSize'] {
  if (/(1|１|一)\s*枚(で|に|だけ|に収め|にまとめ)|one\s+slide|single\s+slide/i.test(text)) return 'ONE';
  if (/(複数|何|数)\s*枚|一連の(流れ|ストーリー)|ストーリー(で|として|に)|\bstory\b|several\s+slides|multiple\s+slides|a\s+deck/i.test(text)) return 'MULTIPLE';
  return null;
}

/** AI の Story の読み取りを、アプリの形に直す（知らない語は外す。長さを切る） */
export function toStoryReading(a: ConsultAi, text: string): StoryReading | null {
  const s = a.story;
  if (!s) return null;
  const clip = (v: string | null, n: number) => (v && v.trim() ? v.trim().slice(0, n) : null);
  return {
    decisionQuestion: clip(s.decision_question, 200) ?? clip(a.business_question, 200),
    desiredYes: s.desired_yes === 'UNKNOWN' ? null : s.desired_yes,
    primaryBarrier: clip(s.primary_barrier, 200),
    proofNeeds: [...new Set(s.proof_needs.filter((p): p is StoryReading['proofNeeds'][number] => (PROOF_NEED_IDS as readonly string[]).includes(p)))].slice(0, 6),
    scopeCandidate: s.scope_candidate,
    routeSignals: [...new Set(s.route_signals.filter((r): r is StoryReading['routeSignals'][number] => (ROUTE_SIGNAL_IDS as readonly string[]).includes(r)))].slice(0, 3),
    outcomeDirection: s.outcome_direction,
    explicitSize: explicitSize(text),
    confidence: Math.min(1, Math.max(0, s.confidence)),
  };
}

/** 相談文に実際にある言葉だけを残す（AI が言い換えた言葉は出さない） */
export function keepPhrases(text: string, phrases: string[]): string[] {
  return [...new Set(phrases.map((p) => p.trim()).filter((p) => p.length >= 2 && text.includes(p)))].slice(0, 3);
}

export function toReading(a: ConsultAi, text: string, primary: ConsultationClassification): ConsultReading {
  const alt = a.alternative;
  const altGoal = alt && alt.primary_goal !== 'EVALUATION' && alt.primary_goal !== primary.primary_goal ? alt : null;
  return {
    story: toStoryReading(a, text),
    focus: keepPhrases(text, a.focus_phrases),
    alternative: altGoal ? {
      question: altGoal.question.slice(0, 120),
      focus: keepPhrases(text, altGoal.focus_phrases),
      classification: ConsultationClassificationSchema.parse({
        ...primary,
        primary_goal: altGoal.primary_goal,
        business_question: altGoal.question.slice(0, 200),
        time_mode: altGoal.time_mode,
        comparison_intent: altGoal.comparison_intent,
        composition_intent: altGoal.composition_intent,
        needs_size_context: altGoal.needs_size_context,
        needs_rate_context: altGoal.needs_rate_context,
        expected_action: 'RECOMMEND',
        missing_info: [],
      }),
    } : null,
  };
}

/** 相談文の長さの上限（これより長い文は送らない） */
export const CONSULT_MAX_CHARS = 800;

/** 補足の長さの上限（提案を見て書き足す意図） */
export const CONSULT_NOTE_MAX_CHARS = 300;

export async function classifyWithAi(text: string, provider: AiProvider, note?: string, locale: 'ja' | 'en' = 'ja'): Promise<AiResult<ConsultationClassification> & { reading?: ConsultReading }> {
  const input = text.trim().slice(0, CONSULT_MAX_CHARS);
  const extra = note?.trim() ? `\n\n補足（提案を見て書き足した意図）：\n${note.trim().slice(0, CONSULT_NOTE_MAX_CHARS)}` : '';
  const r = await provider.json({
    feature: 'ai_consult',
    system: CONSULT_SYSTEM,
    user: `出力の言語：${locale === 'en' ? '英語' : '日本語'}\n\n相談文：\n${input}${extra}`,
    jsonSchema: CONSULT_JSON_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'consultation_classification',
    schema: ConsultAiSchema,
  });
  if (!r.ok) return r;
  const data = toClassification(r.data);
  return { ok: true, data, usage: r.usage, reading: toReading(r.data, input, data) };
}
