import type { AudienceId, GoalCode, RecipeId } from '@/registry';

/**
 * AI 相談の正解表（叩き台 2026-09-25）。ルール版と AI 版を同じ問題で採点する。
 * expected＝出してほしい案（先頭ほど1番目にふさわしい）、ok＝出ても良い案、ng＝出してほしくない案。
 * unsupported＝まだ作れない相談（案を出さずに「まだ作れない」と言えれば正解）。
 */
export interface AdvisorCase {
  id: string;
  text: string;
  goal: GoalCode;
  audience: AudienceId | 'UNKNOWN';
  rate: boolean | 'unknown';
  size: boolean | 'unknown';
  exact: boolean | 'unknown';
  expected: RecipeId[];
  ok?: RecipeId[];
  ng?: RecipeId[];
  unsupported?: boolean;
  /** 自信がなくてよい（確認を促すのが正解） */
  vague?: boolean;
  aim: string;
}

const U = 'unknown' as const;

export const ADVISOR_CASES: AdvisorCase[] = [
  // ── 推移 ──
  { id: 'T01', text: '海外5地域の売上（2021〜2025年）で、どこが成長しているかを経営会議で伝えたい。', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: true, size: U, exact: U,
    expected: ['TREND_CAGR_TABLE', 'START_END_CAGR', 'SIZE_MIX_CAGR'], ok: ['TREND_SLOPE', 'COMP_VARIANCE'], ng: ['MIX_MEKKO'], aim: '指示書の例。成長率が要る' },
  { id: 'T02', text: '製品別の月次売上の推移を月報にまとめたい。', goal: 'TREND', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_STACKED', 'TREND_COLUMN'], ok: ['TREND_LINE_AVG', 'TREND_SHARE'], ng: ['MIX_MEKKO', 'COMP_RANK'], aim: '素直な推移。月次なので CAGR は主役にしない' },
  { id: 'T03', text: '過去5年の事業別の売上と、全体の伸びを支えている事業を役員に見せたい。', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: U, size: true, exact: U,
    expected: ['SIZE_MIX_CAGR', 'TREND_STACKED', 'TREND_CAGR_TABLE'], ok: ['TREND_SHARE', 'START_END_CAGR'], ng: ['COMP_RANK'], aim: '全体と内訳。「支えている」がカギ' },
  { id: 'T04', text: '店舗ごとの売上の推移を見て、平均より伸びている店を営業会議で確認したい。', goal: 'TREND', audience: 'SALES_MEETING', rate: U, size: U, exact: U,
    expected: ['TREND_LINE_AVG', 'TREND_CAGR_TABLE'], ok: ['TREND_LINE', 'COMP_RANK_AVG', 'START_END_CAGR'], ng: ['MIX_MEKKO'], aim: '「平均より」で平均線' },
  { id: 'T05', text: '2020年と2025年で、ブランドの売上順位がどう入れ替わったかを見せたい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_SLOPE', 'START_END_CAGR'], ok: ['COMP_VARIANCE', 'COMP_RANK'], ng: ['TREND_STACKED', 'MIX_MEKKO'], aim: '2時点・順位の入れ替わり' },
  { id: 'T06', text: 'この3年間の年ごとの売上高を並べて、大きさの違いを見せたい。', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['TREND_COLUMN', 'TREND_LINE'], ok: ['TREND_BAR', 'TREND_CAGR_TABLE'], ng: ['MIX_MEKKO', 'TREND_SHARE'], aim: '期間ごとの大きさ＝縦棒' },
  { id: 'T07', text: 'チャネル別の売上構成比が、この5年でどう変わったかを報告したい。', goal: 'COMPOSITION', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_SHARE', 'MIX_BAR100'], ok: ['TREND_STACKED', 'SIZE_MIX_CAGR'], ng: ['COMP_RANK', 'TREND_LINE_AVG'], aim: '構成比の変化' },
  { id: 'T08', text: '新規顧客数が増えているのか減っているのか、ざっくり見せたい。', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: false,
    expected: ['TREND_LINE', 'TREND_COLUMN'], ok: ['TREND_CAGR_TABLE'], ng: ['MIX_MEKKO', 'COMP_VARIANCE'], aim: '1系列のざっくりした推移。「ざっくり」＝正確な値は不要' },
  { id: 'T09', text: '部門別の営業利益率の推移を比べたい。', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_LINE_AVG'], ok: ['TREND_SLOPE', 'TREND_COLUMN'], ng: ['TREND_STACKED', 'SIZE_MIX_CAGR', 'TREND_SHARE', 'MIX_MEKKO'], aim: '率は足し合わせられない。積み上げ・構成は NG' },
  { id: 'T10', text: '市場全体が拡大する中で、自社のシェアが伸びているかを経営陣に示したい。', goal: 'COMPOSITION', audience: 'EXECUTIVE_MEETING', rate: U, size: true, exact: U,
    expected: ['TREND_SHARE', 'SIZE_MIX_CAGR', 'MIX_MEKKO_GROWTH'], ok: ['TREND_STACKED', 'MIX_BAR100'], ng: ['COMP_RANK'], aim: '規模の拡大とシェアの変化の両方' },

  // ── 比較 ──
  { id: 'C01', text: '営業会議で、担当者別の今期の売上ランキングを見せたい。', goal: 'COMPARISON', audience: 'SALES_MEETING', rate: U, size: U, exact: U,
    expected: ['COMP_RANK', 'COMP_RANK_AVG'], ok: ['COMP_COLUMN'], ng: ['TREND_LINE', 'MIX_MEKKO'], aim: '1時点のランキング' },
  { id: 'C02', text: '今期の拠点別の売上を比べて、平均を下回る拠点を洗い出したい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK_AVG', 'COMP_RANK'], ok: ['COMP_COLUMN'], ng: ['TREND_LINE', 'TREND_STACKED'], aim: '「平均を下回る」で平均線' },
  { id: 'C03', text: '部門別の予算と実績の差を経営会議で説明したい。', goal: 'COMPARISON', audience: 'EXECUTIVE_MEETING', rate: U, size: U, exact: true,
    expected: ['COMP_VARIANCE', 'START_END_CAGR'], ok: ['COMP_RANK'], ng: ['TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'TREND_LINE'], aim: '予実差。年ではないので CAGR は NG' },
  { id: 'C04', text: '前年と今年で、商品ごとの販売数がどれだけ増えた・減ったかを知りたい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_VARIANCE', 'START_END_CAGR'], ok: ['TREND_SLOPE'], ng: ['MIX_MEKKO', 'TREND_SHARE'], aim: '前年比の増減' },
  { id: 'C05', text: '競合5社の最新年の売上規模を比べたい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['COMP_RANK', 'COMP_COLUMN'], ok: ['COMP_RANK_AVG'], ng: ['TREND_LINE', 'TREND_CAGR_TABLE'], aim: '1時点の規模比較' },
  { id: 'C06', text: '5年間で、どの地域がどれだけ売上を増やしたかを役員に簡潔に伝えたい。', goal: 'COMPARISON', audience: 'EXECUTIVE_MEETING', rate: U, size: U, exact: U,
    expected: ['START_END_CAGR', 'COMP_VARIANCE', 'TREND_CAGR_TABLE'], ok: ['TREND_SLOPE'], ng: ['MIX_MEKKO'], aim: '「どれだけ増やしたか」＝開始と終了の差' },
  { id: 'C07', text: '都道府県別（47）の出店数を比べたい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK'], ok: ['COMP_RANK_AVG'], ng: ['COMP_COLUMN', 'TREND_LINE'], aim: '項目が多い＝横棒。縦棒は NG' },
  { id: 'C08', text: '顧客への提案資料で、主要製品のうち売れ筋トップ3を見せたい。', goal: 'COMPARISON', audience: 'SALES_MEETING', rate: U, size: U, exact: U,
    expected: ['COMP_RANK', 'COMP_COLUMN'], ok: ['COMP_RANK_AVG'], ng: ['TREND_STACKED', 'MIX_MEKKO'], aim: 'トップ◯' },

  // ── 構成 ──
  { id: 'M01', text: '市場のシェアの内訳を、セグメント別に報告したい。', goal: 'COMPOSITION', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['MIX_MEKKO', 'MIX_MEKKO_GROWTH'], ok: ['TREND_SHARE', 'MIX_BAR100'], ng: ['TREND_LINE', 'COMP_VARIANCE'], aim: '1時点の構成' },
  { id: 'M02', text: '国別の市場規模と、各国でのメーカーのシェアを1枚で見せたい。', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['MIX_MEKKO', 'MIX_MEKKO_GROWTH'], ok: [], ng: ['TREND_LINE', 'COMP_RANK'], aim: '規模×構成＝Mekko' },
  { id: 'M03', text: '国別の市場の大きさと中身に加えて、伸びている国も経営会議で伝えたい。', goal: 'COMPOSITION', audience: 'EXECUTIVE_MEETING', rate: true, size: true, exact: U,
    expected: ['MIX_MEKKO_GROWTH', 'MIX_MEKKO', 'SIZE_MIX_CAGR'], ok: [], ng: ['COMP_RANK', 'TREND_LINE'], aim: 'Mekko＋成長率' },
  { id: 'M04', text: '2021年と2025年で、売上の事業構成がどう違うかを比べたい。', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['MIX_BAR100', 'TREND_SHARE', 'SIZE_MIX_CAGR'], ok: ['TREND_STACKED'], ng: ['COMP_RANK', 'TREND_LINE'], aim: '2時点の構成' },
  { id: 'M05', text: '費用の内訳（人件費・広告費・物流費など）の推移を月報で見せたい。', goal: 'TREND', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_STACKED', 'TREND_SHARE'], ok: ['TREND_LINE', 'TREND_COLUMN'], ng: ['MIX_MEKKO', 'COMP_RANK'], aim: '内訳の推移' },

  // ── 曖昧 ──
  { id: 'V01', text: '部門の数字をまとめたい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK', 'TREND_LINE'], ok: ['COMP_COLUMN', 'TREND_COLUMN', 'TREND_STACKED'], vague: true, aim: '確信度を低くし、確認を促す' },
  { id: 'V02', text: '2020年から2024年の売上をまとめたい。', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_COLUMN', 'TREND_CAGR_TABLE'], ok: ['TREND_STACKED', 'START_END_CAGR'], vague: true, aim: '期間だけ＝推移' },
  { id: 'V03', text: 'いい感じのグラフを作りたい。', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], vague: true, aim: '何を伝えたいかを確認するのが正解（案の中身は問わない）' },

  // ── まだ作れない ──
  { id: 'X01', text: '利益が減った要因を、価格・数量・コストに分解して説明したい。', goal: 'CONTRIBUTION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], unsupported: true, aim: '要因分解（ウォーターフォール）はまだ作れない' },
  { id: 'X02', text: '広告費と売上に関係があるかを見たい。', goal: 'RELATIONSHIP', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], unsupported: true, aim: '相関（散布図）はまだ作れない' },
  { id: 'X03', text: '新規事業の候補を、市場性・収益性・実現性で評価したい。', goal: 'EVALUATION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], unsupported: true, aim: '評価（スコアカード）はまだ作れない' },

  // ── 英語 ──
  { id: 'E01', text: 'I want to show the board which regions grew fastest from 2021 to 2025.', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: true, size: U, exact: U,
    expected: ['TREND_CAGR_TABLE', 'START_END_CAGR'], ok: ['SIZE_MIX_CAGR', 'TREND_SLOPE'], ng: ['MIX_MEKKO'], aim: '英語の相談' },
];
