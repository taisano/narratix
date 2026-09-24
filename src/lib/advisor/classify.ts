import {
  ConsultationClassificationSchema, GOAL_CODES,
  type ConsultationClassification, type ConsultationResult, type GoalCode,
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
  ['SALES_MEETING', ['営業会議', '営業', '顧客', 'クライアント', '提案', 'sales']],
  ['REPORT', ['レポート', '報告書', '資料', '月報', '週報', 'report']],
];

const DIMENSIONS = ['地域', '国', '製品', '商品', '事業', '部門', 'チャネル', '顧客', 'ブランド', 'セグメント', '店舗', '拠点', '市場'] as const;
const MEASURES = ['売上', '利益', '販売数', '件数', 'シェア', 'コスト', '費用', '人数', '台数', '単価', '市場規模'] as const;

const RATE_WORDS = ['成長率', '伸び率', 'CAGR', '年率', '何%', '何％', '増加率', '成長している', '伸びている', 'どこが成長', 'どこが伸び', 'growth rate'];
const SIZE_WORDS = ['規模', '大きさ', '金額', '全体', '総額', '市場規模', 'size'];
const EXACT_WORDS = ['正確', '数値', '具体的な数字', '数字で', 'exact'];

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
  const dim = DIMENSIONS.find((d) => t.includes(d)) ?? null;
  const measure = MEASURES.find((m) => t.includes(m)) ?? null;

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
