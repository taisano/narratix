import {
  ConsultationClassificationSchema, GOAL_CODES,
  type AdvisorAction, type Additivity, type ComparisonIntent, type CompositionIntent, type ConsultationClassification,
  type ConsultationResult, type GoalCode, type MissingInfo, type SeriesCount, type TimeMode,
} from '@/registry';

/**
 * 相談文の分類（ルール版）。AI のキーを使う前の経路で、AI 版と同じ形（ConsultationClassification）を返す。
 * 相談文に書かれていないことは決めない（null / 'unknown'）。
 */

const has = (text: string, words: readonly string[]) => words.some((w) => text.includes(w));
const count = (text: string, words: readonly string[]) => words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);

const GOAL_WORDS: Record<GoalCode, readonly string[]> = {
  TREND: ['推移', '成長', '伸び', '伸長', '増加', '減少', '減って', '増えて', 'トレンド', '変化', '年間', '過去', '時系列', '年々', 'growth', 'growing', 'trend', 'over time'],
  COMPARISON: ['比較', '比べ', '順位', 'ランキング', '上位', '一番', 'トップ', '差', '予算', '実績', '前年比', 'compare', 'ranking', 'versus', 'vs'],
  COMPOSITION: ['構成', '内訳', 'シェア', '割合', '比率', '占め', '支えて', 'share', 'mix', 'breakdown'],
  CONTRIBUTION: ['要因', 'なぜ', '寄与', '分解', 'ブリッジ', 'ウォーターフォール', 'driver', 'why'],
  RELATIONSHIP: ['相関', '関係', 'ポジショニング', '散布', 'correlation', 'relationship'],
  EVALUATION: ['評価', '強み', '弱み', 'スコア', '総合', 'evaluate', 'scorecard'],
};

const AUDIENCE_WORDS: [ConsultationClassification['audience'], readonly string[]][] = [
  ['EXECUTIVE_MEETING', ['経営会議', '役員', '取締役', '経営陣', '社長', 'CEO', '経営層', 'board', 'executive']],
  ['SALES_MEETING', ['営業会議', '営業チーム', '営業部', '営業の場', '商談', '顧客への', 'お客様への', 'クライアント', '提案資料', '提案', 'sales']],
  ['REPORT', ['レポート', '報告書', '資料', '月報', '週報', 'report']],
];

const DIMENSIONS = ['地域', '国', '製品', '商品', '事業', '部門', 'チャネル', '顧客', 'ブランド', 'セグメント', '店舗', '拠点', '市場'] as const;
const MEASURES = ['売上', '利益', '販売数', '件数', 'シェア', 'コスト', '費用', '人数', '台数', '単価', '市場規模'] as const;

const RATE_WORDS = ['成長率', '伸び率', 'CAGR', '年率', '何%', '何％', '増加率', '成長している', '伸びている', 'どこが成長', 'どこが伸び', 'growth rate'];
const SIZE_WORDS = ['規模', '大きさ', '金額', '全体', '総額', '市場規模', 'size'];
const EXACT_WORDS = ['正確', '数値', '具体的な数字', '数字で', 'exact'];

/** 時間の単位（「年ごと」「月別」は比べる対象ではない） */
const TIME_UNITS = ['年', '月', '期', '四半期', '週', '日', '年度', '月次'];

/** 比べる対象：「◯◯別」「◯◯ごと」「各◯◯」。時間の単位は除く。無ければ一覧の言葉 */
function findDimension(t: string): string | null {
  for (const m of t.matchAll(/([一-龠ァ-ヶーA-Za-z]{1,6})(?:別|ごと)/g)) {
    const w = m[1]!.replace(/^.*[のと、]/, '');
    if (w && !TIME_UNITS.includes(w) && !TIME_UNITS.some((u) => w.endsWith(u) && w.length <= u.length + 1)) return w;
  }
  const each = /各([一-龠ァ-ヶー]{1,4})/.exec(t);
  if (each) return each[1]!;
  return DIMENSIONS.find((d) => t.includes(d) && !t.includes(d + '数')) ?? null;
}

const has2 = (t: string, re: RegExp) => re.test(t);

/** 時間の扱い */
function findTimeMode(t: string, time: string | null, delta: boolean): TimeMode {
  if (has2(t, /前年と今年|昨年と今年|前年比|前期比|前年対比|対前年|(?:19|20)\d{2}年?と(?:19|20)\d{2}|2時点|開始と終了|最初と最後/)) return 'TWO_POINT';
  if (time && delta && has2(t, /どれだけ|差|増減|増やし|減らし/)) return 'TWO_POINT';
  // 変化の言葉も期間も無ければ、1時点として扱う（例：「市場のシェアの内訳を報告したい」）
  if (!time && !has2(t, /変|推移|伸|増|減|成長|拡大|縮小|動き|トレンド|時系列|年々|月次|年ごと|月ごと|grow|trend|change/i)) return 'NONE';
  if (time || has2(t, /推移|月次|年次|年ごと|月ごと|トレンド|時系列|年々|over time|trend/i)) return 'MULTI_PERIOD';
  if (has2(t, /今期|今年度|最新|現在|直近の|今月|時点の|latest/)) return 'NONE';
  return 'UNKNOWN';
}

function findComparison(t: string): ComparisonIntent {
  if (has2(t, /入れ替わ|逆転|順位の変化|順位がどう|順位はどう|追い抜|overtook|rank change/)) return 'RANK_CHANGE';
  if (has2(t, /平均/)) return 'AVERAGE_GAP';
  if (has2(t, /予算|実績|計画|目標と|差|増減|増えた|減った|どれだけ.{0,6}(?:増|減)|前年比|前期比|variance|difference/)) return 'DELTA';
  if (has2(t, /ランキング|順位|上位|トップ|一番|大小|規模を比|比べ|比較|ranking|compare/)) return 'LEVEL';
  return 'UNKNOWN';
}

function findComposition(t: string): CompositionIntent {
  const share = has2(t, /シェア|構成|内訳|割合|比率|占め|中身|share|mix|breakdown/);
  const size = has2(t, /規模|大きさ/);
  if (share && size) return 'SIZE_AND_SHARE';
  if (has2(t, /支えて|牽引|内訳の推移|内訳.*推移|全体と内訳/)) return 'BREAKDOWN';
  if (share) return 'SHARE';
  return 'UNKNOWN';
}

function findAdditivity(t: string, measure: string | null): Additivity {
  if (has2(t, /利益率|粗利率|達成率|回転率|利用率|離職率|比率の推移|単価|指数|満足度|平均値|率の推移|rate of|margin/)) return 'NON_ADDITIVE';
  if (measure && ['売上', '販売数', '件数', 'コスト', '費用', '人数', '台数', '市場規模'].includes(measure)) return 'ADDITIVE';
  if (has2(t, /出店数|店舗数|顧客数|販売数|件数/)) return 'ADDITIVE';
  return 'UNKNOWN';
}

function findSeries(t: string, dim: string | null, composition: CompositionIntent): SeriesCount {
  if (dim || composition !== 'UNKNOWN' || has2(t, /各|それぞれ|\d+社|\d+地域|\d+カ国|by region|by product/)) return 'MULTIPLE';
  if (has2(t, /全社の|会社全体の|自社の売上|新規顧客数|売上高を並べ|年ごとの売上/)) return 'SINGLE';
  return 'UNKNOWN';
}

/** 行動：まだ作れない／確認する／案を出す。確認なら聞くこと */
function findAction(t: string, goal: GoalCode, goalWords: number, time: string | null, measure: string | null, dim: string | null): { action: AdvisorAction; missing: MissingInfo[] } {
  if (goal === 'CONTRIBUTION' || goal === 'RELATIONSHIP' || goal === 'EVALUATION') return { action: 'UNSUPPORTED', missing: [] };
  if (has2(t, /平均より(?:伸|成長|増)/)) return { action: 'CLARIFY', missing: ['AVERAGE_BASIS'] };
  const missing: MissingInfo[] = [];
  if (!measure) missing.push('MEASURE');
  if (goalWords === 0 && !time) missing.push('VIEW');
  if (missing.length && goalWords === 0 && !time) {
    if (!dim || has2(t, /グラフ|チャート|まとめ/)) return { action: 'CLARIFY', missing: [...missing, ...(has2(t, /まとめ|グラフ/) ? (['DECISION'] as MissingInfo[]) : [])] };
  }
  return { action: 'RECOMMEND', missing: [] };
}

/** 期間：「2021〜2025年」「2021-2025」「過去5年」「5年間」など。見つからなければ null */
export function findTimeScope(text: string): string | null {
  const range = /((?:19|20)\d{2})\s*年?\s*(?:〜|～|~|-|–|—|から|to)\s*((?:19|20)\d{2})/.exec(text);
  if (range) return `${range[1]}-${range[2]}`;
  const years = /(?:過去|直近|この)?\s*(\d{1,2})\s*(?:年間|年分|か年|カ年)/.exec(text) ?? /過去\s*(\d{1,2})\s*年/.exec(text);
  if (years) return `${years[1]}y`;
  const single = text.match(/(?:19|20)\d{2}/g);
  if (single && new Set(single).size >= 2) return `${single[0]}-${single[single.length - 1]}`;
  return null;
}

export function classifyConsultation(text: string): ConsultationClassification {
  const t = text.normalize('NFKC');
  const scores = GOAL_CODES.map((g) => ({ g, n: count(t, GOAL_WORDS[g]) }));
  const time = findTimeScope(t);
  // 目的の言葉が無ければ、期間があれば推移、無ければ比較
  const best = [...scores].sort((a, b) => b.n - a.n)[0]!;
  let goal: GoalCode = best.n > 0 ? best.g : time ? 'TREND' : 'COMPARISON';
  // 同点で期間が書かれていれば推移を優先
  if (best.n > 0 && time && scores.find((s) => s.g === 'TREND')!.n === best.n) goal = 'TREND';
  const matched = scores.filter((s) => s.n > 0).length;

  const audience = AUDIENCE_WORDS.find(([, w]) => has(t, w))?.[0] ?? 'UNKNOWN';
  const dim = findDimension(t);
  const measure = MEASURES.find((m) => t.includes(m)) ?? (has2(t, /数字|数値/) ? null : /([一-龠ァ-ヶー]{1,6}数)/.exec(t)?.[1] ?? null);
  const comparison = findComparison(t);
  const composition = findComposition(t);
  const timeMode = findTimeMode(t, time, comparison === 'DELTA');
  const { action, missing } = findAction(t, goal, best.n, time, measure, dim);
  // 目的の補正：構成の意味がはっきりしていて、推移（期間や「推移」）でも差・入れ替わりでもなければ構成
  const explicitTrend = !!time || has2(t, /推移|トレンド|時系列|月次|over time/);
  if (composition !== 'UNKNOWN' && (comparison === 'UNKNOWN' || comparison === 'LEVEL') && !(goal === 'TREND' && explicitTrend) && action === 'RECOMMEND') goal = 'COMPOSITION';
  // 2時点の差・入れ替わりは比較（推移の言葉があっても）
  if ((comparison === 'DELTA' || comparison === 'RANK_CHANGE') && timeMode === 'TWO_POINT' && goal === 'TREND') goal = 'COMPARISON';

  return ConsultationClassificationSchema.parse({
    primary_goal: goal,
    business_question: null,
    audience,
    time_scope: time,
    comparison_dimension: dim,
    measure,
    decision_context: null,
    needs_exact_values: has(t, EXACT_WORDS) ? true : 'unknown',
    needs_size_context: has(t, SIZE_WORDS) ? true : 'unknown',
    needs_rate_context: has(t, RATE_WORDS) ? true : 'unknown',
    // ルール版の確信度：目的の言葉が1種類だけはっきり出ていれば高い
    confidence: best.n === 0 ? 0.3 : matched === 1 ? 0.8 : 0.6,
    expected_action: action,
    missing_info: missing,
    time_mode: timeMode,
    comparison_intent: comparison,
    composition_intent: composition,
    measure_additivity: findAdditivity(t, measure),
    series_count: findSeries(t, dim, composition),
  });
}

/** 画面に出す要約（ルール版は決まった形の文で作る。数値や結論は書かない） */
export function summarize(text: string, c: ConsultationClassification, locale: 'ja' | 'en'): Pick<ConsultationResult, 'consultation_summary' | 'interpreted_question'> {
  const goalJa: Record<GoalCode, string> = { TREND: '推移', COMPARISON: '比較', COMPOSITION: '構成', CONTRIBUTION: '要因', RELATIONSHIP: '関係', EVALUATION: '評価' };
  const audJa: Record<string, string> = { EXECUTIVE_MEETING: '経営会議', SALES_MEETING: '営業の場', REPORT: 'レポート', OTHER: '', UNKNOWN: '' };
  if (locale === 'en') {
    return {
      consultation_summary: `Explain the ${c.primary_goal.toLowerCase()} of ${c.measure ?? 'the measure'}${c.comparison_dimension ? ` by ${c.comparison_dimension}` : ''}${c.time_scope ? ` (${c.time_scope})` : ''}.`,
      interpreted_question: 'Which way of telling it fits what you want to say?',
    };
  }
  const who = audJa[c.audience] ? `${audJa[c.audience]}で` : '';
  const what = [c.comparison_dimension && `${c.comparison_dimension}別`, c.measure].filter(Boolean).join('の') || 'データ';
  const when = c.time_scope ? `（${c.time_scope.replace(/^(\d+)y$/, '$1年分')}）` : '';
  const needs = [c.needs_rate_context === true && '成長率', c.needs_size_context === true && '規模', c.needs_exact_values === true && '正確な数値'].filter(Boolean);
  return {
    consultation_summary: `${what}${when}の${goalJa[c.primary_goal]}を、${who}伝えたい`,
    interpreted_question: needs.length ? `${needs.join('・')}も含めて、どう伝えるか` : `${goalJa[c.primary_goal]}をどう伝えるか`,
  };
}
