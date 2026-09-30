import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, type StoryReading } from '@/registry';
import { planFromConsultation, type Plan } from '../start/plan';
import { scopeBlocksOneSlide, scopeOf } from './ScopeCard';

const story: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'],
  scopeCandidate: 'STORY_FLOW', routeSignals: ['PRIORITIZATION'], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};
const plan = (s: StoryReading | null): Plan => planFromConsultation({
  text: '相談', summary: '', question: '', classifier: 'ai', story: s,
  classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }),
});

describe('② の一番上：1枚か Story か', () => {
  it('Story のおすすめの間は、1枚の提案を出さない。「まず1枚に絞る」で1枚の提案に戻る', () => {
    const p = plan(story);
    expect(scopeOf(p).scope).toBe('STORY_FLOW');
    expect(scopeBlocksOneSlide(p)).toBe(true);
    const one = { ...p, scopeChoice: 'one' as const };
    expect(scopeOf(one)).toMatchObject({ scope: 'ONE_SLIDE_STORY', chosen: true });
    expect(scopeBlocksOneSlide(one)).toBe(false);
  });
  it('1枚のおすすめから「Story として組み立てる」を選べる。AI の読み取りが無ければ（ルール版）これまでどおり', () => {
    const p = plan({ ...story, desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE'], routeSignals: [] });
    expect(scopeOf(p).scope).toBe('ONE_SLIDE_STORY');
    expect(scopeOf({ ...p, scopeChoice: 'story' }).scope).toBe('STORY_FLOW');
    const rules = plan(null);
    expect(scopeOf(rules).scope).toBe('ONE_SLIDE_STORY');
    expect(scopeOf({ ...rules, scopeChoice: 'story' }).scope).toBe('ONE_SLIDE_STORY');
  });
});

describe('おすすめの理由の文', async () => {
  const { whyText } = await import('./ScopeCard');
  const { translate } = await import('@/i18n/ui');
  const t = (k: never, v?: Record<string, string | number>) => translate('ja', k, v);
  it('相談の言葉を入れた文にする（理由のコードを並べない）', () => {
    expect(whyText(t as never, 'ja', ['MANY_PROOFS', 'DEEP_YES'], ['市場全体の回復', '市場差'])).toBe('「市場全体の回復」「市場差」と、確かめたいことが複数あり、判断までつなげたいご相談です。1枚にまとめるより、Question を順に積み上げたほうが伝わりやすくなります。');
    expect(whyText(t as never, 'ja', ['DEEP_YES', 'AI_CANDIDATE'], [])).toMatch(/^事実だけでなく/);
    expect(whyText(t as never, 'ja', ['EXPLICIT_MULTIPLE'], ['x'])).toMatch(/^複数枚/);
  });
});
