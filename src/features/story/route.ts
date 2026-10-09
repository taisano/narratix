import {
  MVP_ROUTES,
  type DesiredYesId,
  type OutcomeDirectionId,
  type RouteSignalId,
  type StoryReading,
  type StoryRouteId,
} from '@/registry';

/** Route推薦の根拠。画面にはコードを直接出さず、必要なら翻訳文へ変換する */
export type RouteReason =
  | { code: 'matched_signal'; signal: RouteSignalId }
  | { code: 'matched_outcome'; outcome: OutcomeDirectionId }
  | { code: 'matched_yes'; desiredYes: DesiredYesId }
  | { code: 'route_not_enabled'; candidate: StoryRouteId }
  | { code: 'competing_signals'; signals: RouteSignalId[] }
  | { code: 'low_confidence'; confidence: number }
  | { code: 'default_aimed' };

export interface RouteDecision {
  route: StoryRouteId;
  reasons: RouteReason[];
}

const has = (reading: StoryReading, signal: RouteSignalId) => reading.routeSignals.includes(signal);

const enabled = (routes: readonly StoryRouteId[], route: StoryRouteId) => routes.includes(route);

/** これ未満の確信度は、規則で決めずAIMED（従来の型）へ戻す */
export const ROUTE_CONFIDENCE_FLOOR = 0.5;

/** Routeを決める信号。複数立った時は競合として理由に残す */
const DECIDING_SIGNALS: readonly RouteSignalId[] = ['ANSWER_READY', 'INVESTMENT', 'EXECUTION', 'VALIDATION', 'URGENCY', 'PRIORITIZATION', 'ROOT_CAUSE'];

const competing = (reading: StoryReading): RouteReason[] => {
  const signals = DECIDING_SIGNALS.filter((signal) => has(reading, signal));
  return signals.length > 1 ? [{ code: 'competing_signals', signals }] : [];
};

const finish = (candidate: StoryRouteId, reasons: RouteReason[], enabledRoutes: readonly StoryRouteId[]): RouteDecision => {
  if (enabled(enabledRoutes, candidate)) return { route: candidate, reasons };
  return { route: 'AIMED', reasons: [...reasons, { code: 'route_not_enabled', candidate }] };
};

/**
 * AIが読み取ったStoryReadingから、規則だけでPrimary Routeを決める。
 * 同じ読み取りと同じMVP_ROUTESなら必ず同じ結果になり、AIにはRoute名を選ばせない。
 * MVP_ROUTESに入っていないRouteは、候補理由を残してAIMEDへ戻る。
 */
export function decideRoute(reading: StoryReading, enabledRoutes: readonly StoryRouteId[] = MVP_ROUTES): RouteDecision {
  const decision = decideBySignals(reading, enabledRoutes);
  return decision.route === 'AIMED' && decision.reasons.some((r) => r.code === 'default_aimed' || r.code === 'low_confidence')
    ? decision
    : { ...decision, reasons: [...decision.reasons, ...competing(reading)] };
}

function decideBySignals(reading: StoryReading, enabledRoutes: readonly StoryRouteId[]): RouteDecision {
  // 読み取りの確信度が低い時は、型を決め打ちせず従来のAIMEDに戻す（信号が無い読み取りは確信度に関わらずAIMED）
  if (reading.confidence < ROUTE_CONFIDENCE_FLOOR && DECIDING_SIGNALS.some((signal) => has(reading, signal))) {
    return { route: 'AIMED', reasons: [{ code: 'low_confidence', confidence: reading.confidence }] };
  }
  // 結論がすでにある時は、分析を前に足さず結論先出しを最優先する。
  if (has(reading, 'ANSWER_READY')) {
    return finish('ANSWER_FIRST', [{ code: 'matched_signal', signal: 'ANSWER_READY' }], enabledRoutes);
  }

  // 予算・投資の判断は、候補比較よりも投資成立性を先に扱う。
  if (has(reading, 'INVESTMENT')) {
    return finish('BUSINESS_CASE', [{ code: 'matched_signal', signal: 'INVESTMENT' }], enabledRoutes);
  }

  // 実行計画を求めている時は、緊急性の説明だけで止めない。
  // ただし「急ぐ理由」を求めていて、実行まで約束させる意図(COMMITMENT)が無い時は、緊急性を先に扱う。
  if (has(reading, 'EXECUTION') && has(reading, 'URGENCY') && reading.desiredYes !== 'COMMITMENT') {
    return finish('URGENCY', [{ code: 'matched_signal', signal: 'URGENCY' }], enabledRoutes);
  }

  if (has(reading, 'EXECUTION')) {
    const reasons: RouteReason[] = [{ code: 'matched_signal', signal: 'EXECUTION' }];
    if (reading.desiredYes === 'COMMITMENT') reasons.push({ code: 'matched_yes', desiredYes: 'COMMITMENT' });
    return finish('TRANSFORMATION', reasons, enabledRoutes);
  }

  if (has(reading, 'VALIDATION')) {
    return finish('PROOF', [{ code: 'matched_signal', signal: 'VALIDATION' }], enabledRoutes);
  }

  if (has(reading, 'URGENCY')) {
    // 急ぐ理由と選択が重なり、選ぶことまで求めている時は、比較して選ぶ型へ。
    if (has(reading, 'PRIORITIZATION') && reading.desiredYes === 'SELECTION') {
      return finish('CHOICE', [
        { code: 'matched_signal', signal: 'PRIORITIZATION' },
        { code: 'matched_yes', desiredYes: 'SELECTION' },
      ], enabledRoutes);
    }
    return finish('URGENCY', [{ code: 'matched_signal', signal: 'URGENCY' }], enabledRoutes);
  }

  // 原因把握と選択が重なる時は、選ぶことまで求めているかで決める。
  if (has(reading, 'PRIORITIZATION') && has(reading, 'ROOT_CAUSE')) {
    if (reading.desiredYes === 'SELECTION') {
      return finish('CHOICE', [
        { code: 'matched_signal', signal: 'PRIORITIZATION' },
        { code: 'matched_yes', desiredYes: 'SELECTION' },
      ], enabledRoutes);
    }
    return finish('DIAGNOSIS', [{ code: 'matched_signal', signal: 'ROOT_CAUSE' }], enabledRoutes);
  }

  if (has(reading, 'PRIORITIZATION')) {
    return finish('CHOICE', [{ code: 'matched_signal', signal: 'PRIORITIZATION' }], enabledRoutes);
  }

  if (has(reading, 'ROOT_CAUSE')) {
    return finish('DIAGNOSIS', [{ code: 'matched_signal', signal: 'ROOT_CAUSE' }], enabledRoutes);
  }

  // 単なる「説明」だけではDiagnosisへ広げず、観察結果の向きが読める時だけ候補にする。
  if (has(reading, 'EXPLANATION') && reading.outcomeDirection !== 'UNKNOWN') {
    return finish('DIAGNOSIS', [
      { code: 'matched_signal', signal: 'EXPLANATION' },
      { code: 'matched_outcome', outcome: reading.outcomeDirection },
    ], enabledRoutes);
  }

  return { route: 'AIMED', reasons: [{ code: 'default_aimed' }] };
}
