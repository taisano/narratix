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
