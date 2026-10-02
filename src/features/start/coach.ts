import {
  GOAL_TO_PURPOSE, excludedBy, planCoverage, recipeAspects, recipesForChart, registry,
  type AspectId, type AudienceId, type ChartTypeId, type ComplementId, type ConsultationClassification, type ControlId,
  type LocalizedText, type PurposeId, type RecipeDef, type RecipeId,
} from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { recipeRenderable } from '@/engine/recipes';
import { KEEP_CHOSEN, MIX_AND_SPEED, cellOf, resolveChosen, resolveCell, type AskId, type Conditions, type FitLevel } from './dishes';
import { AUTO_RANK_SHIFT } from '../editor/fromRecipe';

/**
 * Coach 型の推薦（docs/decisions.md「Coach 型の切り口選定」）。
 * 3つの入り口（AI 相談・目的・チャート）は、どれも CoachIntent（何を最も伝えたいか）に収束させる。
 * 推薦・採点・別案はすべて規則で決める（AI は相談文の読み取りの1回だけ）。
 */

export type EntryType = 'ai' | 'purpose' | 'chart';

/** 重視点（「今回、最も強く伝えたいことは？」の答え）。目的ごとに4つまで */
export const EMPHASES = {
  trend: ['trajectory', 'growth_rate', 'growth_driver', 'mix_change'],
  comparison: ['ranking', 'gap', 'target_gap', 'balance'],
  composition: ['current_mix', 'mix_shift', 'size_and_mix', 'item_share'],
  contribution: ['increase', 'decrease', 'bridge', 'posneg'],
  relationship: ['correlation', 'focus_area', 'size_position', 'quadrant'],
  evaluate: [],
} as const satisfies Record<PurposeId, readonly string[]>;
export type EmphasisId = (typeof EMPHASES)[keyof typeof EMPHASES][number];

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

export const EMPHASIS_LABEL: Record<EmphasisId, LocalizedText> = {
  trajectory: L('変化の軌跡', 'How it changed over time'),
  growth_rate: L('伸びの速さ', 'How fast it grew'),
  growth_driver: L('成長の牽引役', 'What drove the growth'),
  mix_change: L('構成の変化', 'How the mix changed'),
  ranking: L('順位', 'Ranking'),
  gap: L('差の大きさ', 'Size of the gaps'),
  target_gap: L('目標・平均との差', 'Gap to target or average'),
  balance: L('2つの指標のバランス', 'Balance of two metrics'),
  current_mix: L('現在の構成', 'Current mix'),
  mix_shift: L('構成の変化', 'How the mix changed'),
  size_and_mix: L('全体規模と構成', 'Total size and mix'),
  item_share: L('特定項目の比率', 'Share of a specific item'),
  increase: L('増加要因', 'What pushed it up'),
  decrease: L('減少要因', 'What pulled it down'),
  bridge: L('始点から終点への変化', 'From start to end'),
  posneg: L('プラス・マイナスのバランス', 'Pluses versus minuses'),
  correlation: L('相関', 'Correlation'),
  focus_area: L('重点領域', 'Where to focus'),
  size_position: L('規模を含めた位置づけ', 'Position including size'),
  quadrant: L('象限別の分類', 'Grouping into quadrants'),
};

/** 案（プロポーザル）：レシピと、足す補完パーツ・設定 */
export interface Proposal {
  recipe: RecipeId;
  complements?: ComplementId[];
  controls?: Partial<Record<ControlId, unknown>>;
  /** 別案の印：kept＝選んだチャートのまま（勧め先に替えた時）、conditional＝条件付きの案 */
  tag?: 'kept' | 'conditional';
  /** カードに出す表現名（同じレシピでも、強調などで答え方が変わる時。無ければレシピの名前） */
  name?: LocalizedText;
}

/**
 * 重視点ごとの候補（先頭ほど重視点に合う）。採点で並べ直すが、情報量の多さには加点しない
 */
const MAP: Record<EmphasisId, Proposal[]> = {
  trajectory: [{ recipe: 'TREND_LINE' }, { recipe: 'TREND_COLUMN' }, { recipe: 'TREND_SLOPE' }],
  growth_rate: [{ recipe: 'TREND_LINE', complements: ['cagr_note'] }, { recipe: 'TREND_SLOPE' }, { recipe: 'TREND_CAGR_TABLE' }, { recipe: 'TREND_STACKED_CAGR' }, { recipe: 'TREND_SHARE_CAGR' }],
  growth_driver: [{ recipe: 'TREND_LINE_DELTA' }, { recipe: 'TREND_STACKED', complements: ['cagr_note'] }, { recipe: 'TREND_CAGR_TABLE' }, { recipe: 'TREND_STACKED_DELTA' }, { recipe: 'TREND_SHARE_DELTA' }],
  mix_change: [{ recipe: 'TREND_STACKED' }, { recipe: 'TREND_SHARE' }, { recipe: 'MIX_PAIR_SHARE' }],
  ranking: [{ recipe: 'COMP_RANK' }, { recipe: 'COMP_RANK_DELTA' }, { recipe: 'COMP_RANK_CAGR' }, { recipe: 'COMP_COLUMN' }, { recipe: 'TREND_SLOPE' }],
  gap: [{ recipe: 'COMP_VARIANCE' }, { recipe: 'COMP_TWO_DELTA' }, { recipe: 'START_END_CAGR' }],
  target_gap: [{ recipe: 'COMP_RANK_AVG' }, { recipe: 'TREND_LINE_AVG' }, { recipe: 'REL_VARIABLE_WIDTH' }],
  // SECOND_METRIC の標準は行をそろえた2指標比較（B4）。指標間の順位スロープ（B4′）は別案
  balance: [{ recipe: 'COMP_RANK_METRIC2' }, { recipe: 'COMP_RANK_SLOPE', controls: { highlight: AUTO_RANK_SHIFT } }, { recipe: 'TREND_SLOPE_PAIR' }, { recipe: 'REL_SCATTER' }, { recipe: 'TREND_COMBO' }],
  current_mix: [{ recipe: 'MIX_SNAPSHOT' }, { recipe: 'MIX_MEKKO' }, { recipe: 'MIX_BAR100' }],
  mix_shift: [{ recipe: 'MIX_BAR100' }, { recipe: 'TREND_SHARE' }, { recipe: 'MIX_PAIR_SHARE' }],
  size_and_mix: [{ recipe: 'MIX_MEKKO' }, { recipe: 'SIZE_MIX_CAGR' }, { recipe: 'TREND_STACKED' }],
  item_share: [{ recipe: 'MIX_PAIR_SHARE' }, { recipe: 'MIX_SNAPSHOT' }, { recipe: 'TREND_SHARE' }],
  increase: [{ recipe: 'CONTRIB_DRIVERS' }, { recipe: 'CONTRIB_WATERFALL' }, { recipe: 'CONTRIB_POSNEG' }],
  decrease: [{ recipe: 'CONTRIB_POSNEG' }, { recipe: 'CONTRIB_WATERFALL' }, { recipe: 'CONTRIB_DRIVERS' }],
  bridge: [{ recipe: 'CONTRIB_WATERFALL' }, { recipe: 'CONTRIB_DRIVERS' }, { recipe: 'CONTRIB_POSNEG' }],
  posneg: [{ recipe: 'CONTRIB_POSNEG' }, { recipe: 'CONTRIB_WATERFALL' }, { recipe: 'CONTRIB_DRIVERS' }],
  correlation: [{ recipe: 'REL_SCATTER', controls: { show_corr: true } }, { recipe: 'REL_BUBBLE' }, { recipe: 'REL_QUADRANT' }],
  focus_area: [{ recipe: 'REL_QUADRANT' }, { recipe: 'REL_VARIABLE_WIDTH' }, { recipe: 'REL_BUBBLE' }],
  size_position: [{ recipe: 'REL_BUBBLE' }, { recipe: 'REL_VARIABLE_WIDTH' }, { recipe: 'REL_QUADRANT' }],
  quadrant: [{ recipe: 'REL_QUADRANT' }, { recipe: 'REL_SCATTER' }, { recipe: 'REL_BUBBLE' }],
};

/**
 * チャートから入った時：チャートはそのまま、重視点で補完パーツ・設定を変える。
 * そのチャートで使えるものだけ付ける（例：積み上げ縦棒×伸びの速さ → 伸び率注記）
 */
const PARTS: Partial<Record<EmphasisId, { complements?: ComplementId[]; controls?: Partial<Record<ControlId, unknown>> }>> = {
  growth_rate: { complements: ['cagr_note'] },
  growth_driver: { complements: ['cagr_note', 'delta_labels'] },
  mix_change: { controls: { data_labels: 'all' } },
  mix_shift: { complements: ['delta_labels'] },
  gap: { complements: ['delta_labels', 'total_change'] },
  target_gap: { complements: ['reference_line'] },
  size_and_mix: { complements: ['total_labels'] },
  correlation: { controls: { show_corr: true } },
  focus_area: { complements: ['quadrants'] },
  quadrant: { complements: ['quadrants'] },
};

export interface CoachIntent {
  entryType: EntryType;
  purpose: PurposeId;
  emphasis: EmphasisId | null;
  audience: AudienceId | null;
  preferredChart: ChartTypeId | null;
  /** 重視点の確からしさ（0〜1）。0.8 以上なら質問を省いて自動で選ぶ */
  confidence: number;
  /** 相談から入った時の分類（データの形で候補を外すのに使う） */
  classification?: ConsultationClassification;
  /** 一品料理の表の条件（データ入力前は相談の分類と確認の答えから。docs/dish-matrix.md） */
  conditions?: Conditions;
  /** 重視点のほかにも求められていること（相談文から。例：伸びの速さ＋構成比の変化） */
  alsoNeeds?: ('MIX_CHANGE' | 'GROWTH_SPEED')[];
}

export const AUTO_EMPHASIS = 0.8;

/** その目的の重視点（質問の選択肢） */
export const emphasesFor = (p: PurposeId): readonly EmphasisId[] => EMPHASES[p];

const available = (id: RecipeId) => recipeRenderable(registry.recipes[id]);

/** 採点（10章）。重視点への適合が中心。複雑さは減点、情報量には加点しない */
export function scoreProposal(p: Proposal, rank: number, intent: CoachIntent): number {
  const r = registry.recipes[p.recipe];
  const fit = [40, 30, 24][rank] ?? 10;
  const goal = r.goals[0] === intent.purpose ? 20 : r.goals.includes(intent.purpose) ? 12 : 0;
  const glance = r.readingLoad === 'low' ? 15 : r.readingLoad === 'medium' ? 8 : 0;
  const shape = 15;
  const audience = intent.audience && r.audience.includes(intent.audience) ? 10 : 0;
  const penalty = (r.composition === 'TWO_CHARTS' ? 10 : 0) + (r.composition === 'CHART_TABLE' ? 5 : 0) + ((p.complements?.length ?? 0) >= 2 ? 5 : 0);
  return fit + goal + glance + shape + audience - penalty;
}

/** チャートのメインの単品レシピ（チャートから入った時のリード） */
const singleRecipe = (chart: ChartTypeId): RecipeDef | null =>
  recipesForChart(chart).filter((r) => recipeRenderable(r)).find((r) => r.composition === 'SINGLE_CHART') ?? recipesForChart(chart).find((r) => recipeRenderable(r)) ?? null;

/** 補完パーツ・設定を、そのチャートで使えるものだけに絞る */
function fitParts(chart: ChartTypeId, parts: { complements?: ComplementId[]; controls?: Partial<Record<ControlId, unknown>> } | undefined) {
  const ok = IMPLEMENTED_COMPLEMENTS[chart] ?? [];
  const complements = (parts?.complements ?? []).filter((c) => ok.includes(c));
  const controls = Object.fromEntries(Object.entries(parts?.controls ?? {}).filter(([k]) => registry.controls[k as ControlId]?.appliesTo.includes(chart)));
  return { ...(complements.length ? { complements } : {}), ...(Object.keys(controls).length ? { controls } : {}) };
}

export interface Recommendation {
  lead: Proposal;
  /** 同じ問いに別の構成で答える案（最大2） */
  alternatives: Proposal[];
  score: number;
  /** 一品料理の表で決めた時：適合度 */
  fit?: FitLevel;
  /** 選んだチャートから勧め先に替えた */
  switched?: boolean;
  /** 替えた理由（1行） */
  note?: LocalizedText;
  /** 答えてもらう確認（一問だけ）。答えるまでリードは決まらない */
  ask?: AskId;
  /** チャートから入った時：選んだチャートで作る案の数（lead から）。残りの alternatives は Coach からの別案 */
  chosenCount?: number;
  /** Coach からの別案を出す理由（1文）と、別案の「選んだチャートとの違い」 */
  advice?: LocalizedText;
  diff?: LocalizedText;
  /** 選んだチャートがこの目的に合う（カードに「この目的に適しています」） */
  fits?: boolean;
}

/**
 * 推薦：データの形で合わない候補を外し → 採点 → リード1つと別案2つ。
 * チャートから入った時は、そのチャートをリードに固定し、重視点で補完パーツを変える
 */
export function recommend(intent: CoachIntent): Recommendation | null {
  const emphasis = intent.emphasis ?? emphasesFor(intent.purpose)[0];
  if (!emphasis) return null;
  let list = MAP[emphasis].filter((p) => available(p.recipe));
  // 相談の分類で合わないもの（時間の扱い・足せない指標など）は外す。全部外れたら外さない
  if (intent.classification) {
    const c = intent.classification;
    const kept = list.filter((p) => !excludedBy({ ...registry.recipes[p.recipe], fit: { ...registry.recipes[p.recipe].fit, notFromConsult: false } }, c));
    if (kept.length) list = kept;
  }
  const scored = list.map((p, i) => ({ p, s: scoreProposal(p, i, intent), i })).sort((a, b) => b.s - a.s || a.i - b.i);
  // 一品料理の表：料理 × 材料のマス（チャートから入った時）、または「構成比 × 伸びの速さ」の両方を求められた時
  const both = (emphasis === 'growth_rate' && intent.alsoNeeds?.includes('MIX_CHANGE')) || (emphasis === 'mix_change' && intent.alsoNeeds?.includes('GROWTH_SPEED'));
  const cell = cellOf(emphasis, intent.preferredChart) ?? (both && (!intent.preferredChart || intent.preferredChart === 'stacked_100') ? MIX_AND_SPEED : null);
  // チャートから入った時（試しに Mekko）：選んだチャートで作る案を第一案・既定選択に。より向くチャートは Coach からの別案（自動で替えない）
  const chosen = cell && intent.preferredChart && KEEP_CHOSEN.has(intent.preferredChart) ? resolveChosen(cell, intent.preferredChart, intent.conditions ?? {}) : null;
  if (chosen) {
    const fit = (p: Proposal): Proposal => {
      const chart = registry.recipes[p.recipe].view.panels.find((q) => q.id === 'main')!.chart!;
      return { ...p, ...fitParts(chart, { complements: p.complements, controls: p.controls }) };
    };
    const alive = chosen.alternatives.filter((p) => available(p.recipe));
    return {
      lead: fit(chosen.lead), alternatives: alive.map(fit), score: 100, fit: chosen.fit, switched: false,
      chosenCount: Math.min(chosen.chosenCount ?? 1, 1 + alive.length),
      ...(chosen.note ? { note: chosen.note } : {}), ...(chosen.advice ? { advice: chosen.advice } : {}),
      ...(chosen.diff ? { diff: chosen.diff } : {}), ...(chosen.fits ? { fits: true } : {}),
    };
  }
  if (cell) {
    const r = resolveCell(cell, intent.conditions ?? {});
    const fit = (p: Proposal): Proposal => {
      const chart = registry.recipes[p.recipe].view.panels.find((q) => q.id === 'main')!.chart!;
      return { ...p, ...fitParts(chart, { complements: p.complements, controls: p.controls }) };
    };
    const alive = (p: Proposal) => available(p.recipe);
    const lead = alive(r.lead) ? r.lead : r.alternatives.find(alive);
    if (lead) {
      return {
        lead: fit(lead), alternatives: [...(lead === r.lead ? [] : [r.lead]), ...r.alternatives].filter((p) => p !== lead && alive(p)).slice(0, 2).map(fit),
        score: 100, fit: r.fit, switched: r.switched, ...(r.note ? { note: r.note } : {}), ...(r.ask ? { ask: r.ask } : {}),
      };
    }
  }
  if (intent.preferredChart) {
    const r = singleRecipe(intent.preferredChart);
    if (!r) return null;
    const lead: Proposal = { recipe: r.id, ...fitParts(intent.preferredChart, PARTS[emphasis]) };
    const alternatives = scored.map((x) => x.p).filter((p) => registry.recipes[p.recipe].view.panels.every((q) => q.chart !== intent.preferredChart)).slice(0, 2);
    return { lead, alternatives, score: 100 };
  }
  if (!scored.length) return null;
  const lead = scored[0]!.p;
  const chart = registry.recipes[lead.recipe].view.panels.find((q) => q.id === 'main')!.chart!;
  return { lead: { ...lead, ...fitParts(chart, { complements: lead.complements, controls: lead.controls }) }, alternatives: scored.slice(1, 3).map((x) => x.p), score: scored[0]!.s };
}

/** そのレシピが、どの重視点のリードか（エディターで別案を出すため。無ければ目的の最初） */
export function emphasisOfRecipe(recipe: RecipeId, purpose?: PurposeId): EmphasisId | null {
  const p = purpose ?? registry.recipes[recipe].goals[0]!;
  const list = emphasesFor(p);
  return list.find((e) => MAP[e][0]?.recipe === recipe) ?? list.find((e) => MAP[e].some((x) => x.recipe === recipe)) ?? list[0] ?? null;
}

/** 相談文の言葉（読み取りの手がかり。分類に無い「牽引」「目標」などを拾う） */
const WORDS: [RegExp, EmphasisId][] = [
  [/牽引|けん引|寄与|押し上げ|引っ張|drove|driv|contribut|led the growth/i, 'growth_driver'],
  [/成長率|伸び率|CAGR|速さ|ペース|growth rate|how fast/i, 'growth_rate'],
  [/構成比|シェア|内訳の変化|比率の変化|mix|share of/i, 'mix_change'],
  [/目標|予算|計画|平均との|target|budget|plan|benchmark|average/i, 'target_gap'],
  [/順位|ランキング|上位|トップ|rank|top \d/i, 'ranking'],
  [/差|ギャップ|増減|gap|difference/i, 'gap'],
  [/減少|悪化|押し下げ|decline|drag|pulled down/i, 'decrease'],
  [/増加要因|押し上げ要因|pushed up/i, 'increase'],
  [/象限|4つに分け|quadrant/i, 'quadrant'],
  [/重点|優先|注力|priorit|focus/i, 'focus_area'],
  [/規模|大きさ|size/i, 'size_and_mix'],
  [/相関|関係|correlat|relationship/i, 'correlation'],
];

/** 目的ごとに、言葉の重視点を読み替える（例：関係の「規模」は「規模を含めた位置づけ」） */
const REMAP: Partial<Record<PurposeId, Partial<Record<EmphasisId, EmphasisId>>>> = {
  composition: { mix_change: 'mix_shift' },
  relationship: { size_and_mix: 'size_position' },
};

/**
 * 相談の分類と相談文から、重視点を規則で推定する（AI をもう一度使わない）。
 * 手がかりが強いほど確からしさが高い。弱い時は質問する
 */
export function inferEmphasis(c: ConsultationClassification, text: string, opts: { override?: boolean } = {}): { purpose: PurposeId; emphasis: EmphasisId | null; confidence: number } {
  let purpose = GOAL_TO_PURPOSE[c.primary_goal];
  // 「牽引」「成長率」は推移の問いの強い手がかり。分類がほかの目的でも、確からしさが高くなければ推移として読む
  // （もう1つの問いとして分けて分類したものには使わない）
  if (opts.override !== false && purpose !== 'trend' && c.confidence < 0.9 && WORDS.slice(0, 2).some(([re]) => re.test(text))) purpose = 'trend';
  const allowed = emphasesFor(purpose) as readonly string[];
  const base = Math.min(1, Math.max(0.5, c.confidence));
  const pick = (e: EmphasisId, strength: number) => ({ purpose, emphasis: e, confidence: Math.round(base * strength * 100) / 100 });
  // 相談文の言葉（強い手がかり）
  for (const [re, e0] of WORDS) {
    const e = REMAP[purpose]?.[e0] ?? e0;
    if (re.test(text) && allowed.includes(e)) return pick(e, 1);
  }
  // 分類の項目（中くらいの手がかり）
  if (purpose === 'trend') {
    if (c.composition_intent === 'BREAKDOWN' || c.composition_intent === 'SHARE') return pick('mix_change', 0.9);
    if (c.needs_rate_context === true) return pick('growth_rate', 0.9);
  }
  if (purpose === 'comparison') {
    if (c.comparison_intent === 'LEVEL') return pick('ranking', 0.9);
    if (c.comparison_intent === 'DELTA' || c.comparison_intent === 'RANK_CHANGE') return pick('gap', 0.9);
    if (c.comparison_intent === 'AVERAGE_GAP') return pick('target_gap', 0.9);
  }
  if (purpose === 'composition') {
    if (c.composition_intent === 'SIZE_AND_SHARE') return pick('size_and_mix', 0.9);
    if (c.composition_intent === 'SHARE') return pick(c.time_mode === 'NONE' ? 'current_mix' : 'mix_shift', 0.85);
    if (c.composition_intent === 'BREAKDOWN') return pick('size_and_mix', 0.85);
  }
  return { purpose, emphasis: null, confidence: 0 };
}

/** 推薦理由（画面に出す短い文。規則から作る） */
export function reasonLines(intent: CoachIntent, lead: Proposal): LocalizedText[] {
  const r = registry.recipes[lead.recipe];
  const out: LocalizedText[] = [];
  if (intent.emphasis) out.push(L(`「${EMPHASIS_LABEL[intent.emphasis].ja}」を最も伝えたい`, `You most want to show “${EMPHASIS_LABEL[intent.emphasis].en.toLowerCase()}”`));
  const main = registry.recipes[lead.recipe].view.panels.find((q) => q.id === 'main')?.chart;
  if (intent.preferredChart && main === intent.preferredChart) out.push(L(`選んだチャート（${registry.charts[intent.preferredChart].label.ja}）のまま、見せ方を合わせる`, `Keeps your chosen chart (${registry.charts[intent.preferredChart].label.en}) and tunes it`));
  else if (intent.preferredChart && main) out.push(L(`この問いには、選んだチャート（${registry.charts[intent.preferredChart].label.ja}）より${registry.charts[main].label.ja}が向く`, `${registry.charts[main].label.en} suits this question better than your chosen chart (${registry.charts[intent.preferredChart].label.en})`));
  if (intent.audience === 'EXECUTIVE_MEETING') out.push(L('経営会議向けに、一目で分かる構成', 'Readable at a glance for an executive meeting'));
  if (r.readingLoad === 'low') out.push(L('読み取りが軽い（チャート1つで答える）', 'Light to read'));
  else if (r.view.panels.length > 1) out.push(L('主役のチャートと付け合わせを左右に並べ、1枚で答える', 'Main chart and a supporting view side by side answer it on one slide'));
  return out;
}

/** 別案が、リードとどう違うか（見せられることの差から作る） */
export function differenceText(lead: Proposal, alt: Proposal): LocalizedText {
  const has = (p: Proposal) => {
    const s = new Set<AspectId>(recipeAspects(registry.recipes[p.recipe]).shows);
    (p.complements ?? []).forEach((c) => registry.complements[c].covers.forEach((a) => s.add(a)));
    return s;
  };
  const a = has(lead), b = has(alt);
  const plus = [...b].filter((x) => !a.has(x)).map((x) => registry.aspects[x].label);
  const minus = [...a].filter((x) => !b.has(x)).map((x) => registry.aspects[x].label);
  if (plus.length) return L(`${plus.map((x) => x.ja).join('・')}も見せられる`, `Also shows ${plus.map((x) => x.en.toLowerCase()).join(', ')}`);
  if (minus.length) return L(`${minus.map((x) => x.ja).join('・')}は見せず、よりシンプル`, `Simpler; leaves out ${minus.map((x) => x.en.toLowerCase()).join(', ')}`);
  return L('同じことを別の形で見せる', 'Shows the same thing in another form');
}

/**
 * 補助スライドの提案（別の問いに答える案）：今のスライドの組み合わせで見せられないことを、別の目的の案で1つだけ。
 * 別の見せ方（同じ問い）に出している案は出さない
 */
export function supplementFor(slides: { recipe: RecipeDef; complements?: ComplementId[] }[], purpose: PurposeId, exclude: RecipeId[]): { recipe: RecipeId; aspect: AspectId } | null {
  const cov = planCoverage(slides, {
    complement: (id, chart) => (IMPLEMENTED_COMPLEMENTS[chart] ?? []).includes(id),
    recipe: (id) => available(id),
  });
  for (const g of cov.gaps) {
    if (!g.recipe || g.complement || exclude.includes(g.recipe)) continue;
    if (registry.recipes[g.recipe].goals[0] === purpose) continue;
    return { recipe: g.recipe, aspect: g.aspect };
  }
  return null;
}

/**
 * スライドに持たせる Coach の情報（データ入力後に、同じデータの別の見せ方・補助スライドを出すため）。
 * alternatives は同じ問いの別案（差し替え用）、dismissed は「今は追加しない」にした補助スライドの案
 */
export interface SlideCoach {
  purpose: PurposeId;
  emphasis: EmphasisId | null;
  alternatives: Proposal[];
  dismissed?: RecipeId[];
}
