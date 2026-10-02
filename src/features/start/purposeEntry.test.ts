import { describe, expect, it } from 'vitest';
import { registry, type PurposeId } from '@/registry';
import { EMPHASES, recommend, type EmphasisId } from './coach';
import { angleRecommendation, emphasisChoices, planFromPurpose, planReady, selectedProposal, setEmphasis, setPresentation } from './plan';
import { PURPOSE_EMPHASES, PURPOSE_META, purposePresentations } from './purposeMeta';

const PURPOSES = ['trend', 'comparison', 'composition', 'contribution', 'relationship'] as const;
const purposeOfEmphasis = (e: EmphasisId): PurposeId => PURPOSES.find((p) => (EMPHASES[p] as readonly string[]).includes(e))!;

describe('目的から選ぶ：1つの目的で、基本の伝えたいことから始める', () => {
  it('5つの目的とも、基本の伝えたいことが選ばれ、おすすめのスライドがすぐ出る（空の状態で始めない）', () => {
    const want = { trend: ['trajectory', 'TREND_LINE'], comparison: ['ranking', 'COMP_RANK'], composition: ['current_mix', 'MIX_SNAPSHOT'], contribution: ['bridge', 'CONTRIB_WATERFALL'], relationship: ['correlation', 'REL_SCATTER'] } as const;
    for (const p of PURPOSES) {
      const plan = planFromPurpose(p);
      expect(plan.angles).toHaveLength(1);
      const a = plan.angles[0]!;
      expect(a.emphasis).toBe(want[p][0]);
      expect(a.coachEmphasis).toBe(want[p][0]);
      expect(planReady(plan)).toBe(true);
      expect(angleRecommendation(plan, a)!.lead.recipe).toBe(want[p][1]);
    }
  });
  it('① の並びは基本が先頭。要因は「始点から終点への変化」が先頭', () => {
    const plan = planFromPurpose('contribution');
    expect(emphasisChoices(plan, plan.angles[0]!)).toEqual(['bridge', 'increase', 'decrease', 'posneg']);
    for (const p of PURPOSES) expect(emphasisChoices(planFromPurpose(p), planFromPurpose(p).angles[0]!)[0]).toBe(PURPOSE_EMPHASES[p]!.order[0]);
  });
  it('伝えたいことを替えると、その伝えたいことのおすすめに戻る', () => {
    let plan = planFromPurpose('trend');
    const id = plan.angles[0]!.id;
    plan = setPresentation(plan, id, 'TREND_SLOPE');
    expect(selectedProposal(plan, plan.angles[0]!)!.recipe).toBe('TREND_SLOPE');
    plan = setEmphasis(plan, id, 'growth_rate');
    expect(selectedProposal(plan, plan.angles[0]!)!.recipe).toBe(angleRecommendation(plan, plan.angles[0]!)!.lead.recipe);
  });
});

describe('目的から選ぶ：② の候補（おすすめ・一緒に見せる案・別案）', () => {
  it('20通りのおすすめのチャートは今までと同じ', () => {
    const leads = PURPOSES.flatMap((p) => (EMPHASES[p] as readonly EmphasisId[]).map((e) => recommend({ entryType: 'purpose', purpose: p, emphasis: e, audience: null, preferredChart: null, confidence: 1, conditions: {} })!.lead.recipe));
    expect(leads).toEqual([
      'TREND_LINE', 'TREND_LINE', 'TREND_LINE_DELTA', 'TREND_STACKED',
      'COMP_RANK', 'COMP_VARIANCE', 'COMP_RANK_AVG', 'COMP_RANK_METRIC2',
      'MIX_SNAPSHOT', 'MIX_BAR100', 'MIX_MEKKO', 'MIX_PAIR_SHARE',
      'CONTRIB_DRIVERS', 'CONTRIB_POSNEG', 'CONTRIB_WATERFALL', 'CONTRIB_POSNEG',
      'REL_SCATTER', 'REL_QUADRANT', 'REL_BUBBLE', 'REL_QUADRANT',
    ]);
  });
  it('上のボタンは最大3つで先頭がおすすめ。一緒に見せる目的は主の目的以外の1つだけ', () => {
    for (const p of PURPOSES) for (const e of EMPHASES[p] as readonly EmphasisId[]) {
      const r = recommend({ entryType: 'purpose', purpose: p, emphasis: e, audience: null, preferredChart: null, confidence: 1, conditions: {} })!;
      const { main, more } = purposePresentations(e, r.lead, r.alternatives);
      expect(main.length).toBeLessThanOrEqual(3);
      expect(main[0]!.kind).toBe('recommended');
      expect(main.length + more.length).toBe(1 + r.alternatives.length);
      for (const x of [...main, ...more]) if (x.withPurpose) expect(x.withPurpose).not.toBe(p);
    }
  });
  it('書いた見せ方は、その伝えたいことの候補に実際にあるレシピだけ・一緒に見せる案には目的と違いの文がある', () => {
    for (const [e, m] of Object.entries(PURPOSE_META) as [EmphasisId, NonNullable<(typeof PURPOSE_META)[EmphasisId]>][]) {
      const p = purposeOfEmphasis(e);
      const r = recommend({ entryType: 'purpose', purpose: p, emphasis: e, audience: null, preferredChart: null, confidence: 1, conditions: {} })!;
      const ids = [r.lead, ...r.alternatives].map((x) => x.recipe);
      for (const [recipe, meta] of Object.entries(m)) {
        expect(ids, `${e}:${recipe}`).toContain(recipe);
        expect(recipe in registry.recipes).toBe(true);
        if (meta!.kind === 'combined') { expect(meta!.withPurpose, `${e}:${recipe}`).toBeTruthy(); expect(meta!.diff).toBeTruthy(); }
        if (meta!.diff) { expect(meta!.diff.ja).toBeTruthy(); expect(meta!.diff.en).toBeTruthy(); }
      }
    }
  });
  it('推移の見本：成長の牽引役は、おすすめ（推移＋比較）・別案・一緒に見せる案に分かれる', () => {
    const r = recommend({ entryType: 'purpose', purpose: 'trend', emphasis: 'growth_driver', audience: null, preferredChart: null, confidence: 1, conditions: {} })!;
    const { main } = purposePresentations('growth_driver', r.lead, r.alternatives);
    expect(main.map((x) => x.kind)).toEqual(['recommended', 'alternative', 'combined']);
    expect(main[0]!.withPurpose).toBe('comparison');
  });
  it('比較の4つは、おすすめ・別案・一緒に見せる案を候補の意味で分ける', () => {
    const want = {
      ranking: ['recommended', 'combined', 'alternative'],
      gap: ['recommended', 'alternative', 'combined'],
      target_gap: ['recommended', 'combined', 'combined'],
      balance: ['recommended', 'alternative', 'combined'],
    } as const;
    for (const emphasis of EMPHASES.comparison) {
      const r = recommend({ entryType: 'purpose', purpose: 'comparison', emphasis, audience: null, preferredChart: null, confidence: 1, conditions: {} })!;
      const all = purposePresentations(emphasis, r.lead, r.alternatives);
      expect([...all.main, ...all.more].map((x) => x.kind), emphasis).toEqual(want[emphasis]);
      expect([...all.main, ...all.more].slice(1).every((x) => x.diff?.ja && x.diff.en), emphasis).toBe(true);
    }
    expect(PURPOSE_META.ranking!.COMP_RANK_DELTA!.needsData).toBe(true);
    expect(PURPOSE_META.target_gap!.REL_VARIABLE_WIDTH!.needsData).toBe(true);
  });
  it('構成の4つは、伝えたいこと自体に含む変化と、追加で見せる推移を分ける', () => {
    const want = {
      current_mix: ['recommended', 'combined', 'alternative'],
      mix_shift: ['recommended', 'alternative', 'alternative'],
      size_and_mix: ['recommended', 'combined', 'combined'],
      item_share: ['recommended', 'alternative', 'combined'],
    } as const;
    for (const emphasis of EMPHASES.composition) {
      const r = recommend({ entryType: 'purpose', purpose: 'composition', emphasis, audience: null, preferredChart: null, confidence: 1, conditions: {} })!;
      const all = purposePresentations(emphasis, r.lead, r.alternatives);
      expect([...all.main, ...all.more].map((x) => x.kind), emphasis).toEqual(want[emphasis]);
      expect([...all.main, ...all.more].slice(1).every((x) => x.diff?.ja && x.diff.en), emphasis).toBe(true);
    }
    const item = PURPOSE_META.item_share!.MIX_PAIR_SHARE!;
    expect(item.withPurpose).toBe('comparison');
    expect(PURPOSE_META.size_and_mix!.SIZE_MIX_CAGR!.needsData).toBe(true);
  });
});
