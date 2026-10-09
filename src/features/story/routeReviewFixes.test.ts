import { describe, expect, it } from 'vitest';
import { STORY_ROUTES, STORY_ROUTE_IDS, type DesiredYesId, type StoryReading, type StoryRouteId } from '@/registry';
import { decideRoute } from './route';
import { routeQuestionMap, storyFromReading } from './questionMap';
import { setCoachingOnly } from './storyOps';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '判断したい', desiredYes: 'INTERPRETATION', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE'], scopeCandidate: 'STORY_FLOW',
  routeSignals: [], outcomeDirection: 'UNKNOWN', explicitSize: null, confidence: 0.9, ...over,
});
const active = <T extends { questionPriority: string }>(map: T[]) => map.filter((slide) => slide.questionPriority !== 'COACHING_ONLY');

describe('decideRoute：レビュー修正', () => {
  it('確信度が低い読み取りはRouteを決め打ちせずAIMEDへ戻し、理由を残す', () => {
    expect(decideRoute(R({ routeSignals: ['URGENCY'], confidence: 0.2 }))).toEqual({ route: 'AIMED', reasons: [{ code: 'low_confidence', confidence: 0.2 }] });
    expect(decideRoute(R({ routeSignals: ['URGENCY'], confidence: 0.5 })).route).toBe('URGENCY');
    // 信号が無ければ、確信度に関わらず従来どおりの既定
    expect(decideRoute(R({ confidence: 0.1 })).reasons).toEqual([{ code: 'default_aimed' }]);
  });

  it('急ぐ理由と実行が重なる時、COMMITMENTでなければUrgency、COMMITMENTならTransformation', () => {
    const signals = ['URGENCY', 'EXECUTION'] as const;
    expect(decideRoute(R({ routeSignals: [...signals], desiredYes: 'RECOGNITION' })).route).toBe('URGENCY');
    expect(decideRoute(R({ routeSignals: [...signals], desiredYes: 'COMMITMENT' })).route).toBe('TRANSFORMATION');
  });

  it('急ぐ理由と優先順位が重なり、選ぶことまで求めるならChoice', () => {
    expect(decideRoute(R({ routeSignals: ['URGENCY', 'PRIORITIZATION'], desiredYes: 'SELECTION' })).route).toBe('CHOICE');
    expect(decideRoute(R({ routeSignals: ['URGENCY', 'PRIORITIZATION'], desiredYes: 'RECOGNITION' })).route).toBe('URGENCY');
  });

  it('複数の信号が競合した時は、その事実を理由に残す', () => {
    const d = decideRoute(R({ routeSignals: ['PRIORITIZATION', 'ROOT_CAUSE'], desiredYes: 'SELECTION' }));
    expect(d.route).toBe('CHOICE');
    expect(d.reasons).toContainEqual({ code: 'competing_signals', signals: ['PRIORITIZATION', 'ROOT_CAUSE'] });
    expect(decideRoute(R({ routeSignals: ['ROOT_CAUSE'] })).reasons.some((r) => r.code === 'competing_signals')).toBe(false);
  });
});

describe('Question Map：レビュー修正', () => {
  it('停止位置より後ろの証明要求は捨てず、外した問いとして置き、戻せる', () => {
    const reading = R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'CONTRIBUTION'], routeSignals: ['ROOT_CAUSE'] });
    const story = storyFromReading('売上減少の要因', reading, 'ja');
    const parked = story.slides.filter((slide) => slide.questionPriority === 'COACHING_ONLY');
    expect(parked.map((slide) => slide.routeRole)).toEqual(['DIAGNOSIS.DRIVER', 'DIAGNOSIS.ROOT_CAUSE']);
    expect(parked[0]!.proofNeeds).toEqual(['CONTRIBUTION']);
    const restored = setCoachingOnly(story, parked[0]!.id, false);
    expect(restored.slides.find((slide) => slide.id === parked[0]!.id)?.questionPriority).toBe('CONDITIONAL');
  });

  it('次のQuestionは、外した問いを飛ばした次の問いになる', () => {
    const map = routeQuestionMap(R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'CONTRIBUTION'] }), 'ja', 'DIAGNOSIS');
    const a = active(map);
    expect(a.at(-1)!.nextQuestion).toBe('');
    expect(a[0]!.nextQuestion).toBe(a[1]!.question);
    expect(map.filter((slide) => slide.questionPriority === 'COACHING_ONLY').every((slide) => slide.nextQuestion === '')).toBe(true);
  });

  it('主たるYes以外では、Yesの段階を越える役割まで広げない', () => {
    const cases: [StoryRouteId, DesiredYesId, string[]][] = [
      ['TRANSFORMATION', 'SELECTION', ['AMBITION', 'BASELINE', 'GAP']],
      ['ANSWER_FIRST', 'INTERPRETATION', ['ANSWER', 'REASONS', 'EVIDENCE']],
      ['CHOICE', 'RECOGNITION', ['CRITERIA', 'OPTIONS', 'TRADE_OFFS']],
      ['BUSINESS_CASE', 'SELECTION', ['OPPORTUNITY', 'VALUE_POOL']],
    ];
    for (const [route, yes, roles] of cases) {
      expect(STORY_ROUTES[route as keyof typeof STORY_ROUTES].stopRoles[yes]).toEqual(roles.map((r) => `${route}.${r}`));
    }
  });

  it('Transformation：目標との差は「差」の役割に置き、「何を変えるか」は空のまま', () => {
    const map = active(routeQuestionMap(R({ desiredYes: 'FEASIBILITY', proofNeeds: ['TARGET_GAP'] }), 'ja', 'TRANSFORMATION'));
    expect(map.find((slide) => slide.routeRole === 'TRANSFORMATION.GAP')?.proofNeeds).toEqual(['TARGET_GAP']);
    expect(map.find((slide) => slide.routeRole === 'TRANSFORMATION.AMBITION')?.proofNeeds).toEqual([]);
  });
});

describe('レジストリの整合', () => {
  it('outlineRolesは、そのRouteに存在する役割だけを指す', () => {
    for (const id of STORY_ROUTE_IDS) {
      const def = STORY_ROUTES[id as keyof typeof STORY_ROUTES];
      const ids = new Set<string>(def.roles.map((role) => role.id));
      const mapped = 'outlineRoles' in def ? Object.values(def.outlineRoles as Record<string, string>) : [];
      for (const role of mapped) expect(ids.has(role), `${id}: ${role}`).toBe(true);
    }
  });
});

describe('ユーザーが名指しした役割は落とさない', () => {
  const named = (route: StoryRouteId, text: string, over: Partial<StoryReading> = {}) =>
    routeQuestionMap(R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE'], ...over }), 'ja', route, text);

  it('Urgency：遅れる影響と動ける期間を相談文で書けば、RECOGNITIONでも必須の問いとして残る', () => {
    const map = named('URGENCY', '遅れた場合の影響と、いつまでに動くべきかも示したい');
    for (const role of ['URGENCY.COST_OF_DELAY', 'URGENCY.WINDOW']) {
      expect(map.find((slide) => slide.routeRole === role)).toMatchObject({ questionPriority: 'REQUIRED' });
    }
    expect(map.find((slide) => slide.routeRole === 'URGENCY.WINDOW')?.presentationMode).toBe('TEXT');
    // 書いていなければ従来どおり停止位置で止まる
    expect(named('URGENCY', '現状を示したい').some((slide) => slide.routeRole === 'URGENCY.WINDOW')).toBe(false);
  });

  it('Transformation：担当・節目・意思決定と軌道修正を書けば残る。Proof：反対材料と次の検証も残る', () => {
    const t = named('TRANSFORMATION', '担当、節目、意思決定と軌道修正の方法を入れたい').map((slide) => slide.routeRole);
    expect(t).toEqual(expect.arrayContaining(['TRANSFORMATION.OWNERSHIP', 'TRANSFORMATION.MILESTONES', 'TRANSFORMATION.GOVERNANCE']));
    const p = named('PROOF', '反対材料と、次の検証も示したい').map((slide) => slide.routeRole);
    expect(p).toEqual(expect.arrayContaining(['PROOF.COUNTER_EVIDENCE', 'PROOF.EXPERIMENT']));
  });

  it('名指しした役割は「必要に応じて」ではなく必須。名指ししなければ従来の優先度', () => {
    const risks = (text: string) => named('ANSWER_FIRST', text, { desiredYes: 'COMMITMENT' }).find((slide) => slide.routeRole === 'ANSWER_FIRST.RISKS');
    expect(risks('リスクも示したい')?.questionPriority).toBe('REQUIRED');
    expect(risks('結論を示したい')?.questionPriority).toBe('CONDITIONAL');
  });

  it('前面には役割の質問を出し、チャート用の質問は出さない（Choice・Business Case）', () => {
    const choice = routeQuestionMap(R({ desiredYes: 'SELECTION', proofNeeds: ['SECOND_METRIC', 'RELATIONSHIP'] }), 'ja', 'CHOICE');
    expect(choice.find((slide) => slide.routeRole === 'CHOICE.CRITERIA')?.question).toBe('何を基準に比べるか');
    expect(choice.find((slide) => slide.routeRole === 'CHOICE.TRADE_OFFS')?.question).toBe('選択肢ごとの強み・弱みは何か');
    expect(choice.find((slide) => slide.routeRole === 'CHOICE.TRADE_OFFS')?.proofNeeds).toContain('RELATIONSHIP');
  });

  it('Business Case：前提は1枚だけ、補助の枠(Supporting)に置き、2組目は外した問い', () => {
    const map = routeQuestionMap(R({ desiredYes: 'COMMITMENT', proofNeeds: ['SECOND_METRIC', 'TARGET_GAP', 'RELATIONSHIP'] }), 'ja', 'BUSINESS_CASE');
    const assumptions = map.filter((slide) => slide.routeRole === 'BUSINESS_CASE.ASSUMPTIONS');
    expect(assumptions.filter((slide) => slide.questionPriority !== 'COACHING_ONLY')).toHaveLength(1);
    expect(assumptions[0]!.section).toBe('SUPPORTING');
  });
});
