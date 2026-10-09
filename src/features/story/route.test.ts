import { describe, expect, it } from 'vitest';
import type { StoryReading, StoryRouteId } from '@/registry';
import { decideRoute } from './route';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: null, desiredYes: null, primaryBarrier: null, proofNeeds: [], scopeCandidate: 'STORY_FLOW',
  routeSignals: [], outcomeDirection: 'UNKNOWN', explicitSize: null, confidence: 0.8, ...over,
});

const ALL: StoryRouteId[] = ['ANSWER_FIRST', 'AIMED', 'DIAGNOSIS', 'CHOICE', 'URGENCY', 'BUSINESS_CASE', 'PROOF', 'TRANSFORMATION'];

describe('Story Routeを決める規則', () => {
  it.each([
    ['ANSWER_READY', 'ANSWER_FIRST'],
    ['INVESTMENT', 'BUSINESS_CASE'],
    ['EXECUTION', 'TRANSFORMATION'],
    ['VALIDATION', 'PROOF'],
    ['URGENCY', 'URGENCY'],
    ['PRIORITIZATION', 'CHOICE'],
    ['ROOT_CAUSE', 'DIAGNOSIS'],
  ] as const)('%s の候補は %s', (signal, route) => {
    expect(decideRoute(R({ routeSignals: [signal] }), ALL).route).toBe(route);
  });

  it('説明は結果の向きが分かる時だけDiagnosisにする', () => {
    expect(decideRoute(R({ routeSignals: ['EXPLANATION'], outcomeDirection: 'MIXED' }), ALL)).toEqual({
      route: 'DIAGNOSIS', reasons: [
        { code: 'matched_signal', signal: 'EXPLANATION' },
        { code: 'matched_outcome', outcome: 'MIXED' },
      ],
    });
    expect(decideRoute(R({ routeSignals: ['EXPLANATION'], outcomeDirection: 'UNKNOWN' }), ALL)).toEqual({ route: 'AIMED', reasons: [{ code: 'default_aimed' }] });
  });

  it('原因把握と選択が重なれば、SELECTIONはChoice、それ以前はDiagnosis', () => {
    const signals = ['ROOT_CAUSE', 'PRIORITIZATION'] as const;
    expect(decideRoute(R({ routeSignals: [...signals], desiredYes: 'SELECTION' }), ALL).route).toBe('CHOICE');
    expect(decideRoute(R({ routeSignals: [...signals], desiredYes: 'INTERPRETATION' }), ALL).route).toBe('DIAGNOSIS');
  });

  it('結論済み、投資、実行の順に、到達済みの判断段階を優先する', () => {
    expect(decideRoute(R({ routeSignals: ['ROOT_CAUSE', 'ANSWER_READY', 'INVESTMENT'] }), ALL).route).toBe('ANSWER_FIRST');
    expect(decideRoute(R({ routeSignals: ['PRIORITIZATION', 'INVESTMENT'] }), ALL).route).toBe('BUSINESS_CASE');
    expect(decideRoute(R({ routeSignals: ['URGENCY', 'EXECUTION'], desiredYes: 'COMMITMENT' }), ALL)).toMatchObject({
      route: 'TRANSFORMATION', reasons: [{ code: 'matched_signal', signal: 'EXECUTION' }, { code: 'matched_yes', desiredYes: 'COMMITMENT' }],
    });
  });

  it('Diagnosis、Choice、Answer First、Urgencyは有効', () => {
    expect(decideRoute(R({ routeSignals: ['ROOT_CAUSE'], outcomeDirection: 'NEGATIVE' }))).toEqual({
      route: 'DIAGNOSIS', reasons: [{ code: 'matched_signal', signal: 'ROOT_CAUSE' }],
    });
    expect(decideRoute(R({ routeSignals: ['PRIORITIZATION'], desiredYes: 'SELECTION' }))).toEqual({
      route: 'CHOICE',
      reasons: [{ code: 'matched_signal', signal: 'PRIORITIZATION' }],
    });
    expect(decideRoute(R({ routeSignals: ['ANSWER_READY'], desiredYes: 'SELECTION' }))).toEqual({
      route: 'ANSWER_FIRST',
      reasons: [{ code: 'matched_signal', signal: 'ANSWER_READY' }],
    });
    expect(decideRoute(R({ routeSignals: ['URGENCY'], desiredYes: 'COMMITMENT' }))).toEqual({
      route: 'URGENCY',
      reasons: [{ code: 'matched_signal', signal: 'URGENCY' }],
    });
  });

  it('同じ読み取りから常に同じ結果を返し、弱い手がかりはAIMEDにする', () => {
    const reading = R({ routeSignals: ['DATA_DISCOVERY', 'MISMATCH'], proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'] });
    expect(decideRoute(reading)).toEqual(decideRoute(structuredClone(reading)));
    expect(decideRoute(reading)).toEqual({ route: 'AIMED', reasons: [{ code: 'default_aimed' }] });
  });
});
