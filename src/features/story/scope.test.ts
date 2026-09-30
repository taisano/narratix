import { describe, expect, it } from 'vitest';
import type { StoryReading } from '@/registry';
import { decideScope, unifiable } from './scope';
import { aimedQuestionMap, assignRoles, dishFor, storyFromReading } from './questionMap';
import { normalizeStory } from './model';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: null, desiredYes: null, primaryBarrier: null, proofNeeds: [], scopeCandidate: 'ONE_SLIDE_STORY',
  routeSignals: [], outcomeDirection: 'UNKNOWN', explicitSize: null, confidence: 0.8, ...over,
});

/** 検証シナリオ（docs/story-spec.md 19章） */
const KANSAI = R({ decisionQuestion: '関西だけ売上が伸びたことを報告する', desiredYes: 'RECOGNITION', proofNeeds: ['SEGMENT_DIFFERENCE'], routeSignals: ['DATA_DISCOVERY'], outcomeDirection: 'POSITIVE', confidence: 0.9 });
const INBOUND = R({
  decisionQuestion: 'どの訪日市場を優先して追うべきか', desiredYes: 'SELECTION', primaryBarrier: '市場規模と回復率で候補が一致しない',
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'], scopeCandidate: 'STORY_FLOW', routeSignals: ['DATA_DISCOVERY', 'MISMATCH', 'PRIORITIZATION'], outcomeDirection: 'MIXED', confidence: 0.89,
});

describe('1枚か Story か（規則）', () => {
  it('シナリオ1：関西だけ伸びたことを報告したい → 1枚', () => {
    expect(decideScope(KANSAI, true)).toEqual({ scope: 'ONE_SLIDE_STORY', reasons: ['ONE_PROOF', 'RECOGNITION'] });
  });
  it('シナリオ2：市場全体の回復・市場差・消費の中身から優先市場 → Story', () => {
    expect(decideScope(INBOUND, true)).toEqual({ scope: 'STORY_FLOW', reasons: ['MANY_PROOFS', 'DEEP_YES'] });
  });
  it('シナリオ3：独立した2つの問い → Story にまとめない', () => {
    expect(decideScope(R({ ...INBOUND, scopeCandidate: 'MULTIPLE_QUESTIONS' }), true).scope).toBe('MULTIPLE_QUESTIONS');
  });
  it('同じ読み取りなら、いつも同じ答え', () => {
    expect(decideScope(INBOUND, true)).toEqual(decideScope(structuredClone(INBOUND), true));
  });
  it('Story を使えないプラン、読み取りが無い（ルール版）→ 1枚', () => {
    expect(decideScope(INBOUND, false)).toEqual({ scope: 'ONE_SLIDE_STORY', reasons: ['PLAN'] });
    expect(decideScope(null, true)).toEqual({ scope: 'ONE_SLIDE_STORY', reasons: ['NO_READING'] });
  });
  it('「1枚で」「一連の流れ」の明示を優先する', () => {
    expect(decideScope({ ...INBOUND, explicitSize: 'ONE' }, true).scope).toBe('ONE_SLIDE_STORY');
    expect(decideScope({ ...KANSAI, explicitSize: 'MULTIPLE' }, true).scope).toBe('STORY_FLOW');
  });
  it('1枚にまとめられる組（全体の拡大＋寄与）は、理由まで求められなければ1枚', () => {
    expect(unifiable(['OVERALL_CHANGE', 'CONTRIBUTION'])).toBe(true);
    expect(unifiable(['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'])).toBe(false);
    expect(decideScope(R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'CONTRIBUTION'] }), true).scope).toBe('ONE_SLIDE_STORY');
  });
  it('判断が割れて、AI の候補も確かでない → 意図の深さを一問だけ聞く。答えたら追加の質問なしで決める', () => {
    const split = R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'], scopeCandidate: 'CLARIFY', confidence: 0.5 });
    expect(decideScope(split, true)).toEqual({ scope: 'CLARIFY', reasons: ['ASK_DEPTH'] });
    expect(decideScope(split, true, 'fact').scope).toBe('ONE_SLIDE_STORY');
    expect(decideScope(split, true, 'reason').scope).toBe('STORY_FLOW');
    // AI の候補が確かなら従う
    expect(decideScope({ ...split, scopeCandidate: 'STORY_FLOW', confidence: 0.85 }, true)).toEqual({ scope: 'STORY_FLOW', reasons: ['MANY_PROOFS', 'AI_CANDIDATE'] });
  });
});

describe('AIMED の Question Map（下書き）', () => {
  it('インバウンドの例（7.5）：全体 → 市場差 → 別の指標での見え方 → 次の判断', () => {
    const map = aimedQuestionMap(INBOUND, 'ja');
    expect(map.map((q) => [q.routeRole, q.proofNeeds])).toEqual([
      ['AIMED.IMPACT', ['OVERALL_CHANGE']],
      ['AIMED.MISMATCH', ['SEGMENT_DIFFERENCE']],
      ['AIMED.EXPLANATION', ['SECOND_METRIC']],
      ['AIMED.DECISION', []],
    ]);
    // Decision は言葉で書く1枚（Coach は代筆しない）。次の Question は並びの次
    expect(map[3]).toMatchObject({ presentationMode: 'TEXT', userAuthoredMessage: '', textContent: null });
    expect(map[0]!.nextQuestion).toBe(map[1]!.question);
    expect(map[3]!.nextQuestion).toBe('');
    // 参考のレシピは料理の表から（別の指標 → 行をそろえた2指標比較）
    expect(map[2]!.referenceRecipes[0]).toBe('COMP_RANK_METRIC2');
    expect(map[0]!.referenceRecipes.length).toBeGreaterThan(0);
  });
  it('別の指標は、市場の差が無ければ差の側（Mismatch）に置く', () => {
    expect(assignRoles(['OVERALL_CHANGE', 'SECOND_METRIC']).get('SECOND_METRIC')).toBe('AIMED.MISMATCH');
  });
  it('事実の認識までなら、説明（Explanation）へ広げない。1枚にまとまる組はまとめる', () => {
    const map = aimedQuestionMap(R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'GROWTH_SPEED', 'SEGMENT_DIFFERENCE'] }), 'ja');
    expect(map.map((q) => q.routeRole)).toEqual(['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.DECISION']);
    expect(map[0]!.proofNeeds).toEqual(['OVERALL_CHANGE', 'GROWTH_SPEED']);
  });
  it('寄与は説明の側。算術的な寄与の料理（成長の牽引役）につなぐ', () => {
    const map = aimedQuestionMap(R({ desiredYes: 'INTERPRETATION', proofNeeds: ['SEGMENT_DIFFERENCE', 'CONTRIBUTION'] }), 'ja');
    expect(map.map((q) => q.routeRole)).toEqual(['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION']);
    expect(dishFor(['CONTRIBUTION'])).toBe('growth_driver');
  });
  it('Story を作る：Message は空、データは無し、保存形式として読み戻せる', () => {
    const s = storyFromReading('相談文', INBOUND, 'ja');
    expect(s).toMatchObject({ scope: 'STORY_FLOW', primaryRoute: 'AIMED', decisionQuestion: 'どの訪日市場を優先して追うべきか', desiredYes: 'SELECTION', routeConfidence: 0.89, datasets: [] });
    expect(s.slides.every((q) => q.userAuthoredMessage === '' && q.visual === null)).toBe(true);
    expect(normalizeStory(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
