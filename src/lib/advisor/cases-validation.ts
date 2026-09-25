import type { AdvisorCase } from './cases';

const U = 'unknown' as const;

/**
 * 検証セット（25件、2026-09-25）。言い換え・境界の相談。ルールや指示を直す時にこの表を見て調整しない
 * （開発セットで直し、ここでは測るだけ）。最終テストは別に、Tai さんかご友人が作る。
 */
export const VALIDATION_CASES: AdvisorCase[] = [
  // 言い換え・口語・短文・長文
  { id: 'L01', text: '地域別売上、ここ5年でどこが伸びてる？役員向け', action: 'RECOMMEND', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: true, size: U, exact: U,
    expected: ['TREND_CAGR_TABLE', 'START_END_CAGR'], ok: ['SIZE_MIX_CAGR', 'TREND_LINE', 'TREND_SLOPE', 'COMP_VARIANCE', 'COMP_TWO_DELTA'], ng: ['MIX_MEKKO', 'MIX_SNAPSHOT'], aim: '口語・短文の T01' },
  { id: 'L02', text: '恐れ入りますが、弊社の製品カテゴリー別の売上高が2019年から2024年にかけてどのように推移してきたかを、取締役会の資料としてお示ししたく、適切なグラフをご提案いただけますでしょうか。', action: 'RECOMMEND', goal: 'TREND', audience: 'EXECUTIVE_MEETING', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_STACKED', 'TREND_CAGR_TABLE'], ok: ['TREND_COLUMN', 'START_END_CAGR', 'SIZE_MIX_CAGR', 'TREND_SHARE'], ng: ['MIX_MEKKO', 'COMP_RANK'], aim: '敬語・長文' },
  { id: 'L03', text: '支店ランキング', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK'], ok: ['COMP_RANK_AVG'], ng: ['TREND_LINE', 'MIX_MEKKO'], aim: '極端に短い' },
  { id: 'L04', text: '今月の店舗別の来店者数を多い順に並べたい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK'], ok: ['COMP_RANK_AVG'], ng: ['TREND_LINE', 'TREND_STACKED'], aim: '「多い順」＝順位' },
  // 誤字・助詞抜け・英語混じり
  { id: 'L05', text: '部門別 予算 実績 差 見せたい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_TWO_DELTA', 'COMP_VARIANCE'], ok: ['COMP_RANK'], ng: ['START_END_CAGR', 'TREND_CAGR_TABLE'], aim: '助詞抜けの予実差' },
  { id: 'L06', text: 'region別のrevenueのshareを最新年で見たい', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['MIX_SNAPSHOT'], ok: ['TREND_SHARE', 'MIX_BAR100'], ng: ['MIX_MEKKO', 'TREND_LINE'], aim: '日英混在・1時点の構成' },
  { id: 'L07', text: 'Compare budget vs actual by department for the leadership meeting.', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'EXECUTIVE_MEETING', rate: U, size: U, exact: U,
    expected: ['COMP_TWO_DELTA', 'COMP_VARIANCE'], ok: ['COMP_RANK'], ng: ['START_END_CAGR', 'TREND_CAGR_TABLE'], aim: '英語の予実差' },
  // キーワードの衝突
  { id: 'L08', text: '営業部門ごとの粗利率を前年と比べたい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_TWO_DELTA', 'COMP_VARIANCE'], ok: ['TREND_SLOPE', 'COMP_RANK'], ng: ['TREND_STACKED', 'TREND_SHARE', 'MIX_MEKKO', 'MIX_BAR100', 'SIZE_MIX_CAGR'], aim: '「営業」は場面ではない。率なので構成・積み上げは NG' },
  { id: 'L09', text: '顧客数の推移を、顧客セグメント別に月報で出したい', action: 'RECOMMEND', goal: 'TREND', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_STACKED'], ok: ['TREND_COLUMN', 'TREND_SHARE', 'TREND_LINE_AVG'], ng: ['MIX_MEKKO', 'COMP_RANK'], aim: '「顧客」は場面ではない' },
  // 期間はあるが推移ではない
  { id: 'L10', text: '2025年の国別シェアを報告したい', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'REPORT', rate: U, size: U, exact: U,
    expected: ['MIX_SNAPSHOT'], ok: ['MIX_BAR100', 'TREND_SHARE'], ng: ['TREND_LINE', 'MIX_MEKKO', 'TREND_CAGR_TABLE'], aim: '年は1つだけ＝1時点' },
  { id: 'L11', text: '2024年度の商品別売上トップ10を出したい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK'], ok: ['COMP_RANK_AVG'], ng: ['TREND_LINE', 'TREND_CAGR_TABLE', 'START_END_CAGR'], aim: '年度はあるが1時点のランキング' },
  // 「伸びた」を絶対増分として
  { id: 'L12', text: '去年から今年で、どの店舗が一番売上を伸ばしたか知りたい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_VARIANCE', 'COMP_TWO_DELTA'], ok: ['TREND_SLOPE', 'START_END_CAGR'], ng: ['MIX_MEKKO', 'TREND_STACKED'], aim: '「伸ばした」は増えた量' },
  // 「伸び率」を CAGR として
  { id: 'L13', text: '2020〜2025年の地域別売上の年平均の伸び率を比べたい', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: true, size: U, exact: U,
    expected: ['TREND_CAGR_TABLE', 'START_END_CAGR'], ok: ['TREND_LINE', 'SIZE_MIX_CAGR'], ng: ['MIX_MEKKO', 'COMP_RANK_AVG', 'TREND_LINE_AVG'], aim: '年平均の伸び率＝CAGR。「平均」を平均線と誤解しない' },
  // 規模は不要で構成比だけ
  { id: 'L14', text: '規模感はいらないので、チャネル別の構成比がこの3年でどう変わったかだけ見たい', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: false, exact: U,
    expected: ['TREND_SHARE', 'MIX_BAR100'], ok: [], ng: ['MIX_MEKKO', 'MIX_MEKKO_GROWTH', 'SIZE_MIX_CAGR', 'TREND_STACKED'], aim: '「規模はいらない」を読めるか' },
  // 合計できない率・指数・平均
  { id: 'L15', text: '店舗ごとの顧客満足度スコアの推移を見たい', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_LINE', 'TREND_LINE_AVG'], ok: ['TREND_SLOPE', 'TREND_COLUMN'], ng: ['TREND_STACKED', 'TREND_SHARE', 'SIZE_MIX_CAGR', 'MIX_MEKKO'], aim: 'スコアは足せない' },
  { id: 'L16', text: '地域別の平均単価を比べたい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['COMP_RANK'], ok: ['COMP_RANK_AVG'], ng: ['MIX_SNAPSHOT', 'MIX_MEKKO', 'TREND_STACKED'], aim: '平均単価は足せない。「平均」は平均線の意味ではない' },
  { id: 'L17', text: '物価指数の推移を国別に比べたい', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_LINE'], ok: ['TREND_LINE_AVG', 'TREND_SLOPE', 'TREND_CAGR_TABLE'], ng: ['TREND_STACKED', 'TREND_SHARE', 'SIZE_MIX_CAGR'], aim: '指数は足せない' },
  // 適切な案が1〜2つ
  { id: 'L18', text: '2020年と2025年で、メーカーの順位がどう入れ替わったかだけ見せたい', action: 'RECOMMEND', goal: 'COMPARISON', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['TREND_SLOPE'], ok: ['START_END_CAGR', 'COMP_VARIANCE'], ng: ['TREND_STACKED', 'MIX_MEKKO', 'COMP_RANK_AVG'], aim: '案は1つで十分' },
  { id: 'L19', text: '国ごとの市場規模と、その中のブランド構成を1枚で見せたい', action: 'RECOMMEND', goal: 'COMPOSITION', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['MIX_MEKKO'], ok: ['MIX_MEKKO_GROWTH'], ng: ['TREND_LINE', 'COMP_RANK'], aim: 'Mekko が本命' },
  // 構成と推移の境目
  { id: 'L20', text: '全社売上の伸びに、どの事業が効いているかを2021年から2025年で見たい', action: 'RECOMMEND', goal: 'TREND', audience: 'UNKNOWN', rate: U, size: true, exact: U,
    expected: ['SIZE_MIX_CAGR', 'TREND_STACKED'], ok: ['TREND_CAGR_TABLE', 'TREND_SHARE', 'START_END_CAGR'], ng: ['COMP_RANK', 'MIX_SNAPSHOT'], aim: '「効いている」＝内訳の寄与' },
  // 確認
  { id: 'L21', text: '売上のグラフを作りたい', action: 'CLARIFY', goal: null, audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], questions: ['時間の流れを見たいですか、項目どうしを比べたいですか', '誰に何を伝えたいですか'], aim: '指標だけで、見方が無い' },
  { id: 'L22', text: '上司に見せる資料を作りたい', action: 'CLARIFY', goal: null, audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], questions: ['何の数字ですか', '何を伝えたいですか'], aim: '何も分からない' },
  // まだ作れない
  { id: 'L23', text: '売上の前年差を、価格要因と数量要因に分けて説明したい', action: 'RECOMMEND', goal: 'CONTRIBUTION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['CONTRIB_WATERFALL', 'CONTRIB_DRIVERS'], ok: ['CONTRIB_POSNEG'], ng: ['COMP_TWO_DELTA', 'COMP_VARIANCE'], aim: '要因分解（差分バーではない）' },
  { id: 'L24', text: '価格と販売数量の相関を見たい', action: 'RECOMMEND', goal: 'RELATIONSHIP', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: ['REL_SCATTER'], ok: ['REL_QUADRANT', 'REL_BUBBLE'], ng: ['TREND_LINE', 'COMP_RANK'], aim: '相関' },
  { id: 'L25', text: '候補地3つを、コスト・人口・アクセスで比較評価したい', action: 'UNSUPPORTED', goal: 'EVALUATION', audience: 'UNKNOWN', rate: U, size: U, exact: U,
    expected: [], aim: '複数指標の評価（「比較」の言葉があるが評価）' },
];
