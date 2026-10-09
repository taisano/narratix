import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, type StoryReading } from '@/registry';
import { planFromConsultation } from '../start/plan';

const story: StoryReading = {
  decisionQuestion: 'C案を承認するか', desiredYes: 'COMMITMENT', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE'], scopeCandidate: 'STORY_FLOW',
  routeSignals: ['ANSWER_READY'], outcomeDirection: 'UNKNOWN', explicitSize: null, confidence: 0.9,
};
const plan = (s: StoryReading | null) => planFromConsultation({
  text: '結論から、根拠、リスク、依頼の順で', summary: '', question: '', classifier: 'ai', story: s,
  classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND', expected_action: 'CLARIFY', missing_info: ['VIEW'] }),
});

describe('構造が指定された相談は補足画面で止めない', () => {
  it('型の信号があり確信度が十分なら、そのまま案を作る', () => {
    expect(plan(story).consultation?.classification.expected_action).toBe('RECOMMEND');
  });
  it('信号が無い・確信度が低い・AIの読み取りが無い時は、これまでどおり確認する', () => {
    expect(plan({ ...story, routeSignals: [] }).consultation?.classification.expected_action).toBe('CLARIFY');
    expect(plan({ ...story, confidence: 0.3 }).consultation?.classification.expected_action).toBe('CLARIFY');
    expect(plan(null).consultation?.classification.expected_action).toBe('CLARIFY');
  });
});
