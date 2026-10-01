import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, type StoryReading } from '@/registry';
import { planFromConsultation, recommendationState, type Plan } from '../start/plan';
import { applyCreationMode } from './creationMode';
import { onePicking, scopeOf, draftOf } from './ScopeCard';
import { oneSlideCandidates, pickCandidates, ONE_PICK_MAX } from './oneSlide';

const story: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'RANKING'],
  scopeCandidate: 'STORY_FLOW', routeSignals: ['PRIORITIZATION'], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};
const oneProof: StoryReading = { ...story, desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE'], routeSignals: [], scopeCandidate: 'ONE_SLIDE_STORY' };
const plan = (s: StoryReading | null, goal = 'TREND', text = '相談'): Plan => planFromConsultation({
  text, summary: '', question: '市場をどう見るか', classifier: s ? 'ai' : 'rules', story: s,
  classification: ConsultationClassificationSchema.parse({ primary_goal: goal }),
});

describe('入口で選んだ作りたいもの（creation_mode）', () => {
  it('1枚で伝える：Coach のおすすめが Story でも1枚。問いが複数あれば、決まる時は「〜に絞りました」の1つで提案する', () => {
    const p = applyCreationMode(plan(story, 'TREND'), 'ONE_SLIDE', 'ja', true);
    expect(p.creationMode).toBe('ONE_SLIDE');
    expect(scopeOf(p).scope).toBe('ONE_SLIDE_STORY');
    expect(p.oneFrom?.question).toBeTruthy();
    expect(onePicking(p)).toBe(false);
  });
  it('1枚で伝える：中心の問いが決まらない時は、黙って縮めず、最大3つの候補から選んでもらう', () => {
    const p = applyCreationMode(plan(story, 'RELATIONSHIP'), 'ONE_SLIDE', 'ja', true);
    expect(p.oneFrom).toBeUndefined();
    expect(onePicking(p)).toBe(true);
    const d = draftOf(p, 'ja')!;
    expect(oneSlideCandidates(d).length).toBeGreaterThan(1);
    expect(pickCandidates(p, d, ONE_PICK_MAX).length).toBeLessThanOrEqual(3);
  });
  it('1枚で伝える：問いが1つ、または AI の読み取りが無ければ、今までの1枚の提案', () => {
    for (const s of [oneProof, null]) {
      const p = applyCreationMode(plan(s), 'ONE_SLIDE', 'ja', true);
      expect(onePicking(p)).toBe(false);
      expect(p.oneFrom).toBeUndefined();
      expect(scopeOf(p).scope).toBe('ONE_SLIDE_STORY');
    }
  });
  it('複数枚の Story：1枚で足りる相談でも、「1枚で」と書いてあっても Story にする（AI の判定で変えない）', () => {
    for (const s of [oneProof, { ...story, explicitSize: 'ONE' as const }]) {
      const p = applyCreationMode(plan(s), 'STORY', 'ja', true);
      expect(scopeOf(p).scope).toBe('STORY_FLOW');
    }
  });
  it('複数枚の Story：AI の読み取りが無い時は、見せ方の並びが書いてあれば規則で組み、無ければ理由を出して1枚', () => {
    const outline = applyCreationMode(plan(null, 'TREND', '最初に KPI スコアカード、次に比較表、最後に次のアクションで'), 'STORY', 'ja', true);
    expect(scopeOf(outline).scope).toBe('STORY_FLOW');
    expect(draftOf(outline, 'ja')!.slides.map((s) => s.template)).toEqual(expect.arrayContaining(['STORY_TABLE_KPI', 'STORY_TABLE_COMPARISON', 'STORY_TEXT_NEXT_ACTIONS']));
    const none = applyCreationMode(plan(null), 'STORY', 'ja', true);
    expect(none.modeNote).toBe('storyNeedsAi');
    expect(scopeOf(none).scope).toBe('ONE_SLIDE_STORY');
  });
  it('Coach にまかせる：これまでどおり Coach が1つをすすめ、すすめた形を覚える', () => {
    expect(applyCreationMode(plan(story), 'COACH_RECOMMEND', 'ja', true)).toMatchObject({ creationMode: 'COACH_RECOMMEND', coachScope: 'story' });
    expect(applyCreationMode(plan(oneProof), 'COACH_RECOMMEND', 'ja', true).coachScope).toBe('one');
    expect(scopeOf(applyCreationMode(plan(story), 'COACH_RECOMMEND', 'ja', true)).scope).toBe('STORY_FLOW');
  });
  it('形を選び直すと、前の形の選択は持ち越さない。保存する推薦の状態に形が残る', () => {
    const one = applyCreationMode(plan(story, 'TREND'), 'ONE_SLIDE', 'ja', true);
    const st = applyCreationMode(one, 'STORY', 'ja', true);
    expect(st.oneFrom).toBeUndefined();
    expect(scopeOf(st).scope).toBe('STORY_FLOW');
    expect(recommendationState(st).creation_mode).toBe('STORY');
  });
});
