import { registry, type ChartTypeId, type LocalizedText, type ProofNeedId } from '@/registry';
import type { EmphasisId, Proposal } from './coach';
import { AUTO_HIGHLIGHT, AUTO_RANK_SHIFT, AUTO_TOP_RIGHT } from '../editor/fromRecipe';

/**
 * 一品料理の表（docs/dish-matrix.md v0.3）。
 * 料理（＝重視点：このスライドの問いと、最も伝えたいこと）を主キーに、材料（主役のチャート）ごとの
 * 適合度・条件・構成を持つ。質問から入っても、チャートから入っても、同じ表を引く。
 * 条件は機械的に確かめられるものだけ（データ入力前は相談・選択から、入力後はデータから。dishConditions.ts）
 */

export const FIT_LEVELS = ['DIRECT_FIT', 'CONDITIONAL_FIT', 'SWITCH_RECOMMENDED'] as const;
export type FitLevel = (typeof FIT_LEVELS)[number];

/** データから判定する条件 */
export const DATA_CONDITIONS = [
  'PERIODS_2', 'PERIODS_3PLUS', 'PERIODS_2PLUS', 'MULTI_SERIES', 'FEW_SERIES', 'ADDITIVE',
  'PARTS_FORM_WHOLE', 'RECONCILES_TO_TOTAL', 'ABSOLUTE_BASE_AVAILABLE', 'CAGR_CALCULABLE',
] as const;
/** 利用者の意図から判定する条件（分からなければ一問だけ聞く） */
export const INTENT_CONDITIONS = ['WITH_MIX_CHANGE'] as const;
export type DataCondition = (typeof DATA_CONDITIONS)[number];
export type IntentCondition = (typeof INTENT_CONDITIONS)[number];
export type ConditionId = DataCondition | IntentCondition;

/** 条件の状態。unknown は「まだ分からない」（データ入力前など） */
export type CondState = 'yes' | 'no' | 'unknown';
export type Conditions = Partial<Record<ConditionId, CondState>>;

/** 系列が少ない（積み上げ縦棒に項目別の伸び率を直接書ける）上限 */
export const FEW_SERIES_MAX = 4;

/** 一問だけの確認（中心の Question を判定できない時） */
export const ASK_IDS = ['with_mix', 'central'] as const;
export type AskId = (typeof ASK_IDS)[number];

/** 材料ごとのマス */
export interface Cell {
  fit: FitLevel;
  /** この構成で出す条件（DIRECT_FIT は前提、CONDITIONAL_FIT は採用の条件） */
  when?: ConditionId[];
  /** 条件を満たす時の構成（SWITCH_RECOMMENDED では「選んだチャートのまま」の案） */
  plate: Proposal;
  /** 条件によって構成を変える（先に合ったもの。例：系列が少なければ伸び率を直接書く） */
  variants?: { when: ConditionId[]; plate: Proposal }[];
  /** 条件を満たす時の別案 */
  alts?: Proposal[];
  /** 勧め先（SWITCH_RECOMMENDED、または条件を満たさない時。先頭がリード） */
  switchTo: Proposal[];
  /** 勧め先に替える理由（画面に1行で出す） */
  reason?: LocalizedText;
  /** 意図の条件が分からない時に聞く問い */
  ask?: AskId;
  /**
   * チャートから入った時、選んだチャートで作る案（KEEP_CHOSEN のチャートだけ。docs/decisions.md「チャートから選ぶ：選んだチャートを第一案に」）。
   * plates：選んだチャートの案（先頭が既定選択）。when を満たさない時は fallback（理由は note）。
   * advice：Coach からの別案（switchTo・別チャートの alts）を出す時の助言1文。diff：別案の「選んだチャートとの違い」。fits：選んだチャートがこの目的に合う
   */
  chosen?: { plates: Proposal[]; when?: ConditionId[]; fallback?: Proposal; note?: LocalizedText; advice?: LocalizedText; diff?: LocalizedText; fits?: boolean };
}

export interface DishDef {
  id: EmphasisId;
  question: LocalizedText;
  proofNeeds: ProofNeedId[];
  /** Story Route 上の主な役割（Story Flow で料理を引くため。表示はしない） */
  roles: string[];
  /** 材料ごとのマス（無い材料は、これまでの規則：チャートのまま補完パーツを足す） */
  materials?: Partial<Record<ChartTypeId, Cell>>;
}

const L = (ja: string, en: string): LocalizedText => ({ ja, en });
const P = (recipe: Proposal['recipe'], complements?: Proposal['complements'], controls?: Proposal['controls']): Proposal =>
  ({ recipe, ...(complements?.length ? { complements } : {}), ...(controls ? { controls } : {}) });

const NO_SIZE = L(
  '100%積み上げでは全体の規模の変化が見えないため、実額の積み上げ縦棒をおすすめします（データはそのままです）',
  'A 100% stacked chart hides how the total changed, so absolute stacked columns are recommended (your data stays the same)',
);
const ONLY_SPEED = L(
  '伸びの速さだけを伝えるなら、全体の伸びが見える実額の積み上げ縦棒か折れ線が向きます',
  'To show only the speed of growth, absolute stacked columns or a line chart work better — they show the total growing',
);
const ONLY_CONTRIB = L(
  '寄与だけを伝えるなら、全体の伸びが見える実額の積み上げ縦棒か折れ線に、増加額を添えるのが向きます',
  'To show only the contribution, absolute stacked columns or a line chart with the increases work better',
);
const TWO_POINTS = L('2時点だけなら、スロープで最初と最後を結ぶと読みやすくなります', 'With only two points, a slope chart reads more clearly');
const SLOPE_ENDS = L('時点が3つ以上あるので、スロープは最初と最後の2時点を結んで見せます。途中の動きは別案の折れ線で見られます。', 'With three or more points, the slope joins the first and last points. The line chart alternative shows the path in between.');
const MANY_POINTS = L('3時点以上ある時は、途中の動きが見える折れ線をおすすめします', 'With three or more points, a line chart shows the path in between');

/** 推移の4品（v0.3 で詳細を決めたもの） */
const TREND: Partial<Record<EmphasisId, DishDef>> = {
  trajectory: {
    id: 'trajectory', question: L('全体はどう変わってきたか', 'How has it changed over time?'),
    proofNeeds: ['OVERALL_CHANGE'], roles: ['AIMED.IMPACT', 'DIAGNOSIS.SYMPTOM', 'URGENCY.INFLECTION'],
    materials: {
      line: { fit: 'DIRECT_FIT', when: ['PERIODS_3PLUS'], plate: P('TREND_LINE'), alts: [P('TREND_STACKED')], switchTo: [P('TREND_SLOPE', [], { slope_change: 'none' })], reason: TWO_POINTS },
      column_trend: { fit: 'DIRECT_FIT', plate: P('TREND_COLUMN'), alts: [P('TREND_LINE')], switchTo: [P('TREND_LINE')] },
      stacked_column: { fit: 'DIRECT_FIT', when: ['ADDITIVE'], plate: P('TREND_STACKED'), alts: [P('TREND_LINE')], switchTo: [P('TREND_LINE')] },
      stacked_100: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_SHARE'), switchTo: [P('TREND_STACKED'), P('TREND_LINE')], reason: NO_SIZE,
        chosen: { plates: [{ ...P('TREND_SHARE'), name: L('構成比の推移を見る', 'See how the mix changes') }], advice: NO_SIZE, diff: L('別案では、全体と各項目の実数の動きを示します。', 'The alternatives show how the total and each part change in absolute values.') },
      },
      slope: {
        fit: 'CONDITIONAL_FIT', when: ['PERIODS_2'], plate: P('TREND_SLOPE', [], { slope_change: 'none' }), switchTo: [P('TREND_LINE')], reason: MANY_POINTS,
        chosen: {
          plates: [{ ...P('TREND_SLOPE', [], { slope_change: 'none' }), name: L('始点と終点の変化を見る', 'See the change from start to end') }],
          when: ['PERIODS_2'], fallback: { ...P('TREND_SLOPE', [], { slope_change: 'none' }), name: L('始点と終点の変化を見る', 'See the change from start to end') }, note: SLOPE_ENDS,
          advice: L('途中の動きまで追うなら、3時点以上をつないだ折れ線のほうが変化の軌跡を読み取りやすくなります。', 'To follow the movement in between, a line chart across three or more points makes the full path easier to read.'),
          diff: L('途中の年の動きも見せます。', 'Also shows the years in between.'),
        },
      },
    },
  },
  growth_rate: {
    id: 'growth_rate', question: L('どれくらいの速さで伸びたか', 'How fast did it grow?'),
    proofNeeds: ['GROWTH_SPEED'], roles: ['URGENCY.INFLECTION', 'BUSINESS_CASE.VALUE_POOL'],
    materials: {
      line: { fit: 'DIRECT_FIT', when: ['PERIODS_3PLUS', 'CAGR_CALCULABLE'], plate: P('TREND_LINE', ['cagr_note']), alts: [P('TREND_CAGR_TABLE')], switchTo: [P('TREND_SLOPE', [], { slope_change: 'cagr' })], reason: TWO_POINTS },
      // 縦棒への伸び率注記は準備中。それまでは折れ線＋伸び率を勧める（docs/dish-matrix.md 6.2 は DIRECT_FIT）
      column_trend: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_COLUMN'), switchTo: [P('TREND_LINE', ['cagr_note']), P('TREND_CAGR_TABLE')],
        reason: L('伸びの速さは、折れ線に伸び率（CAGR）を添えると読み取りやすくなります（データはそのままです）', 'Growth speed reads best as a line with growth rates (CAGR); your data stays the same'),
      },
      stacked_column: {
        fit: 'DIRECT_FIT', when: ['ADDITIVE', 'CAGR_CALCULABLE'],
        variants: [{ when: ['FEW_SERIES'], plate: P('TREND_STACKED', ['cagr_note']) }],
        plate: P('TREND_STACKED_CAGR'), alts: [P('TREND_LINE', ['cagr_note'])], switchTo: [P('TREND_LINE', ['cagr_note'])],
      },
      stacked_100: {
        fit: 'CONDITIONAL_FIT', when: ['WITH_MIX_CHANGE', 'ABSOLUTE_BASE_AVAILABLE', 'CAGR_CALCULABLE'], ask: 'with_mix',
        plate: P('TREND_SHARE_CAGR'), switchTo: [P('TREND_STACKED', ['cagr_note']), P('TREND_LINE', ['cagr_note'])], reason: ONLY_SPEED,
        chosen: {
          plates: [{ ...P('TREND_SHARE_CAGR'), name: L('構成比と伸び率を見る', 'See mix and growth rates') }], when: ['WITH_MIX_CHANGE', 'ABSOLUTE_BASE_AVAILABLE', 'CAGR_CALCULABLE'],
          fallback: { ...P('TREND_SHARE'), name: L('構成比の推移を見る', 'See how the mix changes') }, note: L('伸び率を計算できる実数がないため、構成比の推移を見せます。', 'Without absolute values for calculating growth, the chart shows how the mix changes.'),
          advice: ONLY_SPEED, diff: L('別案では、実数の動きと伸び率を示します。', 'The alternatives show absolute movement and growth rates.'),
        },
      },
      slope: {
        fit: 'CONDITIONAL_FIT', when: ['PERIODS_2'], plate: P('TREND_SLOPE', [], { slope_change: 'cagr' }), switchTo: [P('TREND_LINE', ['cagr_note'])], reason: MANY_POINTS,
        chosen: {
          plates: [{ ...P('TREND_SLOPE', [], { slope_change: 'cagr' }), name: L('2時点の変化と伸び率を見る', 'See two-point change and growth rate') }],
          when: ['PERIODS_2'], fallback: { ...P('TREND_SLOPE', [], { slope_change: 'cagr' }), name: L('2時点の変化と伸び率を見る', 'See two-point change and growth rate') }, note: SLOPE_ENDS,
          advice: L('伸びの速さを途中の年も含めて見せるなら、伸び率を添えた折れ線のほうが分かりやすくなります。', 'To show growth speed including the years in between, a line chart with growth labels is clearer.'),
          diff: L('途中の年の動きと伸び率を見せます。', 'Shows the years in between with growth rates.'),
        },
      },
    },
  },
  growth_driver: {
    id: 'growth_driver', question: L('どの項目が全体の増加に寄与したか', 'Which parts contributed most to the growth?'),
    proofNeeds: ['CONTRIBUTION', 'OVERALL_CHANGE'], roles: ['AIMED.EXPLANATION', 'DIAGNOSIS.DRIVER'],
    materials: {
      line: { fit: 'DIRECT_FIT', when: ['MULTI_SERIES', 'PARTS_FORM_WHOLE'], plate: P('TREND_LINE_DELTA'), alts: [P('TREND_STACKED_DELTA')], switchTo: [P('TREND_LINE')] },
      stacked_column: { fit: 'DIRECT_FIT', when: ['MULTI_SERIES', 'PARTS_FORM_WHOLE'], plate: P('TREND_STACKED_DELTA'), alts: [P('TREND_LINE_DELTA')], switchTo: [P('TREND_STACKED')] },
      stacked_100: {
        fit: 'CONDITIONAL_FIT', when: ['WITH_MIX_CHANGE', 'ABSOLUTE_BASE_AVAILABLE', 'MULTI_SERIES', 'PARTS_FORM_WHOLE'], ask: 'with_mix',
        plate: P('TREND_SHARE_DELTA'), switchTo: [P('TREND_STACKED_DELTA'), P('TREND_LINE_DELTA')], reason: ONLY_CONTRIB,
        chosen: {
          plates: [{ ...P('TREND_SHARE_DELTA'), name: L('構成比と増減を見る', 'See mix and changes') }], when: ['WITH_MIX_CHANGE', 'ABSOLUTE_BASE_AVAILABLE', 'MULTI_SERIES', 'PARTS_FORM_WHOLE'],
          fallback: { ...P('TREND_SHARE'), name: L('構成比の推移を見る', 'See how the mix changes') }, note: L('寄与を計算できる内訳の実数がないため、構成比の推移を見せます。', 'Without absolute breakdown values for contribution, the chart shows how the mix changes.'),
          advice: ONLY_CONTRIB, diff: L('別案では、各項目の実数の増減を示します。', 'The alternatives show the absolute change for each part.'),
        },
      },
      column_trend: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_COLUMN'), switchTo: [P('TREND_STACKED_DELTA'), P('TREND_LINE_DELTA')],
        reason: L('項目が1つの縦棒では寄与を示せません。内訳（項目別）のデータで、積み上げ縦棒と増加額を見せるのがおすすめです', 'A single-series column chart cannot show contribution. With a breakdown by part, stacked columns plus the increases work best'),
      },
      slope: {
        fit: 'CONDITIONAL_FIT', when: ['PERIODS_2', 'MULTI_SERIES'], plate: P('TREND_SLOPE', ['total_change'], { slope_change: 'diff' }), switchTo: [P('TREND_LINE_DELTA')], reason: MANY_POINTS,
        chosen: {
          plates: [{ ...P('TREND_SLOPE', ['total_change'], { slope_change: 'diff' }), name: L('2時点の増減から牽引役を見る', 'See growth drivers through two-point changes') }],
          // 項目が1つなら内訳（牽引役）は見せられないので、増減だけのスロープにして理由を出す
          when: ['MULTI_SERIES'], fallback: { ...P('TREND_SLOPE', [], { slope_change: 'diff' }), name: L('2時点の増減を見る', 'See the two-point change') },
          note: L('項目が1つなので、牽引役（どの項目が伸ばしたか）は見せられません。2時点の増減を見せます。内訳のデータを入れると牽引役を見せられます。', 'With a single series, the drivers (which parts grew) cannot be shown, so the slope shows the two-point change. Add a breakdown by part to show the drivers.'),
          advice: L('途中の軌跡と項目別の増加額を一緒に見るなら、増減額を添えた折れ線が読みやすくなります。', 'To see the path in between together with increases by item, a line chart with change amounts is easier to read.'),
          diff: L('途中の年の動きと、項目ごとの増減を見せます。', 'Shows the years in between and each part’s change.'),
        },
      },
    },
  },
  mix_change: {
    id: 'mix_change', question: L('内訳の比率はどう動いたか', 'How did the mix shift?'),
    proofNeeds: ['MIX_CHANGE'], roles: ['AIMED.MISMATCH'],
    materials: {
      stacked_100: {
        fit: 'DIRECT_FIT', when: ['MULTI_SERIES'], plate: P('TREND_SHARE'), alts: [P('TREND_STACKED')], switchTo: [P('TREND_STACKED')],
        chosen: {
          plates: [{ ...P('TREND_SHARE'), name: L('構成比の変化を見る', 'See changes in the mix') }], when: ['MULTI_SERIES'],
          fallback: { ...P('TREND_SHARE'), name: L('1項目の比率を見る', 'See the share of one item') }, note: L('項目が1つなので、内訳の変化ではなくその項目の比率を見せます。', 'With one item, the chart shows its share rather than a changing breakdown.'), fits: true,
          advice: L('全体の規模も一緒に見るなら、実額の積み上げ縦棒が使えます。', 'To show total size as well, use absolute stacked columns.'), diff: L('別案では、全体と各項目の実数を示します。', 'The alternative shows the total and each part in absolute values.'),
        },
      // 右に構成比の変化（pt）を添える左右構成は準備中。それまでは 100%積み上げを勧め、選んだ積み上げは「規模も一緒に」の別案に
      stacked_column: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_STACKED'), switchTo: [P('TREND_SHARE')],
        reason: L('比率の動きを見せるなら、全体を100%にそろえた100%積み上げが読みやすくなります。規模も一緒に見せたい時は、今の積み上げ縦棒のままでも構いません', 'To show the shift in mix, a 100% stacked chart reads more clearly. Keep absolute stacked columns if you also want to show size'),
      },
      line: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_LINE'), switchTo: [P('TREND_SHARE')],
        reason: L('内訳の比率の動きは、折れ線より100%積み上げの方が一目で分かります', 'A 100% stacked chart shows the shift in mix more clearly than lines'),
      },
      column_trend: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_COLUMN'), switchTo: [P('TREND_SHARE')],
        reason: L('比率の動きを見るには内訳が必要です。項目別のデータで100%積み上げにするのがおすすめです', 'A shift in mix needs a breakdown; use a 100% stacked chart with data by part'),
      },
      slope: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_SLOPE'), switchTo: [P('TREND_SHARE')],
        reason: L('比率の動きは、100%積み上げの方が全体の中での位置が分かります', 'A 100% stacked chart shows each part within the whole'),
        chosen: {
          plates: [{ ...P('TREND_SLOPE'), name: L('始点と終点で構成の動きを見る', 'See mix movement from start to end') }],
          advice: L('全体に占める割合の変化を見せるなら、100%積み上げ縦棒のほうが分かりやすくなります。', 'To show how shares of the whole changed, 100% stacked columns are clearer.'),
          diff: L('各項目が全体の何%かの変化を見せます。', 'Shows how each part’s share of the whole changed.'),
        },
      },
    },
  },
};

const RANK_READS = L('大きさの順位を見るなら、1時点を大きい順に並べた横棒が読みやすくなります（データはそのままです）', 'To show the ranking, a horizontal bar chart sorted at one point reads best (your data stays the same)');
const TWO_METRICS = L(
  '2つの指標を比べるなら、同じ項目を同じ行にそろえた「2つの指標の比較」が標準です（単位が違っても、それぞれの軸で読めます）',
  'To compare two metrics, the standard is both metrics side by side on the same rows (each keeps its own axis, even with different units)',
);

/** 指標間の順位スロープ（B4′）。強調の初期値は、左右の指標で順位が最も動いた項目 */
const RANK_SLOPE = P('COMP_RANK_SLOPE', [], { highlight: AUTO_RANK_SHIFT });
const ONE_METRIC = L('順位スロープは2つの指標の順位の入れ替わりを見せます。この問いには1つの指標の横棒が向きます', 'A rank slope shows how the ranking changes between two metrics; this question reads best with bars on one metric');

/** 比較の4品（docs/composition-review.md の B1・B2・B4 を使う） */
const COMPARE: Partial<Record<EmphasisId, DishDef>> = {
  ranking: {
    id: 'ranking', question: L('どこが最も大きいか', 'Which is largest?'), proofNeeds: ['RANKING'], roles: ['CHOICE.OPTIONS'],
    materials: {
      bar_rank: { fit: 'DIRECT_FIT', plate: P('COMP_RANK'), alts: [P('COMP_RANK_DELTA'), P('COMP_RANK_CAGR')], switchTo: [P('COMP_RANK')] },
      column_compare: { fit: 'DIRECT_FIT', plate: P('COMP_COLUMN'), alts: [P('COMP_RANK')], switchTo: [P('COMP_RANK')] },
      clustered_column: {
        fit: 'SWITCH_RECOMMENDED', plate: P('START_END_CAGR'), switchTo: [P('COMP_RANK'), P('COMP_RANK_DELTA')], reason: RANK_READS,
        chosen: {
          plates: [{ ...P('START_END_CAGR'), name: L('開始と終了の値を並べる', 'Show the start and end values') }],
          advice: L('現在値だけの順位を簡潔に比べるなら、大きい順に並べた横棒ランキングが読みやすくなります。', 'To compare only the current ranking simply, horizontal bars sorted from largest are easier to read.'),
          diff: L('別案では、現在値を大きい順に並べます。', 'The alternative ranks current values from largest to smallest.'),
        },
      },
      variance_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('COMP_VARIANCE'), switchTo: [P('COMP_RANK'), P('COMP_RANK_DELTA')],
        reason: L('差分バーは増減だけを見せるので、大きさの順位は見えません。順位を見るなら横棒ランキングがおすすめです', 'Difference bars show only the change, not the ranking by size. A ranked bar chart is recommended'),
        chosen: {
          plates: [{ ...P('COMP_VARIANCE'), name: L('増減の大きさで順位を見る', 'Rank by the size of change') }],
          advice: L('現在値そのものの順位を比べるなら、大きい順に並べた横棒ランキングが読みやすくなります。', 'To compare the ranking of current values themselves, horizontal bars sorted from largest are easier to read.'),
          diff: L('別案では、現在値を大きい順に並べます。', 'The alternative ranks current values from largest to smallest.'),
        },
      },
      rank_slope: {
        fit: 'SWITCH_RECOMMENDED', plate: RANK_SLOPE, switchTo: [P('COMP_RANK')], reason: ONE_METRIC,
        chosen: {
          plates: [{ ...RANK_SLOPE, name: L('2指標の順位変化を見る', 'See ranking shifts across two metrics') }],
          advice: L('1つの指標で現在の順位を比べるなら、大きい順に並べた横棒ランキングが読みやすくなります。', 'To compare the current ranking on one metric, horizontal bars sorted from largest are easier to read.'),
          diff: L('別案では、1つの指標の現在順位を大きい順に並べます。', 'The alternative ranks current values for one metric from largest to smallest.'),
        },
      },
    },
  },
  gap: {
    id: 'gap', question: L('どれだけ差があるか', 'How big are the gaps?'), proofNeeds: ['SEGMENT_DIFFERENCE'], roles: ['AIMED.MISMATCH', 'DIAGNOSIS.LOCATION'],
    materials: {
      // 順位はそのまま、右に前回からの増減を同じ行で（B1）
      // 差の大きさが主な答えなので、右の増減を主役と同じ幅に（左右 1/2）
      bar_rank: { fit: 'DIRECT_FIT', when: ['PERIODS_2PLUS'], plate: P('COMP_RANK_DELTA', [], { side_ratio: 'half' }), alts: [P('COMP_VARIANCE')], switchTo: [P('COMP_RANK')], reason: L('時点が1つなので、項目の間の差は順位の横棒で見せます', 'With one point in time, the ranked bars show the gaps between items') },
      variance_bar: {
        fit: 'DIRECT_FIT', when: ['PERIODS_2PLUS'], plate: P('COMP_VARIANCE'), alts: [P('COMP_RANK_DELTA'), P('COMP_TWO_DELTA')], switchTo: [P('COMP_RANK')],
        chosen: {
          plates: [{ ...P('COMP_VARIANCE'), name: L('増減の差を見る', 'See the size of changes') }], when: ['PERIODS_2PLUS'],
          fallback: { ...P('COMP_VARIANCE'), name: L('比較元との差を見る', 'See differences from a comparison point') },
          note: L('時点が1つなので、比較元の値を足すと差分バーで増減を見せられます。', 'With one point in time, add comparison values to show the changes as difference bars.'), fits: true,
          advice: L('現在の順位と増減を同じ行で確認するなら、横棒ランキングと増減を並べた形が読みやすくなります。', 'To review current ranking and change on the same row, ranked bars paired with changes are easier to read.'),
          diff: L('別案では、現在の順位と増減を同じ行で示します。', 'The alternative shows current ranking and change on the same row.'),
        },
      },
      clustered_column: {
        fit: 'DIRECT_FIT', when: ['PERIODS_2PLUS'], plate: P('COMP_TWO_DELTA'), alts: [P('COMP_VARIANCE')], switchTo: [P('COMP_RANK')],
        chosen: {
          plates: [{ ...P('COMP_TWO_DELTA'), name: L('2つの値と差を見る', 'See two values and their gap') }], when: ['PERIODS_2PLUS'],
          fallback: { ...P('COMP_TWO_DELTA'), name: L('比較元との差を見る', 'See the gap from a comparison point') },
          note: L('時点が1つなので、比較元の値を足すと集合縦棒で2つの値と差を見せられます。', 'With one point in time, add comparison values to show both values and their gap as clustered columns.'), fits: true,
          advice: L('差そのものの大小を主役にするなら、増減だけを並べた差分バーが読みやすくなります。', 'To make the size of the gaps the main point, difference bars showing only the changes are easier to read.'),
          diff: L('別案では、増減の大きさだけを並べます。', 'The alternative ranks the size of the changes.'),
        },
      },
      column_compare: {
        fit: 'SWITCH_RECOMMENDED', plate: P('COMP_COLUMN'), switchTo: [P('COMP_TWO_DELTA'), P('COMP_VARIANCE')],
        reason: L('差（増減）を見せるなら、2時点を並べた集合縦棒に増減ラベルを添えるのがおすすめです', 'To show the change, clustered columns for two points with change labels work best'),
      },
      rank_slope: {
        fit: 'SWITCH_RECOMMENDED', plate: RANK_SLOPE, switchTo: [P('COMP_RANK_DELTA'), P('COMP_VARIANCE')], reason: ONE_METRIC,
        chosen: {
          plates: [{ ...RANK_SLOPE, name: L('2指標の順位の開きを見る', 'See ranking gaps across two metrics') }],
          advice: L('値の差を共通の軸で直接比べるなら、横棒ランキングと増減を並べた形が読みやすくなります。', 'To compare value gaps directly on a common scale, ranked bars paired with changes are easier to read.'),
          diff: L('別案では、値の差を共通の軸で比べます。', 'The alternative compares value gaps on a common scale.'),
        },
      },
    },
  },
  target_gap: {
    id: 'target_gap', question: L('基準からどれだけ離れているか', 'How far from the benchmark?'), proofNeeds: ['TARGET_GAP'], roles: ['DIAGNOSIS.SYMPTOM', 'TRANSFORMATION.GAP'],
    materials: {
      bar_rank: { fit: 'DIRECT_FIT', plate: P('COMP_RANK_AVG'), alts: [P('COMP_VARIANCE')], switchTo: [P('COMP_RANK_AVG')] },
      column_compare: { fit: 'DIRECT_FIT', plate: P('COMP_COLUMN', ['reference_line']), alts: [P('COMP_RANK_AVG')], switchTo: [P('COMP_RANK_AVG')] },
      // 予算（基準）と実績（比較）の差は、差分バーそのもの
      // 基準（予算・目標）に届かない項目から並べる（差の大きさは大きい順）
      variance_bar: {
        fit: 'DIRECT_FIT', when: ['PERIODS_2PLUS'], plate: P('COMP_VARIANCE', [], { variance_sort: 'asc' }), alts: [P('COMP_RANK_AVG')], switchTo: [P('COMP_RANK_AVG')],
        chosen: {
          plates: [{ ...P('COMP_VARIANCE', [], { variance_sort: 'asc' }), name: L('基準との差を見る', 'See gaps from the benchmark') }], when: ['PERIODS_2PLUS'],
          fallback: { ...P('COMP_VARIANCE', [], { variance_sort: 'asc' }), name: L('基準との差を見る', 'See gaps from the benchmark') },
          note: L('基準の値がまだないので、目標・平均などの比較元を足すと差分バーで距離を見せられます。', 'No benchmark values are available yet; add a target or average as the comparison point to show the gaps as difference bars.'), fits: true,
          advice: L('現在値と基準線の位置を一緒に見るなら、基準線を引いた横棒ランキングが読みやすくなります。', 'To see current values together with the benchmark line, ranked bars with a reference line are easier to read.'),
          diff: L('別案では、現在値と基準線を一緒に示します。', 'The alternative shows current values together with the benchmark line.'),
        },
      },
      clustered_column: {
        fit: 'SWITCH_RECOMMENDED', plate: P('START_END_CAGR'), switchTo: [P('COMP_RANK_AVG'), P('COMP_VARIANCE')],
        reason: L('基準（平均・目標）との差は、基準線を引いた横棒か、基準との差分バーで見せるのがおすすめです', 'A gap to a benchmark reads best as ranked bars with a reference line, or as difference bars against the benchmark'),
        chosen: {
          plates: [{ ...P('START_END_CAGR'), name: L('開始と終了の値を並べる', 'Show the start and end values') }],
          advice: L('現在値と基準の距離を直接読むなら、基準線を引いた横棒ランキングが向いています。', 'To read the distance between current values and the benchmark directly, ranked bars with a reference line work better.'),
          diff: L('別案では、現在値と基準線の距離を示します。', 'The alternative shows the distance between current values and the benchmark line.'),
        },
      },
      rank_slope: {
        fit: 'SWITCH_RECOMMENDED', plate: RANK_SLOPE, switchTo: [P('COMP_RANK_AVG')], reason: ONE_METRIC,
        chosen: {
          plates: [{ ...RANK_SLOPE, name: L('2指標で基準との順位を見る', 'See benchmark ranking across two metrics') }],
          advice: L('基準からの距離を1つの指標で明確に読むなら、基準線を引いた横棒ランキングが向いています。', 'To read distance from a benchmark clearly on one metric, ranked bars with a reference line work better.'),
          diff: L('別案では、現在値と1つの基準との差を比べます。', 'The alternative compares current values with one benchmark.'),
        },
      },
    },
  },
  balance: {
    id: 'balance', question: L('別の指標でも同じ結果か', 'Does another metric agree?'), proofNeeds: ['SECOND_METRIC'], roles: ['AIMED.MISMATCH', 'CHOICE.TRADE_OFFS'],
    materials: {
      // SECOND_METRIC の標準は B4（行をそろえた2指標比較）。指標間の順位スロープ（B4′）は順位の入れ替わりを強調する時の別案
      bar_rank: { fit: 'DIRECT_FIT', plate: P('COMP_RANK_METRIC2'), alts: [RANK_SLOPE], switchTo: [P('COMP_RANK_METRIC2')] },
      column_compare: { fit: 'SWITCH_RECOMMENDED', plate: P('COMP_COLUMN'), switchTo: [P('COMP_RANK_METRIC2'), RANK_SLOPE], reason: TWO_METRICS },
      clustered_column: {
        fit: 'SWITCH_RECOMMENDED', plate: P('START_END_CAGR'), switchTo: [P('COMP_RANK_METRIC2'), RANK_SLOPE], reason: TWO_METRICS,
        chosen: {
          plates: [{ ...P('START_END_CAGR'), name: L('開始と終了の値を並べる', 'Show the start and end values') }],
          advice: L('2つの指標の正確な値を同じ行で比べるなら、左右にそろえた横棒が読みやすくなります。', 'To compare exact values for two metrics on aligned rows, side-by-side horizontal bars are easier to read.'),
          diff: L('別案では、2つの指標の値を同じ行で比べます。', 'The alternative compares both metric values on the same row.'),
        },
      },
      variance_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('COMP_VARIANCE'), switchTo: [P('COMP_RANK_METRIC2'), RANK_SLOPE], reason: TWO_METRICS,
        chosen: {
          plates: [{ ...P('COMP_VARIANCE'), name: L('2つの指標の差を見る', 'See differences between two metrics') }],
          advice: L('2つの指標の正確な値を同じ行で比べるなら、左右にそろえた横棒が読みやすくなります。', 'To compare exact values for two metrics on aligned rows, side-by-side horizontal bars are easier to read.'),
          diff: L('別案では、2つの指標の値を同じ行で比べます。', 'The alternative compares both metric values on the same row.'),
        },
      },
      // 順位スロープを選んだ人：そのまま（強調は順位が最も動いた項目）。正確な値・大きさを見るなら B4
      rank_slope: {
        fit: 'DIRECT_FIT', plate: RANK_SLOPE, alts: [P('COMP_RANK_METRIC2')], switchTo: [P('COMP_RANK_METRIC2')],
        chosen: {
          plates: [{ ...RANK_SLOPE, name: L('2指標の順位バランスを見る', 'See ranking balance across two metrics') }], fits: true,
          advice: L('2つの指標の正確な値を同じ行で比べるなら、左右にそろえた横棒が読みやすくなります。', 'To compare exact values for two metrics on aligned rows, side-by-side horizontal bars are easier to read.'),
          diff: L('別案では、2つの指標の値を同じ行で比べます。', 'The alternative compares both metric values on the same row.'),
        },
      },
    },
  },
};

const NO_SIZE_MIX = L('100%横棒では全体の規模が見えません。規模と構成を1枚で見せるなら Mekko がおすすめです（データはそのままです）', '100% bars hide the size of the whole. For size and mix in one view, a Mekko chart is recommended (your data stays the same)');
const ONE_POINT = L('時点が1つなので、その時点の構成を見せます', 'With one point in time, the chart shows the mix at that point');

/** 構成の4品 */
const MIX: Partial<Record<EmphasisId, DishDef>> = {
  current_mix: {
    id: 'current_mix', question: L('今は何で構成されているか', 'What is it made of now?'), proofNeeds: ['CURRENT_MIX'], roles: ['AIMED.IMPACT'],
    materials: {
      bar_100: {
        fit: 'DIRECT_FIT', plate: P('MIX_SNAPSHOT'), switchTo: [P('MIX_MEKKO')],
        chosen: {
          plates: [
            { ...P('MIX_SNAPSHOT'), name: L('現在の構成を見る', 'See the current mix') },
            { ...P('MIX_BAR100'), name: L('2時点の構成も比べる', 'Also compare the mix at two points') },
          ], fits: true,
          advice: L('全体の規模と構成を同時に見せるなら、面積で両方を表すMekkoも使えます。', 'To show total size and mix together, a Mekko can encode both through area.'),
          diff: L('別案では、全体とカテゴリの規模も面積で示します。', 'The alternative uses area to show the size of the whole and each category.'),
        },
      },
      mekko: {
        fit: 'DIRECT_FIT', plate: P('MIX_MEKKO'), alts: [P('MIX_SNAPSHOT')], switchTo: [P('MIX_MEKKO')],
        chosen: {
          plates: [{ ...P('MIX_MEKKO'), name: L('現在の規模と構成を見る', 'See current size and mix') }],
          advice: L('規模ではなく構成比だけを比べるなら、100%横棒のほうが差を読み取りやすくなります。', 'To compare only the mix, not the size, 100% bars make the differences easier to read.'),
          diff: L('全体の大きさは見せず、構成比だけを比べます。', 'Compares the mix only, without the size of the whole.'),
        },
      },
      share_pair: {
        fit: 'SWITCH_RECOMMENDED', plate: P('MIX_PAIR_SHARE'), switchTo: [P('MIX_SNAPSHOT'), P('MIX_MEKKO')],
        reason: L('今の構成を見せるなら、1時点の100%横棒が読みやすくなります（シェアの変化はこのチャートの得意分野です）', 'For the current mix, a single 100% bar reads best (this chart is best for share changes)'),
        chosen: {
          plates: [{ ...P('MIX_PAIR_SHARE'), name: L('2時点の構成から現在を見る', 'See the current mix across two points') }],
          advice: L('今の構成だけを見せるなら、1時点の100%横棒のほうがすっきりします。', 'To show only the current mix, a single 100% bar is simpler.'),
          diff: L('前の時点は見せず、今の構成だけを見せます。', 'Shows only the current mix, without the earlier point.'),
        },
      },
    },
  },
  mix_shift: {
    id: 'mix_shift', question: L('比率はどう動いたか', 'How did the mix shift?'), proofNeeds: ['MIX_CHANGE'], roles: ['AIMED.MISMATCH'],
    materials: {
      bar_100: {
        fit: 'DIRECT_FIT', when: ['PERIODS_2PLUS'], plate: P('MIX_BAR100'), alts: [P('TREND_SHARE')], switchTo: [P('TREND_SHARE')], reason: ONE_POINT,
        chosen: {
          plates: [{ ...P('MIX_BAR100'), name: L('2時点の構成を比べる', 'Compare the mix at two points') }], when: ['PERIODS_2PLUS'],
          fallback: { ...P('MIX_SNAPSHOT'), name: L('現在の構成を見る', 'See the current mix') }, note: ONE_POINT, fits: true,
          advice: L('構成比の推移を時点の順に追うなら、100%積み上げ縦棒のほうが流れを読み取りやすくなります。', 'To follow the mix over time in sequence, 100% stacked columns make the progression easier to read.'),
          diff: L('別案では、時点ごとの構成比を縦に並べて推移を示します。', 'The alternative shows the mix over time with a column for each point.'),
        },
      },
      share_pair: {
        fit: 'DIRECT_FIT', plate: P('MIX_PAIR_SHARE'), alts: [P('MIX_BAR100')], switchTo: [P('MIX_PAIR_SHARE')],
        chosen: {
          plates: [{ ...P('MIX_PAIR_SHARE'), name: L('カテゴリごとの構成比の変化を見る', 'See share changes by category') }], fits: true,
          advice: L('全体の構成比を時点ごとに比べるなら、100%横棒ではカテゴリ間の違いもまとめて確認できます。', 'To compare the full mix at each point, 100% bars make differences across categories easier to review together.'),
          diff: L('カテゴリに分けず、全体の構成を時点ごとに並べます。', 'Shows the overall mix for each point, without splitting by category.'),
        },
      },
      mekko: {
        fit: 'SWITCH_RECOMMENDED', plate: P('MIX_MEKKO'), switchTo: [P('MIX_BAR100'), P('TREND_SHARE')],
        reason: L('Mekko は1時点の規模と構成を見せます。比率の動きは、2時点を並べた100%横棒がおすすめです', 'A Mekko shows size and mix at one point. For a shift in mix, 100% bars for two points work best'),
        // Mekko を残し、左に全体の構成（2時点）、区画に構成比の増減（pt）を添える。時点が1つなら Mekko だけ
        chosen: {
          plates: [P('MIX_MEKKO_SHIFT', ['delta_labels'])], when: ['PERIODS_2PLUS'],
          fallback: P('MIX_MEKKO'), note: L('時点が1つなので、Mekko で今の規模と構成を見せます。変化を見せるには、比べる時点のデータを足してください。', 'With one point in time, the Mekko shows the current size and mix. Add data for a second point to show the shift.'),
          advice: L('構成比の変化を主役にするなら、時点を並べた100%横棒や100%積み上げ縦棒のほうが、比率の増減を追いやすくなります。', 'If the shift in mix is the main point, 100% bars or 100% stacked columns by period make the changes easier to follow.'),
          diff: L('全体の大きさより、構成比の変化を見やすくします。', 'Makes the shift in mix easier to see than the sizes.'),
        },
      },
    },
  },
  size_and_mix: {
    id: 'size_and_mix', question: L('大きさと中身を1枚で', 'Size and mix in one view'), proofNeeds: ['SIZE_CONTEXT', 'CURRENT_MIX'], roles: ['BUSINESS_CASE.VALUE_POOL'],
    materials: {
      // 規模も伝えるので、ラベルは実数（%）
      mekko: {
        fit: 'DIRECT_FIT', plate: P('MIX_MEKKO', [], { mekko_labels: 'abs_pct' }), alts: [P('MIX_MEKKO_GROWTH')], switchTo: [P('MIX_MEKKO')],
        chosen: { plates: [{ ...P('MIX_MEKKO', [], { mekko_labels: 'abs_pct' }), name: L('規模と構成を1枚で見る', 'Size and mix in one view') }, P('MIX_MEKKO_GROWTH')], fits: true },
      },
      bar_100: {
        fit: 'SWITCH_RECOMMENDED', plate: P('MIX_SNAPSHOT'), switchTo: [P('MIX_MEKKO'), P('SIZE_MIX_CAGR')], reason: NO_SIZE_MIX,
        chosen: {
          plates: [{ ...P('MIX_SNAPSHOT'), name: L('構成比をそろえて比べる', 'Compare shares on a common scale') }],
          advice: L('全体規模と構成を同時に見せるなら、面積で両方を表すMekkoが向いています。', 'To show total size and mix together, a Mekko uses area to encode both.'),
          diff: L('別案では、全体とカテゴリの規模も面積で示します。', 'The alternative uses area to show the size of the whole and each category.'),
        },
      },
      share_pair: {
        fit: 'SWITCH_RECOMMENDED', plate: P('MIX_PAIR_SHARE'), switchTo: [P('MIX_MEKKO'), P('SIZE_MIX_CAGR')], reason: NO_SIZE_MIX,
        chosen: {
          plates: [{ ...P('MIX_PAIR_SHARE'), name: L('カテゴリごとの構成比を2時点で比べる', 'Compare category shares across two points') }],
          advice: L('全体の大きさと構成を一緒に見せるなら、Mekko のほうが向いています。', 'To show size and mix together, a Mekko fits better.'),
          diff: L('構成に加えて、全体とカテゴリの大きさも見せます。', 'Shows the size of the whole and each category as well as the mix.'),
        },
      },
    },
  },
  item_share: {
    id: 'item_share', question: L('特定の項目の占める割合は', 'What share does one item hold?'), proofNeeds: ['ITEM_SHARE'], roles: ['DIAGNOSIS.LOCATION'],
    materials: {
      // 特定の項目の比率：2時点以上なら最初と最後の比較（注目の項目は「強調」で1つ選ぶ）
      // 最初と最後で構成比が最も動いた項目を、初期の強調に（計算で決める。利用者は選び直せる）
      bar_100: {
        fit: 'DIRECT_FIT', when: ['PERIODS_2PLUS'], plate: P('MIX_BAR100', [], { highlight: AUTO_HIGHLIGHT }), alts: [P('TREND_SHARE', [], { highlight: AUTO_HIGHLIGHT })], switchTo: [P('TREND_SHARE', [], { highlight: AUTO_HIGHLIGHT })], reason: ONE_POINT,
        chosen: {
          plates: [
            { ...P('MIX_BAR100', [], { highlight: AUTO_HIGHLIGHT }), name: L('特定項目の比率を2時点で比べる', 'Compare one item’s share at two points') },
            { ...P('MIX_SNAPSHOT', [], { highlight: AUTO_HIGHLIGHT }), name: L('現在の比率を見る', 'See the current share') },
          ], when: ['PERIODS_2PLUS'],
          fallback: { ...P('MIX_SNAPSHOT', [], { highlight: AUTO_HIGHLIGHT }), name: L('現在の比率を見る', 'See the current share') }, note: ONE_POINT, fits: true,
          advice: L('特定項目の比率を時点順に追うなら、強調した100%積み上げ縦棒のほうが流れを読み取りやすくなります。', 'To follow one item’s share over time, highlighted 100% stacked columns make the progression easier to read.'),
          diff: L('別案では、特定項目の比率を時点順に並べます。', 'The alternative shows one item’s share in chronological order.'),
        },
      },
      share_pair: {
        fit: 'DIRECT_FIT', plate: P('MIX_PAIR_SHARE', [], { highlight: AUTO_HIGHLIGHT }), alts: [P('MIX_BAR100', [], { highlight: AUTO_HIGHLIGHT })], switchTo: [P('MIX_PAIR_SHARE', [], { highlight: AUTO_HIGHLIGHT })],
        chosen: {
          plates: [{ ...P('MIX_PAIR_SHARE', [], { highlight: AUTO_HIGHLIGHT }), name: L('特定項目の構成比を2時点で比べる', 'Compare one item’s share across two points') }], fits: true,
          advice: L('全カテゴリの構成をまとめて比べるなら、100%横棒のほうが全体の中での位置を追いやすくなります。', 'To compare the full mix across categories, 100% bars make each position within the whole easier to follow.'),
          diff: L('注目する項目だけでなく、全カテゴリの構成を並べます。', 'Shows the mix of every category, not just the focus item.'),
        },
      },
      mekko: {
        fit: 'SWITCH_RECOMMENDED', plate: P('MIX_MEKKO'), switchTo: [P('MIX_BAR100', [], { highlight: AUTO_HIGHLIGHT }), P('MIX_SNAPSHOT', [], { highlight: AUTO_HIGHLIGHT })],
        reason: L('特定の項目の比率は、100%横棒でその項目を強調すると読みやすくなります', 'A share of one item reads best as 100% bars with that item highlighted'),
        // Mekko のまま、注目する項目だけ色を付けて強調する（初期は構成比が最も動いた項目。編集画面で選び直せる）
        chosen: {
          plates: [{ ...P('MIX_MEKKO', [], { highlight: AUTO_HIGHLIGHT }), name: L('Mekko で特定項目を強調する', 'Highlight one item in the Mekko') }],
          advice: L('特定項目の比率だけを正確に比べるなら、100%横棒のほうが位置がそろい、差を読み取りやすくなります。規模も同時に見せたい場合は Mekko が適しています。', 'To compare one item’s share precisely, 100% bars line the values up and make differences easier to read. To show size as well, the Mekko fits better.'),
          diff: L('全体の大きさは見せず、比率だけを比べます。', 'Compares shares only, without the size of the whole.'),
        },
      },
    },
  },
};

const TO_BRIDGE = L('始点から終点へのつながり（何がどれだけ動かしたか）は、ウォーターフォールが読みやすくなります（データはそのままです）', 'The path from start to end reads best as a waterfall (your data stays the same)');
const TO_POSNEG = L('押し上げた要因と押し下げた要因を分けて見せるなら、プラスとマイナスを左右に分けたチャートがおすすめです', 'To separate what pushed up from what pulled down, the positive/negative split chart works best');
const TO_SCATTER = L('2つの指標の関係（連動）を見るなら、散布図がおすすめです', 'To see how two metrics move together, a scatter plot works best');
const TO_QUAD = L('位置づけ（どの領域・グループか）を見るなら、2軸で4つに分けた散布図がおすすめです', 'To place items in areas or groups, a scatter plot split into four quadrants works best');

/** 要因の4品・関係の4品 */
const CR: Partial<Record<EmphasisId, DishDef>> = {
  increase: {
    id: 'increase', question: L('何が増加に寄与したか', 'What contributed to the increase?'), proofNeeds: ['CONTRIBUTION'], roles: ['DIAGNOSIS.DRIVER'],
    materials: {
      waterfall: {
        fit: 'DIRECT_FIT', plate: P('CONTRIB_WATERFALL', [], { driver_sort: 'positive_first' }), alts: [P('CONTRIB_DRIVERS', [], { driver_sort: 'positive_first' })], switchTo: [P('CONTRIB_WATERFALL')],
        chosen: {
          plates: [{ ...P('CONTRIB_WATERFALL', [], { driver_sort: 'positive_first' }), name: L('増加要因を積み上がりで見る', 'See positive drivers as a bridge') }], fits: true,
          advice: L('増加要因の大小を直接比べるなら、プラス要因を大きい順に並べた要因バーが読みやすくなります。', 'To compare the size of positive drivers directly, driver bars sorted from largest are easier to read.'),
          diff: L('増加要因を大きい順に並べて比べます（始点からの流れは見せません）。', 'Ranks the positive drivers by size (without the flow from the start).'),
        },
      },
      driver_bar: {
        fit: 'DIRECT_FIT', plate: P('CONTRIB_DRIVERS', [], { driver_sort: 'positive_first' }), alts: [P('CONTRIB_WATERFALL', [], { driver_sort: 'positive_first' })], switchTo: [P('CONTRIB_DRIVERS')],
        chosen: { plates: [{ ...P('CONTRIB_DRIVERS', [], { driver_sort: 'positive_first' }), name: L('増加要因を大きい順に見る', 'See positive drivers by size') }], fits: true, advice: TO_BRIDGE, diff: L('別案では、増加要因を始点から終点へつなぎます。', 'The alternative bridges positive drivers from start to end.') },
      },
      posneg_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('CONTRIB_POSNEG'), switchTo: [P('CONTRIB_DRIVERS', [], { driver_sort: 'positive_first' }), P('CONTRIB_WATERFALL', [], { driver_sort: 'positive_first' })],
        reason: L('増加の要因に絞るなら、プラスの要因を先に大きい順で並べた横棒が読みやすくなります', 'To focus on what drove the increase, bars with the positive drivers first, largest first, read best'),
        chosen: { plates: [{ ...P('CONTRIB_POSNEG'), name: L('増減を左右に分けて見る', 'See positive and negative drivers separately') }], advice: L('増加要因だけを比べるなら、プラス要因を大きい順に並べた要因バーが読みやすくなります。', 'To compare only positive drivers, driver bars sorted from largest are easier to read.'), diff: L('別案では、増加要因だけを大きい順に並べます。', 'The alternative ranks only the positive drivers by size.') },
      },
    },
  },
  decrease: {
    id: 'decrease', question: L('何が減少に寄与したか', 'What contributed to the decrease?'), proofNeeds: ['CONTRIBUTION'], roles: ['DIAGNOSIS.DRIVER'],
    materials: {
      waterfall: {
        fit: 'DIRECT_FIT', plate: P('CONTRIB_WATERFALL', [], { driver_sort: 'negative_first' }), alts: [P('CONTRIB_DRIVERS', [], { driver_sort: 'negative_first' })], switchTo: [P('CONTRIB_WATERFALL')],
        chosen: {
          plates: [{ ...P('CONTRIB_WATERFALL', [], { driver_sort: 'negative_first' }), name: L('減少要因を積み上がりで見る', 'See negative drivers as a bridge') }], fits: true,
          advice: L('減少要因の大小を直接比べるなら、マイナス要因を大きい順に並べた要因バーが読みやすくなります。', 'To compare the size of negative drivers directly, driver bars sorted from largest are easier to read.'),
          diff: L('減少要因を大きい順に並べて比べます（始点からの流れは見せません）。', 'Ranks the negative drivers by size (without the flow from the start).'),
        },
      },
      driver_bar: {
        fit: 'DIRECT_FIT', plate: P('CONTRIB_DRIVERS', [], { driver_sort: 'negative_first' }), alts: [P('CONTRIB_POSNEG')], switchTo: [P('CONTRIB_DRIVERS')],
        chosen: { plates: [{ ...P('CONTRIB_DRIVERS', [], { driver_sort: 'negative_first' }), name: L('減少要因を大きい順に見る', 'See negative drivers by size') }], fits: true, advice: TO_POSNEG, diff: L('別案では、増加要因と減少要因を左右に分けます。', 'The alternative separates positive and negative drivers.') },
      },
      posneg_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('CONTRIB_POSNEG'), switchTo: [P('CONTRIB_DRIVERS', [], { driver_sort: 'negative_first' }), P('CONTRIB_WATERFALL', [], { driver_sort: 'negative_first' })],
        reason: L('減少の要因に絞るなら、マイナスの要因を先に大きい順で並べた横棒が読みやすくなります', 'To focus on what drove the decrease, bars with the negative drivers first, largest first, read best'),
        chosen: { plates: [{ ...P('CONTRIB_POSNEG'), name: L('増減を左右に分けて見る', 'See positive and negative drivers separately') }], advice: L('減少要因だけを比べるなら、マイナス要因を大きい順に並べた要因バーが読みやすくなります。', 'To compare only negative drivers, driver bars sorted from largest are easier to read.'), diff: L('別案では、減少要因だけを大きい順に並べます。', 'The alternative ranks only the negative drivers by size.') },
      },
    },
  },
  bridge: {
    id: 'bridge', question: L('AからBへ何が変化を生んだか', 'What moved it from A to B?'), proofNeeds: ['BRIDGE'], roles: ['AIMED.EXPLANATION', 'DIAGNOSIS.DRIVER'],
    materials: {
      // 始点から終点へは、入力の順（説明の順）で足し上げる
      waterfall: {
        fit: 'DIRECT_FIT', plate: P('CONTRIB_WATERFALL', [], { driver_sort: 'input' }), alts: [P('CONTRIB_WATERFALL'), P('CONTRIB_DRIVERS')], switchTo: [P('CONTRIB_WATERFALL')],
        chosen: {
          plates: [{ ...P('CONTRIB_WATERFALL', [], { driver_sort: 'input' }), name: L('始点から終点への変化をつなぐ', 'Bridge the change from start to end') }], fits: true,
          advice: L('各要因の大きさを横一列で比べるなら、要因バーのほうが差を読み取りやすくなります。', 'To compare every driver on one common scale, driver bars make the differences easier to read.'),
          diff: L('要因を大きさの順に並べて比べます（変化の流れは見せません）。', 'Ranks the drivers by size (without the flow of the change).'),
        },
      },
      driver_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('CONTRIB_DRIVERS'), switchTo: [P('CONTRIB_WATERFALL', [], { driver_sort: 'input' })], reason: TO_BRIDGE,
        chosen: { plates: [{ ...P('CONTRIB_DRIVERS'), name: L('要因の大きさを見る', 'See driver sizes') }], advice: TO_BRIDGE, diff: L('別案では、要因を始点から終点へ順につなぎます。', 'The alternative connects the drivers in order from start to end.') },
      },
      posneg_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('CONTRIB_POSNEG'), switchTo: [P('CONTRIB_WATERFALL', [], { driver_sort: 'input' })], reason: TO_BRIDGE,
        chosen: { plates: [{ ...P('CONTRIB_POSNEG'), name: L('増減を左右に分けて見る', 'See positive and negative drivers separately') }], advice: TO_BRIDGE, diff: L('別案では、要因を始点から終点へ順につなぎます。', 'The alternative connects the drivers in order from start to end.') },
      },
    },
  },
  posneg: {
    id: 'posneg', question: L('増やした項目と減らした項目は', 'Which parts added and which subtracted?'), proofNeeds: ['BRIDGE'], roles: ['PROOF.EVIDENCE'],
    materials: {
      posneg_bar: {
        fit: 'DIRECT_FIT', plate: P('CONTRIB_POSNEG'), alts: [P('CONTRIB_WATERFALL')], switchTo: [P('CONTRIB_POSNEG')],
        chosen: { plates: [{ ...P('CONTRIB_POSNEG'), name: L('増加と減少を分けて見る', 'Separate increases from decreases') }], fits: true, advice: TO_BRIDGE, diff: L('別案では、増減を始点から終点へつなぎます。', 'The alternative bridges the changes from start to end.') },
      },
      waterfall: {
        fit: 'SWITCH_RECOMMENDED', plate: P('CONTRIB_WATERFALL'), switchTo: [P('CONTRIB_POSNEG'), P('CONTRIB_DRIVERS')], reason: TO_POSNEG,
        chosen: {
          plates: [{ ...P('CONTRIB_WATERFALL'), name: L('増減を始点から終点へつなぐ', 'Bridge increases and decreases from start to end') }],
          advice: L('増やした要因と減らした要因を分けて見せるなら、左右に分けたプラス・マイナスの横棒のほうが分かりやすくなります。', 'To separate what added from what subtracted, bars split into plus and minus are clearer.'),
          diff: L('増やした要因と減らした要因を左右に分けて見せます。', 'Shows what added and what subtracted on two sides.'),
        },
      },
      driver_bar: {
        fit: 'SWITCH_RECOMMENDED', plate: P('CONTRIB_DRIVERS'), switchTo: [P('CONTRIB_POSNEG')], reason: TO_POSNEG,
        chosen: { plates: [{ ...P('CONTRIB_DRIVERS'), name: L('要因を大きい順に見る', 'See drivers by size') }], advice: TO_POSNEG, diff: L('別案では、増加要因と減少要因を左右に分けます。', 'The alternative separates positive and negative drivers.') },
      },
    },
  },
  correlation: {
    id: 'correlation', question: L('2つの指標は連動しているか', 'Do the two metrics move together?'), proofNeeds: ['RELATIONSHIP'], roles: ['PROOF.EVIDENCE'],
    materials: {
      // 相関の数字（係数）を出す。関連であって因果ではない
      scatter: { fit: 'DIRECT_FIT', plate: P('REL_SCATTER', [], { show_corr: true }), alts: [P('REL_QUADRANT')], switchTo: [P('REL_SCATTER', [], { show_corr: true })] },
      bubble: {
        fit: 'DIRECT_FIT', plate: P('REL_BUBBLE', [], { show_corr: true }), alts: [P('REL_SCATTER', [], { show_corr: true })], switchTo: [P('REL_BUBBLE')],
        chosen: {
          plates: [{ ...P('REL_BUBBLE', [], { show_corr: true }), name: L('相関と規模をバブルで見る', 'See correlation and size with bubbles') }], fits: true,
          advice: L('2つの指標の関係だけを簡潔に見るなら、点の大きさを使わない散布図のほうが読み取りやすくなります。', 'To inspect only the relationship between two metrics, a scatter plot without bubble size is easier to read.'),
          diff: L('点の大きさ（規模）は使わず、2つの指標の関係だけを見せます。', 'Shows only how the two metrics relate, without point size.'),
        },
      },
      variable_width: {
        fit: 'SWITCH_RECOMMENDED', plate: P('REL_VARIABLE_WIDTH'), switchTo: [P('REL_SCATTER', [], { show_corr: true })], reason: TO_SCATTER,
        chosen: {
          plates: [{ ...P('REL_VARIABLE_WIDTH'), name: L('幅と高さで2つの指標を見る', 'See two metrics through width and height') }],
          advice: L('2つの指標の関係を見るなら、散布図のほうが分かりやすくなります。', 'To see how two metrics relate, a scatter plot is clearer.'),
          diff: L('2つの指標の関係を点の並びで見せます。', 'Shows how the two metrics relate as a pattern of points.'),
        },
      },
    },
  },
  focus_area: {
    id: 'focus_area', question: L('どの領域に位置づけられるか', 'Where does each item sit?'), proofNeeds: ['POSITIONING'], roles: ['CHOICE.OPTIONS'],
    materials: {
      // 4つに分け、両方の指標が高い側に最も寄った項目を初期の強調に（計算で決める。「注力すべき」とは書かない）
      scatter: { fit: 'DIRECT_FIT', plate: P('REL_QUADRANT', [], { highlight: AUTO_TOP_RIGHT }), alts: [P('REL_BUBBLE', ['quadrants'])], switchTo: [P('REL_QUADRANT')] },
      bubble: {
        fit: 'DIRECT_FIT', plate: P('REL_BUBBLE', ['quadrants'], { highlight: AUTO_TOP_RIGHT }), alts: [P('REL_QUADRANT')], switchTo: [P('REL_BUBBLE', ['quadrants'])],
        chosen: {
          plates: [{ ...P('REL_BUBBLE', ['quadrants'], { highlight: AUTO_TOP_RIGHT }), name: L('規模を含めて重点領域を見る', 'See focus areas together with size') }], fits: true,
          advice: L('重点領域の位置だけを明快に示すなら、同じ大きさの点を使う4象限の散布図が読みやすくなります。', 'To show only where focus areas sit, a four-quadrant scatter plot with equal-sized points is clearer.'),
          diff: L('点の大きさは使わず、4つに分けた中での位置だけを見せます。', 'Shows only the position in four quadrants, without point size.'),
        },
      },
      variable_width: {
        fit: 'SWITCH_RECOMMENDED', plate: P('REL_VARIABLE_WIDTH'), switchTo: [P('REL_QUADRANT', [], { highlight: AUTO_TOP_RIGHT })], reason: TO_QUAD,
        chosen: {
          plates: [{ ...P('REL_VARIABLE_WIDTH'), name: L('幅と高さから重点領域を見る', 'Use width and height to inspect focus areas') }],
          advice: L('重点領域を見るなら、4つに分けた散布図のほうが分かりやすくなります。', 'To find focus areas, a scatter plot split into four is clearer.'),
          diff: L('2つの指標で4つの領域に分けて見せます。', 'Splits the items into four areas by two metrics.'),
        },
      },
    },
  },
  size_position: {
    id: 'size_position', question: L('大きさも含めてどこにいるか', 'Where does each sit, including size?'), proofNeeds: ['POSITIONING', 'SIZE_CONTEXT'], roles: ['CHOICE.TRADE_OFFS'],
    materials: {
      bubble: {
        fit: 'DIRECT_FIT', plate: P('REL_BUBBLE'), alts: [P('REL_VARIABLE_WIDTH')], switchTo: [P('REL_BUBBLE')],
        chosen: {
          plates: [{ ...P('REL_BUBBLE'), name: L('位置と規模をバブルで見る', 'See position and size with bubbles') }], fits: true,
          advice: L('規模と水準を棒の幅と高さで直接比べるなら、幅が変わる縦棒も使えます。', 'To compare size and level directly through bar width and height, variable-width columns are another option.'),
          diff: L('棒の幅で規模、高さで水準を見せます。', 'Uses bar width for size and height for level.'),
        },
      },
      variable_width: {
        fit: 'DIRECT_FIT', plate: P('REL_VARIABLE_WIDTH'), alts: [P('REL_BUBBLE')], switchTo: [P('REL_VARIABLE_WIDTH')],
        chosen: {
          plates: [{ ...P('REL_VARIABLE_WIDTH'), name: L('規模と水準を幅の違いで見る', 'See size and level through varying widths') }], fits: true,
          advice: L('2軸上の位置と規模を同時に見るなら、円の大きさで規模を表すバブルも使えます。', 'To see position on two axes together with size, a bubble chart can encode scale through circle size.'),
          diff: L('2つの指標の位置と、円の大きさで規模を見せます。', 'Shows position by two metrics and size by circle.'),
        },
      },
      scatter: {
        fit: 'SWITCH_RECOMMENDED', plate: P('REL_SCATTER'), switchTo: [P('REL_BUBBLE'), P('REL_VARIABLE_WIDTH')],
        reason: L('大きさも一緒に見せるなら、点の大きさで規模を表すバブルがおすすめです（3つ目の指標＝規模の列が要ります）', 'To show size too, a bubble chart uses point size for scale (it needs a third column for size)'),
      },
    },
  },
  quadrant: {
    id: 'quadrant', question: L('どのグループに入るか', 'Which group does each fall into?'), proofNeeds: ['POSITIONING'], roles: ['CHOICE.CRITERIA'],
    materials: {
      scatter: { fit: 'DIRECT_FIT', plate: P('REL_QUADRANT'), alts: [P('REL_BUBBLE', ['quadrants'])], switchTo: [P('REL_QUADRANT')] },
      bubble: {
        fit: 'DIRECT_FIT', plate: P('REL_BUBBLE', ['quadrants']), alts: [P('REL_QUADRANT')], switchTo: [P('REL_BUBBLE', ['quadrants'])],
        chosen: {
          plates: [{ ...P('REL_BUBBLE', ['quadrants']), name: L('規模を含めて象限別に分類する', 'Group by quadrant while retaining size') }], fits: true,
          advice: L('象限別の分類だけを簡潔に見せるなら、円の大きさをそろえた4象限の散布図が読みやすくなります。', 'To show only the quadrant grouping simply, a four-quadrant scatter plot with equal-sized points is easier to read.'),
          diff: L('点の大きさは使わず、4つのグループ分けだけを見せます。', 'Shows only the four groups, without point size.'),
        },
      },
      variable_width: {
        fit: 'SWITCH_RECOMMENDED', plate: P('REL_VARIABLE_WIDTH'), switchTo: [P('REL_QUADRANT')], reason: TO_QUAD,
        chosen: {
          plates: [{ ...P('REL_VARIABLE_WIDTH'), name: L('幅と高さからグループを読む', 'Read groups through width and height') }],
          advice: L('グループ分けを見るなら、4つに分けた散布図のほうが分かりやすくなります。', 'To show groups, a scatter plot split into four is clearer.'),
          diff: L('2つの指標で4つのグループに分けて見せます。', 'Splits the items into four groups by two metrics.'),
        },
      },
    },
  },
};

/** 料理の一覧（20品）。すべての料理が材料のマスを持つ */
export const DISHES: Record<EmphasisId, DishDef> = {
  trajectory: TREND.trajectory!,
  growth_rate: TREND.growth_rate!,
  growth_driver: TREND.growth_driver!,
  mix_change: TREND.mix_change!,
  ranking: COMPARE.ranking!,
  gap: COMPARE.gap!,
  target_gap: COMPARE.target_gap!,
  balance: COMPARE.balance!,
  current_mix: MIX.current_mix!,
  mix_shift: MIX.mix_shift!,
  size_and_mix: MIX.size_and_mix!,
  item_share: MIX.item_share!,
  increase: CR.increase!,
  decrease: CR.decrease!,
  bridge: CR.bridge!,
  posneg: CR.posneg!,
  correlation: CR.correlation!,
  focus_area: CR.focus_area!,
  size_position: CR.size_position!,
  quadrant: CR.quadrant!,
};

/** 確認の問い（一問だけ）。答えは条件に変える */
export const ASKS: Record<AskId, { question: LocalizedText; options: { id: string; label: LocalizedText; note: LocalizedText; sets: Conditions }[] }> = {
  with_mix: {
    question: L('構成比の変化も、一緒に見せますか？', 'Do you also want to show the change in mix?'),
    options: [
      { id: 'yes', label: L('はい、構成比の変化も一緒に', 'Yes, show the mix change too'), note: L('左に100%積み上げ、右に付け合わせを並べます', '100% stacked on the left, a supporting view on the right'), sets: { WITH_MIX_CHANGE: 'yes' } },
      { id: 'no', label: L('いいえ、これだけを伝えたい', 'No, just this'), note: L('全体の伸びが見えるチャートをおすすめします', 'A chart that shows the total growing is recommended'), sets: { WITH_MIX_CHANGE: 'no' } },
    ],
  },
  // 「構成比 × 伸びの速さ」が両方ある時の中心の Question（docs/dish-matrix.md 6.5）
  central: {
    question: L('今回の中心はどちらですか？', 'Which is the main question this time?'),
    options: [
      { id: 'mix', label: L('構成比がどう変わったか', 'How the mix changed'), note: L('100%積み上げと、項目別の伸び率（CAGR）を左右に並べます', '100% stacked with growth rates (CAGR) by part, side by side'), sets: { WITH_MIX_CHANGE: 'yes' } },
      { id: 'market', label: L('市場全体がどれだけ広がったか', 'How much the whole market grew'), note: L('実額の積み上げ縦棒で、全体の拡大と各項目の伸びを見せます', 'Absolute stacked columns show the total growing and each part’s growth'), sets: { WITH_MIX_CHANGE: 'no' } },
    ],
  },
};

const INTENT = new Set<ConditionId>(INTENT_CONDITIONS);

export interface CellResult {
  fit: FitLevel;
  lead: Proposal;
  alternatives: Proposal[];
  /** チャートから入った時の「選んだチャートで作る」案の数（lead を含む先頭から）。残りは別案 */
  chosenCount?: number;
  /** 別案を Coach がすすめるか（選んだチャートがこの伝えたいことに向いていない・データの条件を満たさない時）。false＝ただの別案 */
  recommendAlt?: boolean;
  advice?: LocalizedText;
  diff?: LocalizedText;
  fits?: boolean;
  /** 勧め先に替えた（選んだチャートをリードにしなかった） */
  switched: boolean;
  /** 替えた理由・条件（画面に1行） */
  note?: LocalizedText;
  /** まだ答えていない確認（答えるまでリードは決めない） */
  ask?: AskId;
}

const ok = (c: ConditionId[] | undefined, conds: Conditions) => (c ?? []).every((k) => conds[k] !== 'no');
const unanswered = (c: ConditionId[] | undefined, conds: Conditions) => (c ?? []).filter((k) => INTENT.has(k) && (conds[k] ?? 'unknown') === 'unknown');
const uniq = (lead: Proposal, list: Proposal[]) => {
  const seen = new Set([lead.recipe]);
  return list.filter((p) => (seen.has(p.recipe) ? false : (seen.add(p.recipe), true))).slice(0, 2);
};

/**
 * マスを、今分かっている条件で解く。
 * ・データの条件が unknown（データ入力前）なら、満たすものとして扱う（見本のデータは満たす）
 * ・意図の条件が unknown なら、左右構成を自動で採用せず ask を返す（一問だけ確認）
 * ・条件を満たさない、または SWITCH_RECOMMENDED なら、勧め先をリードに。選んだチャートの案は別案に残す（kept／conditional）
 */
/**
 * チャートから入った時、選んだチャートを第一案にする（試しに Mekko から。docs/decisions.md「チャートから選ぶ：選んだチャートを第一案に」）。
 * 別のチャートに自動で替えない。より向くチャートは Coach からの別案として後ろに並べる
 */
export const KEEP_CHOSEN: ReadonlySet<ChartTypeId> = new Set(['mekko', 'share_pair', 'waterfall', 'variable_width', 'bubble', 'slope', 'slope_pair', 'rank_slope', 'bar_100', 'variance_bar', 'clustered_column']);

/**
 * チャートから入った時の「伝えたいこと」の並び（得意な順。先頭を最初から選ぶ）と、① に出さない（向いていない）もの。
 * 向いていないものを外した時は、その下に1行の案内（hiddenNote）を出す
 */
export const CHART_EMPHASES: Partial<Record<ChartTypeId, { order: EmphasisId[]; hidden?: EmphasisId[]; hiddenNote?: LocalizedText }>> = {
  mekko: { order: ['current_mix', 'size_and_mix', 'item_share', 'mix_shift'] },
  share_pair: { order: ['mix_shift', 'item_share', 'current_mix', 'size_and_mix'] },
  waterfall: { order: ['bridge', 'increase', 'decrease', 'posneg'] },
  variable_width: {
    order: ['size_position'], hidden: ['correlation', 'focus_area', 'quadrant'],
    hiddenNote: L('相関・重点領域・象限別の分類は、散布図から選べます。', 'Correlation, focus areas and quadrant groups are available from the scatter plot.'),
  },
  bubble: { order: ['size_position', 'correlation', 'focus_area', 'quadrant'] },
  slope: { order: ['trajectory', 'growth_rate', 'growth_driver', 'mix_change'] },
  slope_pair: { order: ['trajectory', 'growth_rate', 'growth_driver', 'mix_change'] },
  rank_slope: {
    order: ['balance', 'ranking'], hidden: ['gap', 'target_gap'],
    hiddenNote: L('差・基準との差は、横棒ランキングや差分バーから選べます。', 'Gaps and gaps to a benchmark are available from ranked bars or difference bars.'),
  },
  bar_100: { order: ['current_mix', 'mix_shift', 'item_share', 'size_and_mix'] },
  variance_bar: {
    order: ['gap', 'target_gap', 'ranking'], hidden: ['balance'],
    hiddenNote: L('2つの指標のバランスは、横棒ランキングから選べます。', 'The balance of two metrics is available from ranked bars.'),
  },
  clustered_column: {
    order: ['gap', 'ranking'], hidden: ['target_gap', 'balance'],
    hiddenNote: L('基準との差・2つの指標のバランスは、横棒ランキングや差分バーから選べます。', 'Gaps to a benchmark and the balance of two metrics are available from ranked bars or difference bars.'),
  },
  stacked_100: { order: ['mix_change', 'growth_rate', 'trajectory', 'growth_driver'] },
  driver_bar: { order: ['increase', 'decrease', 'bridge', 'posneg'] },
  posneg_bar: { order: ['posneg', 'increase', 'decrease', 'bridge'] },
};

const mainChartOfRecipe = (p: Proposal) => registry.recipes[p.recipe].view.panels.find((x) => x.id === 'main')?.chart ?? null;

/** 選んだチャートで作る案を先に、Coach からの別案を後ろに */
export function resolveChosen(cell: Cell, chart: ChartTypeId, conds: Conditions): CellResult | null {
  const c = cell.chosen;
  if (!c) return null;
  const okWhen = ok(c.when, conds);
  const mine = okWhen ? c.plates : [c.fallback ?? c.plates[0]!];
  const seen = new Set(mine.map((p) => p.recipe));
  const others = [...cell.switchTo, ...(cell.alts ?? [])]
    .filter((p) => mainChartOfRecipe(p) !== chart && (seen.has(p.recipe) ? false : (seen.add(p.recipe), true)))
    .slice(0, 2);
  return {
    fit: cell.fit, lead: mine[0]!, alternatives: [...mine.slice(1), ...others], switched: false, chosenCount: mine.length,
    recommendAlt: cell.fit === 'SWITCH_RECOMMENDED' || !okWhen,
    ...(!okWhen && c.note ? { note: c.note } : {}), ...(others.length && c.advice ? { advice: c.advice } : {}),
    ...(c.diff ? { diff: c.diff } : {}), ...(c.fits ? { fits: true } : {}),
  };
}

export function resolveCell(cell: Cell, conds: Conditions): CellResult {
  const kept: Proposal = { ...cell.plate, tag: cell.fit === 'CONDITIONAL_FIT' ? 'conditional' : 'kept' };
  if (cell.fit === 'SWITCH_RECOMMENDED') {
    const [lead, ...rest] = cell.switchTo;
    return { fit: cell.fit, lead: lead!, alternatives: uniq(lead!, [kept, ...rest]), switched: true, ...(cell.reason ? { note: cell.reason } : {}) };
  }
  const pending = unanswered(cell.when, conds);
  if (cell.fit === 'CONDITIONAL_FIT' && pending.length && cell.ask && ok(cell.when, conds)) {
    return { fit: cell.fit, lead: cell.plate, alternatives: uniq(cell.plate, cell.switchTo), switched: false, ask: cell.ask };
  }
  if (!ok(cell.when, conds)) {
    const [lead, ...rest] = cell.switchTo;
    return { fit: cell.fit, lead: lead!, alternatives: uniq(lead!, [kept, ...rest]), switched: true, ...(cell.reason ? { note: cell.reason } : {}) };
  }
  const plate = cell.variants?.find((v) => ok(v.when, conds))?.plate ?? cell.plate;
  return { fit: cell.fit, lead: plate, alternatives: uniq(plate, [...(cell.alts ?? []), ...cell.switchTo]), switched: false };
}

/**
 * 「構成比 × 伸びの速さ」が両方求められた時（docs/dish-matrix.md 6.5）。
 * 構成比の比較が中心なら 100%積み上げ＋CAGR の左右構成、市場全体の拡大が中心なら実額の積み上げ縦棒1つ。
 * どちらか分からなければ一問だけ聞く（左右構成を自動で採用しない）
 */
export const MIX_AND_SPEED: Cell = {
  fit: 'CONDITIONAL_FIT', when: ['WITH_MIX_CHANGE', 'ABSOLUTE_BASE_AVAILABLE', 'CAGR_CALCULABLE'], ask: 'central',
  plate: P('TREND_SHARE_CAGR'), switchTo: [P('TREND_STACKED', ['cagr_note']), P('TREND_LINE', ['cagr_note'])],
  reason: L('市場全体の拡大が中心なので、実額の積み上げ縦棒で全体と各項目の伸びを見せます', 'The growth of the whole market is the main question, so absolute stacked columns show the total and each part growing'),
};

/** その料理・材料のマス（無ければ null：これまでの規則で推薦する） */
export const cellOf = (dish: EmphasisId, chart: ChartTypeId | null): Cell | null => (chart ? DISHES[dish].materials?.[chart] ?? null : null);
