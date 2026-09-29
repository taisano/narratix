import type { ChartTypeId, LocalizedText, ProofNeedId } from '@/registry';
import type { EmphasisId, Proposal } from './coach';

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
  'PERIODS_2', 'PERIODS_3PLUS', 'MULTI_SERIES', 'FEW_SERIES', 'ADDITIVE',
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
      stacked_100: { fit: 'SWITCH_RECOMMENDED', plate: P('TREND_SHARE'), switchTo: [P('TREND_STACKED'), P('TREND_LINE')], reason: NO_SIZE },
      slope: { fit: 'CONDITIONAL_FIT', when: ['PERIODS_2'], plate: P('TREND_SLOPE', [], { slope_change: 'none' }), switchTo: [P('TREND_LINE')], reason: MANY_POINTS },
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
      },
      slope: { fit: 'CONDITIONAL_FIT', when: ['PERIODS_2'], plate: P('TREND_SLOPE', [], { slope_change: 'cagr' }), switchTo: [P('TREND_LINE', ['cagr_note'])], reason: MANY_POINTS },
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
      },
      column_trend: {
        fit: 'SWITCH_RECOMMENDED', plate: P('TREND_COLUMN'), switchTo: [P('TREND_STACKED_DELTA'), P('TREND_LINE_DELTA')],
        reason: L('項目が1つの縦棒では寄与を示せません。内訳（項目別）のデータで、積み上げ縦棒と増加額を見せるのがおすすめです', 'A single-series column chart cannot show contribution. With a breakdown by part, stacked columns plus the increases work best'),
      },
      slope: { fit: 'CONDITIONAL_FIT', when: ['PERIODS_2', 'MULTI_SERIES'], plate: P('TREND_SLOPE', ['total_change'], { slope_change: 'diff' }), switchTo: [P('TREND_LINE_DELTA')], reason: MANY_POINTS },
    },
  },
  mix_change: {
    id: 'mix_change', question: L('内訳の比率はどう動いたか', 'How did the mix shift?'),
    proofNeeds: ['MIX_CHANGE'], roles: ['AIMED.MISMATCH'],
    materials: {
      stacked_100: { fit: 'DIRECT_FIT', when: ['MULTI_SERIES'], plate: P('TREND_SHARE'), alts: [P('TREND_STACKED')], switchTo: [P('TREND_STACKED')] },
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
      },
    },
  },
};

/** 料理の一覧（20品）。推移以外は材料のマスがまだ無い（これまでの規則で推薦する） */
export const DISHES: Record<EmphasisId, DishDef> = {
  trajectory: TREND.trajectory!,
  growth_rate: TREND.growth_rate!,
  growth_driver: TREND.growth_driver!,
  mix_change: TREND.mix_change!,
  ranking: { id: 'ranking', question: L('どこが最も大きいか', 'Which is largest?'), proofNeeds: ['RANKING'], roles: ['CHOICE.OPTIONS'] },
  gap: { id: 'gap', question: L('どれだけ差があるか', 'How big are the gaps?'), proofNeeds: ['SEGMENT_DIFFERENCE'], roles: ['AIMED.MISMATCH', 'DIAGNOSIS.LOCATION'] },
  target_gap: { id: 'target_gap', question: L('基準からどれだけ離れているか', 'How far from the benchmark?'), proofNeeds: ['TARGET_GAP'], roles: ['DIAGNOSIS.SYMPTOM', 'TRANSFORMATION.GAP'] },
  balance: { id: 'balance', question: L('別の指標でも同じ結果か', 'Does another metric agree?'), proofNeeds: ['SECOND_METRIC'], roles: ['AIMED.MISMATCH', 'CHOICE.TRADE_OFFS'] },
  current_mix: { id: 'current_mix', question: L('今は何で構成されているか', 'What is it made of now?'), proofNeeds: ['CURRENT_MIX'], roles: ['AIMED.IMPACT'] },
  mix_shift: { id: 'mix_shift', question: L('比率はどう動いたか', 'How did the mix shift?'), proofNeeds: ['MIX_CHANGE'], roles: ['AIMED.MISMATCH'] },
  size_and_mix: { id: 'size_and_mix', question: L('大きさと中身を1枚で', 'Size and mix in one view'), proofNeeds: ['SIZE_CONTEXT', 'CURRENT_MIX'], roles: ['BUSINESS_CASE.VALUE_POOL'] },
  item_share: { id: 'item_share', question: L('特定の項目の占める割合は', 'What share does one item hold?'), proofNeeds: ['ITEM_SHARE'], roles: ['DIAGNOSIS.LOCATION'] },
  increase: { id: 'increase', question: L('何が増加に寄与したか', 'What contributed to the increase?'), proofNeeds: ['CONTRIBUTION'], roles: ['DIAGNOSIS.DRIVER'] },
  decrease: { id: 'decrease', question: L('何が減少に寄与したか', 'What contributed to the decrease?'), proofNeeds: ['CONTRIBUTION'], roles: ['DIAGNOSIS.DRIVER'] },
  bridge: { id: 'bridge', question: L('AからBへ何が変化を生んだか', 'What moved it from A to B?'), proofNeeds: ['BRIDGE'], roles: ['AIMED.EXPLANATION', 'DIAGNOSIS.DRIVER'] },
  posneg: { id: 'posneg', question: L('増やした項目と減らした項目は', 'Which parts added and which subtracted?'), proofNeeds: ['BRIDGE'], roles: ['PROOF.EVIDENCE'] },
  correlation: { id: 'correlation', question: L('2つの指標は連動しているか', 'Do the two metrics move together?'), proofNeeds: ['RELATIONSHIP'], roles: ['PROOF.EVIDENCE'] },
  focus_area: { id: 'focus_area', question: L('どの領域に位置づけられるか', 'Where does each item sit?'), proofNeeds: ['POSITIONING'], roles: ['CHOICE.OPTIONS'] },
  size_position: { id: 'size_position', question: L('大きさも含めてどこにいるか', 'Where does each sit, including size?'), proofNeeds: ['POSITIONING', 'SIZE_CONTEXT'], roles: ['CHOICE.TRADE_OFFS'] },
  quadrant: { id: 'quadrant', question: L('どのグループに入るか', 'Which group does each fall into?'), proofNeeds: ['POSITIONING'], roles: ['CHOICE.CRITERIA'] },
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
