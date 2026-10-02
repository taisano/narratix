import { registry, type ChartTypeId, type LocalizedText, type PurposeId, type RecipeId } from '@/registry';
import type { EmphasisId, Proposal } from './coach';

/**
 * 「目的から選ぶ」で入った時の ② の見せ方（docs/decisions.md「目的から選ぶ：単一選択」）。
 * 候補の並び（coach.ts の MAP と採点）は変えず、目的入口で出す時の「種類・名前・違い」だけをここに書く。
 */

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

/** 目的ごとの、① の伝えたいことの並び（先頭＝この目的の基本。最初から選んでおく） */
export const PURPOSE_EMPHASES: Partial<Record<PurposeId, { order: EmphasisId[] }>> = {
  trend: { order: ['trajectory', 'growth_rate', 'growth_driver', 'mix_change'] },
  comparison: { order: ['ranking', 'gap', 'target_gap', 'balance'] },
  composition: { order: ['current_mix', 'mix_shift', 'size_and_mix', 'item_share'] },
  // 目的の問い「始点から終点への変化は何によるか」に合わせ、始点から終点を先頭に
  contribution: { order: ['bridge', 'increase', 'decrease', 'posneg'] },
  relationship: { order: ['correlation', 'focus_area', 'size_position', 'quadrant'] },
};

/**
 * 候補の種類。
 * combined＝主の目的を保ったまま、もう1つの目的も1枚で答える（一緒に見せる案）
 * alternative＝同じ目的・伝えたいことに、別のチャート・別の構成で答える（別案）
 * variation＝おすすめと同じチャートで、補完や注記だけが少し違う（その他のバリエーション。上のボタンには出さない）
 */
export type PresentationKind = 'recommended' | 'combined' | 'alternative' | 'variation';

export interface PresentationMeta {
  /** おすすめ以外の種類（書かなければ別案） */
  kind?: Exclude<PresentationKind, 'recommended'>;
  /** 一緒に見せる目的（主の目的以外。1つまで）。おすすめが2つの目的に答える時も書く */
  withPurpose?: PurposeId;
  /** ボタン・カードの表現名（無ければレシピの名前） */
  name?: LocalizedText;
  /** おすすめとの違い（別案）、または一緒に見せられる内容（一緒に見せる案）。1文 */
  diff?: LocalizedText;
  /** 今のデータのほかに、追加のデータが要る */
  needsData?: boolean;
}

/** 伝えたいこと × レシピ → 目的入口での見せ方。書いていない候補は「別案」（おすすめはおすすめ） */
export const PURPOSE_META: Partial<Record<EmphasisId, Partial<Record<RecipeId, PresentationMeta>>>> = {
  // ── 推移（見本。ほかの目的も同じ書き方） ──
  trajectory: {
    TREND_COLUMN: { diff: L('期間ごとの大きさを棒で比べます。', 'Compares the size of each period with bars.') },
    TREND_SLOPE: { diff: L('最初と最後の2時点だけを結び、順位の入れ替わりを見せます。', 'Connects only the first and last points to show changes in order.') },
  },
  growth_rate: {
    TREND_SLOPE: { diff: L('最初と最後の2時点だけを結び、どこが速く伸びたかを傾きで見せます。', 'Connects the first and last points; the slope shows which grew fastest.') },
    TREND_CAGR_TABLE: { kind: 'combined', withPurpose: 'comparison', name: L('推移と項目ごとの伸び率', 'Trend with growth rate by item'), diff: L('右の表で、項目ごとの伸び率を並べて比べます。', 'A table on the right compares the growth rate of each item.') },
  },
  growth_driver: {
    // おすすめ自体が、推移と比較（項目ごとの増加額）を1枚で見せる
    TREND_LINE_DELTA: { withPurpose: 'comparison', diff: L('項目ごとの増加額も並べて比べます。', 'Also compares how much each item added.') },
    TREND_STACKED: { diff: L('全体の高さと内訳を積み上げで見せます。', 'Shows the total and its parts as stacked bars.') },
    TREND_CAGR_TABLE: { kind: 'combined', withPurpose: 'comparison', name: L('推移と項目ごとの伸び率', 'Trend with growth rate by item'), diff: L('右の表で、項目ごとの伸び率を並べて比べます。', 'A table on the right compares the growth rate of each item.') },
  },
  mix_change: {
    // 「構成の変化」はこの伝えたいこと自体が構成を含むので、100%積み上げ・2期間の比較は別案（一緒に見せる案ではない）
    TREND_SHARE: { diff: L('全体を100%にそろえ、構成比の動きだけを見せます。', 'Scales each period to 100% to show only the shift in mix.') },
    MIX_PAIR_SHARE: { diff: L('2時点のシェアを、カテゴリごとに並べて比べます。', 'Compares two-point shares side by side for each category.') },
  },

  // ── 比較 ──
  ranking: {
    COMP_RANK_DELTA: { kind: 'combined', withPurpose: 'trend', diff: L('現在の順位と、前回からの増減を同じ行で見せます。', 'Shows the current ranking and change since the previous point on the same rows.'), needsData: true },
    COMP_COLUMN: { diff: L('項目の大きさを縦棒で並べて比べます。', 'Compares item sizes as vertical columns.') },
  },
  gap: {
    COMP_TWO_DELTA: { diff: L('2つの値を並べ、元の大きさと差を一緒に見せます。', 'Places two values side by side to show both their levels and the gap.') },
    START_END_CAGR: { kind: 'combined', withPurpose: 'trend', diff: L('最初と最後の値に、期間全体の伸び率も添えます。', 'Shows the first and last values together with the growth rate over the period.') },
  },
  target_gap: {
    TREND_LINE_AVG: { kind: 'combined', withPurpose: 'trend', diff: L('平均との距離が、期間を通じてどう動いたかも見せます。', 'Also shows how the distance from the average changes over time.'), needsData: true },
    REL_VARIABLE_WIDTH: { kind: 'combined', withPurpose: 'relationship', diff: L('基準との差に加え、項目の規模と水準の関係も見せます。', 'Shows the relationship between item size and level as well as the gap from the benchmark.'), needsData: true },
  },
  balance: {
    COMP_RANK_SLOPE: { diff: L('2つの指標を順位に換え、入れ替わりを線で見せます。', 'Converts both metrics to ranks and connects the changes with lines.') },
    TREND_SLOPE_PAIR: { kind: 'combined', withPurpose: 'trend', diff: L('2つの指標について、最初から最後までの変化も並べて見せます。', 'Also shows the start-to-end change for both metrics side by side.'), needsData: true },
  },

  // ── 構成 ──
  current_mix: {
    MIX_BAR100: { kind: 'combined', withPurpose: 'comparison', diff: L('現在の構成に加え、最初の時点との違いも並べて見せます。', 'Shows the current mix together with how it differs from the first point.'), needsData: true },
    MIX_MEKKO: { diff: L('横幅で全体規模、縦の比率で内訳を見せます。', 'Uses width for total size and vertical proportions for the mix.') },
  },
  mix_shift: {
    // 「構成の変化」はこの伝えたいこと自体が時間比較を含むので、一緒に見せる案にはしない
    TREND_SHARE: { diff: L('すべての時点を100%にそろえ、構成比の動きを続けて見せます。', 'Scales every point to 100% to show the path of the changing mix.') },
    MIX_PAIR_SHARE: { diff: L('カテゴリごとに2時点のシェアを並べ、増減を比べます。', 'Compares share gains and losses across two points for each category.') },
  },
  size_and_mix: {
    SIZE_MIX_CAGR: { kind: 'combined', withPurpose: 'trend', diff: L('全体規模と構成に加え、最初から最後までの伸び率も見せます。', 'Shows the start-to-end growth rate as well as total size and mix.'), needsData: true },
    TREND_STACKED: { kind: 'combined', withPurpose: 'trend', diff: L('全体規模と内訳が、期間を通じてどう動いたかを見せます。', 'Shows how the total size and its parts move over time.'), needsData: true },
  },
  item_share: {
    MIX_PAIR_SHARE: { withPurpose: 'comparison', diff: L('特定項目のシェアを、カテゴリごと・2時点で比べます。', 'Compares the selected item’s share by category across two points.') },
    MIX_SNAPSHOT: { diff: L('最新の1時点に絞り、特定項目が占める比率を見せます。', 'Focuses on the latest point to show the share held by the selected item.') },
    TREND_SHARE: { kind: 'combined', withPurpose: 'trend', diff: L('特定項目の比率が、期間を通じてどう動いたかも見せます。', 'Also shows how the selected item’s share changes over time.') },
  },

  // ── 要因 ──
  increase: {
    CONTRIB_WATERFALL: { diff: L('始点から終点まで、増減が積み上がる流れを見せます。', 'Shows how the increases and decreases build from the start value to the end value.') },
    CONTRIB_POSNEG: { diff: L('増加要因と減少要因を左右に分け、同じ尺度で見せます。', 'Separates positive and negative drivers on the same scale.') },
  },
  decrease: {
    CONTRIB_WATERFALL: { diff: L('始点から終点まで、どの要因で値が動いたかを順に見せます。', 'Shows driver by driver how the value moves from the start to the end.') },
    CONTRIB_DRIVERS: { diff: L('要因を影響の大きい順に並べ、主な押し下げ要因を見せます。', 'Ranks drivers by impact to show the main downward drivers.') },
  },
  bridge: {
    CONTRIB_DRIVERS: { diff: L('始点と終点を省き、影響の大きい要因から順に見せます。', 'Omits the start and end levels and ranks the drivers by impact.') },
    CONTRIB_POSNEG: { diff: L('増加要因と減少要因を左右に分け、顔ぶれと大きさを見せます。', 'Separates positive and negative drivers to show their members and sizes.') },
  },
  posneg: {
    CONTRIB_WATERFALL: { diff: L('増減を始点から終点へつなぎ、差し引きの結果を見せます。', 'Connects the changes from start to end to show the net result.') },
    CONTRIB_DRIVERS: { diff: L('プラス・マイナスを一列に並べ、影響の大きい順に見せます。', 'Places positive and negative drivers in one ranking by impact.') },
  },
};

const mainChart = (r: RecipeId): ChartTypeId => registry.recipes[r].view.panels.find((p) => p.id === 'main')!.chart!;

export interface Presentation {
  proposal: Proposal;
  kind: PresentationKind;
  withPurpose?: PurposeId;
  name: LocalizedText;
  diff?: LocalizedText;
  needsData: boolean;
  chart: ChartTypeId;
}

/**
 * 目的入口の ② の候補を、上のボタンに出すもの（おすすめ＋一緒に見せる案・別案、最大3つ）と
 * 「その他のバリエーション」に分ける。並びはおすすめの順のまま
 */
export function purposePresentations(emphasis: EmphasisId, lead: Proposal, alternatives: Proposal[]): { main: Presentation[]; more: Presentation[] } {
  const of = (p: Proposal, isLead: boolean): Presentation => {
    const m = PURPOSE_META[emphasis]?.[p.recipe] ?? {};
    return {
      proposal: p,
      kind: isLead ? 'recommended' : m.kind ?? 'alternative',
      ...(m.withPurpose ? { withPurpose: m.withPurpose } : {}),
      name: m.name ?? p.name ?? registry.recipes[p.recipe].name,
      ...(m.diff ? { diff: m.diff } : {}),
      needsData: !!m.needsData,
      chart: mainChart(p.recipe),
    };
  };
  const all = [of(lead, true), ...alternatives.map((p) => of(p, false))];
  const top = all.filter((x) => x.kind !== 'variation');
  return { main: top.slice(0, 3), more: [...top.slice(3), ...all.filter((x) => x.kind === 'variation')] };
}

/** 選んでいる案の見せ方（右の「現在の選択」用。おすすめかどうかは問わず、名前と一緒に見せる目的だけ） */
export function purposePresentationOf(emphasis: EmphasisId, p: Proposal): { name: LocalizedText; withPurpose?: PurposeId } {
  const m = PURPOSE_META[emphasis]?.[p.recipe] ?? {};
  return { name: m.name ?? p.name ?? registry.recipes[p.recipe].name, ...(m.withPurpose ? { withPurpose: m.withPurpose } : {}) };
}
