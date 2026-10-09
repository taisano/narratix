import { describe, expect, it } from 'vitest';
import { EXEC_SUMMARY_ROLE, type StoryReading } from '@/registry';
import { initialProject } from '../editor/project';
import { emptySlide, newStory } from './model';
import { candidateNeeds, storyFromReading } from './questionMap';
import {
  addQuestion, toggleNeed, canMergeWithNext, canSplit, mergeWithNext, moveQuestion, removeQuestion, renameQuestion, setCoachingOnly, setSection,
  sizeAdvice, splitQuestion, unusedNeeds,
} from './storyOps';

const R: StoryReading = {
  decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'], scopeCandidate: 'STORY_FLOW',
  routeSignals: [], outcomeDirection: 'MIXED', explicitSize: null, confidence: 0.9,
  personalizations: [{
    target: 'OVERALL_CHANGE', explanation: '市場全体の変化を確かめます。', confidence: 'proposed',
    requiredDataHints: ['期間別の市場全体値'],
  }],
};
// Executive Summary は自動で足される（最後）。AIMED の地図の並びを確かめるテストでは外して見る
const noExec = <T extends { slides: { routeRole: string | null }[] }>(s: T): T => ({ ...s, slides: s.slides.filter((q) => q.routeRole !== 'STORY.EXECUTIVE_SUMMARY') });
const base = () => noExec(storyFromReading('相談', R, 'ja'));
const q = (s: ReturnType<typeof base>) => s.slides.map((x) => x.question);

describe('Question Map の編集（規則。AI は使わない）', () => {
  it('並べ替えると、次の Question もつなぎ直す', () => {
    const s = base();
    const m = moveQuestion(s, s.slides[1]!.id, -1);
    expect(q(m).slice(0, 2)).toEqual([q(s)[1], q(s)[0]]);
    expect(m.slides[0]!.nextQuestion).toBe(q(s)[0]);
    expect(moveQuestion(s, s.slides[0]!.id, -1)).toBe(s);
    expect(m.slides.find((x) => x.id === s.slides[0]!.id)!.personalization).toEqual(s.slides[0]!.personalization);
  });
  it('Appendix へ移す・スライドにしない：次の Question の並びから外れる。戻すと役割の優先度に戻る', () => {
    const s = base();
    const a = setSection(s, s.slides[1]!.id, 'APPENDIX');
    expect(a.slides[0]!.nextQuestion).toBe(q(s)[2]);
    expect(a.slides[1]!.nextQuestion).toBe('');
    const c = setCoachingOnly(s, s.slides[2]!.id, true);
    expect(c.slides[2]!.questionPriority).toBe('COACHING_ONLY');
    expect(c.slides[1]!.nextQuestion).toBe(q(s)[3]);
    expect(setCoachingOnly(c, s.slides[2]!.id, false).slides[2]!.questionPriority).toBe('CONDITIONAL');
    expect(setSection(s, s.slides[0]!.id, 'APPENDIX').slides[0]!.personalization).toEqual(s.slides[0]!.personalization);
  });
  it('Question を足す：同じ役割の後ろ（判断の前）に、料理の表から参考のレシピ付きで', () => {
    const s = addQuestion(base(), ['RANKING'], 'ja');
    expect(s.slides.map((x) => x.routeRole)).toEqual(['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION']);
    expect(s.slides[2]).toMatchObject({ proofNeeds: ['RANKING'], question: 'どこが最も大きいか' });
    expect(s.slides[2]!.referenceRecipes[0]).toBe('COMP_RANK');
    expect(unusedNeeds(s).map((x) => x.need)).not.toContain('RANKING');
  });
  it('1枚にまとめられる組なら統合、まとめたものは分割できる（どちらもまだ空の時だけ）', () => {
    let s = addQuestion(base(), ['RANKING'], 'ja'); // 差（SEGMENT_DIFFERENCE）の次に順位
    const id = s.slides[1]!.id;
    expect(canMergeWithNext(s, id)).toBe(true);
    s = mergeWithNext(s, id, 'ja');
    expect(s.slides[1]).toMatchObject({ proofNeeds: ['SEGMENT_DIFFERENCE', 'RANKING'], question: 'どの項目が異なるか／どこが最も大きいか' });
    expect(s.slides[1]!.referenceRecipes[0]).toBe('COMP_RANK_DELTA');
    expect(canSplit(s.slides[1]!)).toBe(true);
    s = splitQuestion(s, id, 'ja');
    expect(s.slides.slice(1, 3).map((x) => x.proofNeeds)).toEqual([['SEGMENT_DIFFERENCE'], ['RANKING']]);
    // 全体と差は1枚にまとめない
    expect(canMergeWithNext(base(), base().slides[0]!.id)).toBe(false);
  });
  it('データや Message が入った Question は、統合・分割しない（黙って消さない）', () => {
    let s = addQuestion(base(), ['RANKING'], 'ja');
    s = { ...s, slides: s.slides.map((x, i) => (i === 1 ? { ...x, userAuthoredMessage: '中国の回復が遅い' } : x)) };
    expect(canMergeWithNext(s, s.slides[1]!.id)).toBe(false);
    const withVisual = { ...emptySlide({ proofNeeds: ['OVERALL_CHANGE', 'CONTRIBUTION'] }), visual: initialProject().slides[0]! };
    expect(canSplit(withVisual)).toBe(false);
  });
  it('名前を変える・外す', () => {
    const s = base();
    const renamed = renameQuestion(s, s.slides[0]!.id, '市場全体はどこまで回復したか').slides[0]!;
    expect(renamed.question).toBe('市場全体はどこまで回復したか');
    expect(renamed).toMatchObject({ questionEdited: true, personalization: s.slides[0]!.personalization });
    expect(removeQuestion(s, s.slides[0]!.id).slides).toHaveLength(s.slides.length - 1);
  });
  it('意味が変わる統合・分割・問いの除去では、古い具体化を引き継がない', () => {
    let s = addQuestion(base(), ['GROWTH_SPEED'], 'ja');
    const id = s.slides[0]!.id;
    expect(s.slides[0]!.personalization).toBeTruthy();
    expect(canMergeWithNext(s, id)).toBe(true);
    s = mergeWithNext(s, id, 'ja');
    expect(s.slides[0]!.personalization).toBeUndefined();
    s = { ...s, slides: s.slides.map((x, i) => i === 0 ? { ...x, personalization: R.personalizations![0] } : x) };
    expect(splitQuestion(s, id, 'ja').slides.slice(0, 2).every((x) => !x.personalization)).toBe(true);
  });
  it('枚数の目安：1〜2枚は少ない（増やさない）、3〜8は理想、9〜10は多め、11〜は超えた', () => {
    const n = (k: number) => sizeAdvice(newStory('ja', { slides: Array.from({ length: k }, () => emptySlide()) })).level;
    expect([n(2), n(3), n(8), n(9), n(10), n(11)]).toEqual(['few', 'ideal', 'ideal', 'many', 'many', 'over']);
  });
  it('選び直しの候補：14の proof_needs を役割の順に。相談から読み取ったものに印', () => {
    const c = candidateNeeds(R);
    expect(c).toHaveLength(14);
    expect(c.filter((x) => x.suggested).map((x) => x.need)).toEqual(['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC']);
    expect(c.find((x) => x.need === 'SECOND_METRIC')!.role).toBe('AIMED.EXPLANATION');
    const chosen = storyFromReading('相談', R, 'ja', ['OVERALL_CHANGE', 'RANKING']);
    // 最後は自動で足した Executive Summary
    expect(chosen.slides.map((x) => x.proofNeeds)).toEqual([['OVERALL_CHANGE'], ['RANKING'], [], [], []]);
    expect(chosen.slides.at(-1)!.routeRole).toBe('STORY.EXECUTIVE_SUMMARY');
  });
});

describe('問いの選び直し（② と Story の画面で共通）', () => {
  it('入っていれば外し、無ければ足す。まとめた Question からはその問いだけを抜く', () => {
    let s = addQuestion(base(), ['RANKING'], 'ja');
    s = mergeWithNext(s, s.slides[1]!.id, 'ja');

    const t1 = toggleNeed(s, 'RANKING', 'ja');
    expect(t1.slides[1]).toMatchObject({ proofNeeds: ['SEGMENT_DIFFERENCE'], question: 'どの項目が異なるか' });
    const t2 = toggleNeed(t1, 'OVERALL_CHANGE', 'ja');
    expect(t2.slides.some((x) => x.proofNeeds.includes('OVERALL_CHANGE'))).toBe(false);
    expect(toggleNeed(t2, 'OVERALL_CHANGE', 'ja').slides[0]!.proofNeeds).toEqual(['OVERALL_CHANGE']);
  });
  it('中身が入った Question の問いは外さない', async () => {
    const { canRemoveNeed, removeNeed } = await import('./storyOps');
    const s0 = base();
    const s = { ...s0, slides: s0.slides.map((x, i) => (i === 0 ? { ...x, userAuthoredMessage: '回復した' } : x)) };
    expect(canRemoveNeed(s, 'OVERALL_CHANGE')).toBe(false);
    expect(removeNeed(s, 'OVERALL_CHANGE', 'ja')).toBe(s);
  });
});

describe('外す・戻す（スライドにしない確認事項）と、見せ方の例', async () => {
  const ops = await import('./storyOps');
  const { examplesOf } = await import('./questionMap');
  it('外した Question は並べ替え・まとめの相手にならず、問いを選び直すと元の位置のまま戻る', () => {
    let s = base();
    const first = s.slides[0]!.id;
    s = ops.setCoachingOnly(s, first, true);
    expect(ops.groupOf(s.slides[0]!)).toBe('OUT');
    expect(ops.neighbor(s, s.slides[1]!.id, -1)).toBe(-1);
    expect(ops.activeNeeds(s).has('OVERALL_CHANGE')).toBe(false);
    const back = ops.toggleNeed(s, 'OVERALL_CHANGE', 'ja');
    expect(back.slides[0]!.id).toBe(first);
    expect(back.slides[0]!.questionPriority).toBe('REQUIRED');
    expect(back.slides).toHaveLength(s.slides.length);
  });
  it('Appendix は Supporting Evidence とまとめて1つの組', () => {
    const s = base();
    const a = ops.setSection(s, s.slides[1]!.id, 'SUPPORTING');
    expect(ops.groupOf(a.slides[1]!)).toBe('APPENDIX');
  });
  it('見せ方の例：グラフの例が無い判断の Question は、言葉の例', () => {
    const s = base();
    expect(examplesOf(s.slides[0]!, 'ja').every((x) => x.mode === 'graph')).toBe(true);
    expect(examplesOf(s.slides[3]!, 'ja')).toEqual([{ label: '次のアクション', mode: 'text' }, { label: '結論＋3つの根拠', mode: 'text' }]);
  });
});

describe('枚数の目安：Executive Summaryは数えない', () => {
  it('Mainが9枚でも、うちExecutive Summaryが1枚なら理想の範囲', () => {
    const slides = [...Array.from({ length: 8 }, () => emptySlide()), emptySlide({ routeRole: EXEC_SUMMARY_ROLE })];
    expect(sizeAdvice(newStory('ja', { slides }))).toMatchObject({ main: 8, level: 'ideal' });
  });
});
