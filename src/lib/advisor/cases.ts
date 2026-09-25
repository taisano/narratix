import type { AudienceId, GoalCode, RecipeId } from '@/registry';

/**
 * AI 相談の正解表（開発セット 30件、2026-09-25 レビュー反映）。ルール版と AI 版を同じ問題で採点する。
 * action：RECOMMEND＝案を出す、CLARIFY＝案を出さずに確認する、UNSUPPORTED＝まだ作れないと伝える。
 * expected＝出してほしい案（先頭が最優先）、ok＝出ても良い案、ng＝出してほしくない案（1つでも出たら不合格）。
 * 成長率・規模・正確な値は 3つの値：true＝必要、false＝不要、'unknown'＝相談文に無いので不明。
 * 縦棒と横棒のように、答える問いが同じで向きだけ違う案は同じ案として採点する（VARIANTS）。
 */
import type { AdvisorAction } from '@/registry';
export type { AdvisorAction };

export interface AdvisorCase {
  id: string;
  text: string;
  action: AdvisorAction;
  /** 主な目的。確認が正解で目的も決められない相談は null */
  goal: GoalCode | null;
  audience: AudienceId | 'UNKNOWN';
  rate: boolean | 'unknown';
  size: boolean | 'unknown';
  exact: boolean | 'unknown';
  expected: RecipeId[];
  ok?: RecipeId[];
  ng?: RecipeId[];
  /** CLARIFY のとき、確認すべきこと */
  questions?: string[];
  aim: string;
}

/** 向きだけ違う案（registry の RECIPE_VARIANTS）。採点では同じ案とみなす */
export { RECIPE_VARIANTS as VARIANTS } from '@/registry';

const U = 'unknown' as const;

export const ADVISOR_CASES: AdvisorCase[] = [
  // ── 推移 ──
  { id: 'T01', text: '海外5地域の売上（2021〜2025年）で、どこが成長しているかを経営会議で伝えたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: true, size: U, exact: U,
    expected: ['TREND_CAGR_TABLE', 'START_END_CAGR'], ok: ['SIZE_MIX_CAGR', 'TREND_SLOPE', 'COMP_VARIANCE', 'COMP_TWO_DELTA'], ng: ['MIX_MEKKO', 'MIX_SNAPSHOT'], aim: '指示書の例。成長率が要る。内訳の寄与までは求めていないので「全体の拡大と構成」は許容' },
  { id: 'T02', text: '製品別の月次売上の推移を月報にまとめたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_STACKED', 'TREND_COLUMN'], ok: ['TREND_LINE_AVG', 'TREND_SHARE'], ng: ['MIX_MEKKO', 'COMP_RANK'], aim: '素直な推移。月次なので CAGR は主役にしない' },
  { id: 'T03', text: '過去5年の事業別の売上と、全体の伸びを支えている事業を役員に見せたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: U, size: true, exact: U,
    expected: ['SIZE_MIX_CAGR', 'TREND_STACKED', 'TREND_CAGR_TABLE'], ok: ['TREND_SHARE', 'START_END_CAGR'], ng: ['COMP_RANK'], aim: '全体と内訳。「支えている」がカギ' },
  { id: 'T04', text: '店舗ごとの売上の推移を見て、平均より伸びている店を営業会議で確認したい。', action: 'CLARIFY', goal: 'TREND', audience: 'SALES_MEETING', rate: U, size: U, exact: U,
    expected: [], ng: ['MIX_MEKKO'], questions: ['比べる平均は、売上の平均ですか、伸び率の平均ですか'], aim: '「平均より伸びている」の平均が曖昧。今の平均線は売上の水準の平均で、伸び率の平均ではない（切り口の候補：平均成長率との比較）' },
  { id: 'T05', text: '2020年と2025年で、ブランドの売上順位がどう入れ替わったかを見せたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_SLOPE', 'START_END_CAGR'], ok: ['COMP_VARIANCE', 'COMP_RANK'], ng: ['TREND_STACKED', 'MIX_MEKKO'], aim: '2時点・順位の入れ替わり' },
  { id: 'T06', text: 'この3年間の年ごとの売上高を並べて、大きさの違いを見せたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['TREND_COLUMN', 'TREND_LINE'], ok: ['TREND_BAR', 'TREND_CAGR_TABLE'], ng: ['MIX_MEKKO', 'TREND_SHARE'], aim: '期間ごとの大きさ＝縦棒' },
  { id: 'T07', text: 'チャネル別の売上構成比が、この5年でどう変わったかを報告したい。', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_SHARE', 'MIX_BAR100'], ok: ['TREND_STACKED', 'SIZE_MIX_CAGR'], ng: ['COMP_RANK', 'TREND_LINE_AVG'], aim: '構成比の変化' },
  { id: 'T08', text: '新規顧客数が増えているのか減っているのか、ざっくり見せたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: false,
    expected: ['TREND_LINE', 'TREND_COLUMN'], ok: ['TREND_CAGR_TABLE'], ng: ['MIX_MEKKO', 'COMP_VARIANCE'], aim: '1系列のざっくりした推移。「ざっくり」＝正確な値は不要' },
  { id: 'T09', text: '部門別の営業利益率の推移を比べたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_LINE_AVG'], ok: ['TREND_SLOPE', 'TREND_COLUMN'], ng: ['TREND_STACKED', 'SIZE_MIX_CAGR', 'TREND_SHARE', 'MIX_MEKKO'], aim: '率は足し合わせられない。積み上げ・構成は NG' },
  { id: 'T10', text: '市場全体が拡大する中で、自社のシェアが伸びているかを経営陣に示したい。', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'EXECUTIVE_MEETING', rate: U, size: true, exact: U,
    expected: ['TREND_SHARE', 'SIZE_MIX_CAGR', 'MIX_MEKKO_GROWTH'], ok: ['TREND_STACKED', 'MIX_BAR100'], ng: ['COMP_RANK'], aim: '規模の拡大とシェアの変化の両方' },

  // ── 比較 ──
  { id: 'C01', text: '営業会議で、担当者別の今期の売上ランキングを見せたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'SALES_MEETING', rate: U, size: U, exact: U,
    expected: ['COMP_RANK', 'COMP_RANK_AVG'], ok: ['COMP_COLUMN'], ng: ['TREND_LINE', 'MIX_MEKKO'], aim: '1時点のランキング' },
  { id: 'C02', text: '今期の拠点別の売上を比べて、平均を下回る拠点を洗い出したい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK_AVG', 'COMP_RANK'], ok: ['COMP_COLUMN'], ng: ['TREND_LINE', 'TREND_STACKED'], aim: '「平均を下回る」で平均線' },
  { id: 'C03', text: '部門別の予算と実績の差を経営会議で説明したい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'EXECUTIVE_MEETING', rate: U, size: U, exact: true,
    expected: ['COMP_TWO_DELTA', 'COMP_VARIANCE'], ok: ['COMP_RANK'], ng: ['START_END_CAGR', 'TREND_CAGR_TABLE', 'SIZE_MIX_CAGR', 'TREND_LINE'], aim: '予実差。時間ではないので CAGR 付きは NG' },
  { id: 'C04', text: '前年と今年で、商品ごとの販売数がどれだけ増えた・減ったかを知りたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_VARIANCE', 'COMP_TWO_DELTA'], ok: ['TREND_SLOPE', 'START_END_CAGR'], ng: ['MIX_MEKKO', 'TREND_SHARE'], aim: '前年比の増減。2年だけなので CAGR より差を優先' },
  { id: 'C05', text: '競合5社の最新年の売上規模を比べたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['COMP_RANK', 'COMP_COLUMN'], ok: ['COMP_RANK_AVG'], ng: ['TREND_LINE', 'TREND_CAGR_TABLE'], aim: '1時点の規模比較' },
  { id: 'C06', text: '5年間で、どの地域がどれだけ売上を増やしたかを役員に簡潔に伝えたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'EXECUTIVE_MEETING', rate: U, size: U, exact: U,
    expected: ['START_END_CAGR', 'COMP_TWO_DELTA', 'COMP_VARIANCE'], ok: ['TREND_CAGR_TABLE', 'TREND_SLOPE'], ng: ['MIX_MEKKO'], aim: '「どれだけ増やしたか」＝開始と終了の差。目的は比較、時間は2時点' },
  { id: 'C07', text: '都道府県別（47）の出店数を比べたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK'], ok: ['COMP_RANK_AVG'], ng: ['TREND_LINE'], aim: '項目が多い（47）。横棒にするのは表示の規則の役目（案としては縦棒と同じ）' },
  { id: 'C08', text: '顧客への提案資料で、主要製品のうち売れ筋トップ3を見せたい。', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'SALES_MEETING', rate: U, size: U, exact: U,
    expected: ['COMP_RANK', 'COMP_COLUMN'], ok: ['COMP_RANK_AVG'], ng: ['TREND_STACKED', 'MIX_MEKKO'], aim: 'トップ◯' },

  // ── 構成 ──
  { id: 'M01', text: '市場のシェアの内訳を、セグメント別に報告したい。', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['MIX_SNAPSHOT'], ok: ['TREND_SHARE', 'MIX_BAR100'], ng: ['MIX_MEKKO', 'MIX_MEKKO_GROWTH', 'TREND_LINE', 'COMP_VARIANCE'], aim: '1時点の構成。規模のデータが相談に無いので Mekko は NG' },
  { id: 'M02', text: '国別の市場規模と、各国でのメーカーのシェアを1枚で見せたい。', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['MIX_MEKKO', 'MIX_MEKKO_GROWTH'], ok: [], ng: ['TREND_LINE', 'COMP_RANK'], aim: '規模×構成＝Mekko' },
  { id: 'M03', text: '国別の市場の大きさと中身に加えて、伸びている国も経営会議で伝えたい。', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'EXECUTIVE_MEETING', rate: true, size: true, exact: U,
    expected: ['MIX_MEKKO_GROWTH', 'MIX_MEKKO', 'SIZE_MIX_CAGR'], ok: [], ng: ['COMP_RANK', 'TREND_LINE'], aim: 'Mekko＋成長率' },
  { id: 'M04', text: '2021年と2025年で、売上の事業構成がどう違うかを比べたい。', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['MIX_BAR100', 'TREND_SHARE', 'SIZE_MIX_CAGR'], ok: ['TREND_STACKED'], ng: ['COMP_RANK', 'TREND_LINE'], aim: '2時点の構成' },
  { id: 'M05', text: '費用の内訳（人件費・広告費・物流費など）の推移を月報で見せたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_STACKED', 'TREND_SHARE'], ok: ['TREND_LINE', 'TREND_COLUMN'], ng: ['MIX_MEKKO', 'COMP_RANK'], aim: '内訳の推移' },

  // ── 曖昧 ──
  { id: 'V01', text: '部門の数字をまとめたい。', action: 'CLARIFY', goal: null, audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], questions: ['何の数字ですか（売上・人数など）', '時間の流れを見たいですか、部門どうしを比べたいですか', '誰に何を判断してほしいですか'], aim: '指標・期間・比べ方・伝えたいことが無い' },
  { id: 'V02', text: '2020年から2024年の売上をまとめたい。', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_COLUMN', 'TREND_CAGR_TABLE'], ok: ['TREND_STACKED', 'START_END_CAGR'], aim: '期間と指標だけ＝推移として案を出してよい' },
  { id: 'V03', text: 'いい感じのグラフを作りたい。', action: 'CLARIFY', goal: null, audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], questions: ['何のデータですか', '何を伝えたいですか（推移・比較・構成など）'], aim: '何も分からない。案を出したら不正解' },

  // ── まだ作れない ──
  { id: 'X01', text: '利益が減った要因を、価格・数量・コストに分解して説明したい。', action: 'RECOMMEND', goal: 'CONTRIBUTION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['CONTRIB_WATERFALL', 'CONTRIB_DRIVERS'], ok: ['CONTRIB_POSNEG'], ng: ['TREND_LINE', 'COMP_VARIANCE', 'COMP_TWO_DELTA'], aim: '要因分解（ウォーターフォール）。2026-09-25 に作れるようになった' },
  { id: 'X02', text: '広告費と売上に関係があるかを見たい。', action: 'RECOMMEND', goal: 'RELATIONSHIP', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['REL_SCATTER'], ok: ['REL_QUADRANT', 'REL_BUBBLE'], ng: ['TREND_LINE', 'COMP_RANK'], aim: '相関（散布図）。2026-09-25 に作れるようになった' },
  { id: 'X03', text: '新規事業の候補を、市場性・収益性・実現性で評価したい。', action: 'UNSUPPORTED', goal: 'EVALUATION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], aim: '評価（スコアカード）はまだ作れない' },

  // ── 英語 ──
  { id: 'E01', text: 'I want to show the board which regions grew fastest from 2021 to 2025.', action: 'RECOMMEND', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: true, size: U, exact: U,
    expected: ['TREND_CAGR_TABLE', 'START_END_CAGR'], ok: ['SIZE_MIX_CAGR', 'TREND_SLOPE'], ng: ['MIX_MEKKO'], aim: '英語の相談' },
];
