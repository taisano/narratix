import { describe, expect, it } from 'vitest';
import { ConsultationClassificationSchema, type StoryReading } from '@/registry';
import { planFromConsultation, type Plan } from '../start/plan';
import { canSwitchToStory, scopeBlocksOneSlide, scopeOf } from './ScopeCard';

const story: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'],
  scopeCandidate: 'STORY_FLOW', routeSignals: ['PRIORITIZATION'], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
};
const plan = (s: StoryReading | null): Plan => planFromConsultation({
  text: '相談', summary: '', question: '', classifier: 'ai', story: s,
  classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }),
});

describe('② の一番上：1枚か Story か', () => {
  it('Story のおすすめの間は、1枚の提案を出さない。1枚を選ぶとすぐ1枚の提案', () => {
    const p = plan(story);
    expect(scopeOf(p).scope).toBe('STORY_FLOW');
    expect(scopeBlocksOneSlide(p)).toBe(true);
    const one = { ...p, scopeChoice: 'one' as const };
    expect(scopeOf(one)).toMatchObject({ scope: 'ONE_SLIDE_STORY', chosen: true });
    // 選ぶ段は挟まない（問いは ① のカードで替える）
    expect(scopeBlocksOneSlide(one)).toBe(false);
  });
  it('Story を使えるかは、渡されたプランの判定に従う（free 固定にしない）。使えない時は、Story を選び直しても1枚のまま', () => {
    const p = plan(story);
    expect(scopeOf(p, true).scope).toBe('STORY_FLOW');
    expect(scopeOf(p, false)).toMatchObject({ scope: 'ONE_SLIDE_STORY', reasons: ['PLAN'] });
    expect(scopeOf({ ...p, scopeChoice: 'story' }, false).scope).toBe('STORY_FLOW');
    expect(scopeBlocksOneSlide(p, false)).toBe(false);
    expect(canSwitchToStory(p, true)).toBe(true);
    expect(canSwitchToStory(p, false)).toBe(false);
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
    expect(whyText(t as never, 'ja', ['MANY_PROOFS', 'DEEP_YES'], ['市場全体の回復', '市場差'])).toBe('「市場全体の回復」「市場差」と、確かめたいことが複数あり、判断までつなげたいご相談です。1枚にまとめるより、問いを順に積み上げたほうが伝わりやすくなります。');
    expect(whyText(t as never, 'ja', ['DEEP_YES', 'AI_CANDIDATE'], [])).toMatch(/^事実だけでなく/);
    expect(whyText(t as never, 'ja', ['EXPLICIT_MULTIPLE'], ['x'])).toMatch(/^複数枚/);
  });
});

describe('このStoryを1枚にまとめる（Coach の問いで1枚 → ① で替えられる → ストーリーに戻れる）', async () => {
  const { draftOf, startOnePick } = await import('./ScopeCard');
  const { backToStory, coachPick, oneSlideCandidates, planFromQuestion } = await import('./oneSlide');
  const reading: StoryReading = { ...story, proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'RANKING'] };
  const p0 = (goal: 'TREND' | 'COMPARISON') => planFromConsultation({
    text: '相談', summary: '', question: '', classifier: 'ai', story: reading,
    classification: ConsultationClassificationSchema.parse({ primary_goal: goal }),
  });
  it('押すと選ぶ段を挟まず、Coach の問いで1枚の提案を出す。候補は示すことがある問いだけ', () => {
    const p = startOnePick(p0('COMPARISON'), 'ja');
    expect(p.oneFrom).toBeTruthy();
    expect(scopeBlocksOneSlide(p)).toBe(false);
    const d = draftOf(p, 'ja')!;
    expect(oneSlideCandidates(d).map((s) => s.routeRole)).not.toContain('AIMED.DECISION');
  });
  it('Coach の初期選択は、最初の相談の目的に合う問い', () => {
    const d = draftOf(p0('COMPARISON'), 'ja')!;
    const pick = d.slides.find((s) => s.id === coachPick(p0('COMPARISON'), d))!;
    expect(pick.proofNeeds).toContain('SEGMENT_DIFFERENCE');
    expect(d.slides.find((s) => s.id === coachPick(p0('TREND'), d))!.proofNeeds).toEqual(['OVERALL_CHANGE']);
  });
  it('選んだ問いの料理で1枚の提案。ストーリーに戻ると整えた問いと元の切り口に戻る', () => {
    const base = { ...p0('TREND'), scopeChoice: 'one' as const };
    const d = draftOf(base, 'ja')!;
    const slide = d.slides.find((s) => s.proofNeeds.includes('SEGMENT_DIFFERENCE'))!;
    const one = planFromQuestion({ ...base, storyDraft: d }, slide);
    expect(one.angles).toHaveLength(1);
    expect(one.angles[0]).toMatchObject({ purpose: 'comparison', emphasis: 'gap', coachEmphasis: 'gap' });
    const back = backToStory(one);
    expect(back.scopeChoice).toBeUndefined();
    expect(back.angles).toEqual(base.angles);
    expect(back.storyDraft).toBe(d);
  });
});

describe('1枚の流れで出し直した時は、1枚のまま', async () => {
  const { inOneSlideFlow, keepOneSlide } = await import('./ScopeCard');
  const mk = (s: StoryReading | null) => planFromConsultation({ text: '相談', summary: '', question: '', classifier: 'ai', story: s, classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }) });
  it('1枚の流れ：まずは1枚だけ作る／最初から1枚／ルール版。ストーリーのおすすめ・確認の途中は違う', () => {
    expect(inOneSlideFlow({ ...mk(story), scopeChoice: 'one' })).toBe(true);
    expect(inOneSlideFlow(mk({ ...story, desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE'], routeSignals: [] }))).toBe(true);
    expect(inOneSlideFlow(mk(null))).toBe(true);
    expect(inOneSlideFlow(mk(story))).toBe(false);
    expect(inOneSlideFlow({ ...mk(story), scopeChoice: 'story' })).toBe(false);
  });
  it('出し直した新しい提案がストーリー向きでも、問いを選ばずに1枚の提案を出す', () => {
    const next = keepOneSlide(mk(story));
    expect(scopeOf(next).scope).toBe('ONE_SLIDE_STORY');
    expect(scopeBlocksOneSlide(next)).toBe(false);
    expect(next.storyDraft).toBeNull();
    // 自分でストーリーに戻ることはできる
    expect(scopeOf({ ...next, scopeChoice: 'story', oneKept: undefined }).scope).toBe('STORY_FLOW');
  });
});

describe('このStoryを1枚にまとめる：選んだ問いが保たれる（不具合の再発防止）', async () => {
  const { draftOf, startOnePick } = await import('./ScopeCard');
  const { coachPick, oneSlideCandidates } = await import('./oneSlide');
  it('押した時に下書きを残すので、描き直しても問いの id が変わらず、Coach の問いもほかの問いも有効', () => {
    const p0 = planFromConsultation({ text: '相談', summary: '', question: '', classifier: 'ai', story, classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }) });
    const p = startOnePick(p0, 'ja');
    const d1 = draftOf(p, 'ja')!, d2 = draftOf(p, 'ja')!;
    expect(d1.slides.map((s) => s.id)).toEqual(d2.slides.map((s) => s.id));
    expect(d1.slides.some((s) => s.id === p.oneFrom?.slideId)).toBe(true);
    expect(coachPick(p, d2)).toBe(p.oneFrom?.slideId);
    expect(oneSlideCandidates(d1).some((s) => s.id !== p.oneFrom?.slideId)).toBe(true);
  });
});

describe('データパックの設計は、下書きを作り直しても失わない', async () => {
  const { draftOf, keepOneSlide } = await import('./ScopeCard');
  const { withoutStoryDraft } = await import('../start/plan');
  const { applyCreationMode } = await import('./creationMode');
  const { emptyDataPackPlan } = await import('./dataPackPlan');
  const mk = () => planFromConsultation({ text: '相談', summary: '', question: '', classifier: 'ai', story, classification: ConsultationClassificationSchema.parse({ primary_goal: 'TREND' }) });
  const withPack = () => {
    const p = mk();
    const d = draftOf(p, 'ja')!;
    const pack = { ...emptyDataPackPlan(), overview: { include: { consultation: true } } };
    return { pack, plan: { ...p, storyDraft: { ...d, dataPackPlan: pack } } };
  };
  it('「選び直し」で下書きを捨てても、読み取りから作り直した下書きに戻る', () => {
    const { pack, plan } = withPack();
    const reset = withoutStoryDraft(plan);
    expect(reset.storyDraft).toBeNull();
    expect(draftOf(reset, 'ja')!.dataPackPlan).toEqual(pack);
    // 2回続けて捨てても失わない
    expect(draftOf(withoutStoryDraft(reset), 'ja')!.dataPackPlan).toEqual(pack);
  });
  it('入口の切り替え・1枚に絞る時も持ち越す。計画が無ければ何も足さない', () => {
    const { pack, plan } = withPack();
    expect(draftOf(keepOneSlide(plan), 'ja')!.dataPackPlan).toEqual(pack);
    expect(draftOf(applyCreationMode(plan, 'STORY', 'ja', true), 'ja')!.dataPackPlan).toEqual(pack);
    expect('dataPackPlan' in draftOf(mk(), 'ja')!).toBe(false);
  });
});
