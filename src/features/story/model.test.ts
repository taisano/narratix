import { addExecSummary } from './storyOps';
import { describe, expect, it } from 'vitest';
import { AIMED_ROLES, PROOF_NEED_IDS } from '@/registry';
import { initialProject } from '../editor/project';
import { emptySlide, mainCount, newStory, normalizeStory, overSoftMax, storyDisplayTitle, storyProgress } from './model';

const data = initialProject().dataset;

describe('Story の保存形式', () => {
  it('新しい Story は AIMED・Story として組み立てる・スライドなし', () => {
    const s = newStory('ja');
    expect(s).toMatchObject({ version: 1, primaryRoute: 'AIMED', scope: 'STORY_FLOW', slides: [], datasets: [] });
    expect(normalizeStory(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('保存したものを読み戻せる（Dataset・スライド・グラフの中身・言葉の中身）', () => {
    const visual = initialProject().slides[0]!;
    const s = newStory('ja', {
      title: 'インバウンド', decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION', routeConfidence: 0.89,
      datasets: [{ id: 'd1', label: '訪日客数', data, source: 'JNTO' }],
      slides: [
        emptySlide({
          id: 'q1', routeRole: 'AIMED.IMPACT', question: '市場全体はどこまで回復したか', proofNeeds: ['OVERALL_CHANGE'], datasetRefs: ['d1'], visual,
          referenceRecipes: ['TREND_LINE'], status: 'DONE',
          personalization: { explanation: '訪日客数の全体像を確かめます。', confidence: 'confirmed', requiredDataHints: ['期間別の訪日客数'], sourceTerms: ['訪日客数'] },
        }),
        emptySlide({ id: 'q2', presentationMode: 'TEXT', textContent: { template: 'NEXT_ACTION', fields: { action: '' } } }),
      ],
      current: 1,
    });
    expect(normalizeStory(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('古い保存データはそのまま読み、新しい具体化は不正な項目を安全に除く', () => {
    const old = newStory('ja', { slides: [emptySlide({ id: 'old' })] });
    expect(normalizeStory(JSON.parse(JSON.stringify(old)))!.slides[0]!.personalization).toBeUndefined();
    const raw = JSON.parse(JSON.stringify(old));
    raw.slides[0].personalization = {
      explanation: '  地域別の差を確かめます。  ', confidence: 'invalid', requiredDataHints: ['地域別売上', 2, '', '地域別売上'],
      unresolvedQuestion: 4, sourceTerms: ['地域', null],
    };
    expect(normalizeStory(raw)!.slides[0]!.personalization).toEqual({
      explanation: '地域別の差を確かめます。', confidence: 'unknown', requiredDataHints: ['地域別売上'], sourceTerms: ['地域'],
    });
  });
  it('壊れた値は外すか既定に戻し、読めるところは読む（データは消さない）', () => {
    const s = normalizeStory({
      version: 1, scope: 'X', primaryRoute: 'NOPE', desiredYes: 'MAYBE', routeConfidence: 3, current: 99,
      datasets: [{ id: 'd1', label: 'A', data, source: '' }, { id: 'bad' }],
      slides: [{ id: 'q1', proofNeeds: ['OVERALL_CHANGE', 'CAUSE'], datasetRefs: ['d1', 'gone'], referenceRecipes: ['TREND_LINE', 'X'], visual: { chart: 'nope' }, status: '??' }, { nope: 1 }],
    })!;
    expect(s).toMatchObject({ scope: 'STORY_FLOW', primaryRoute: 'AIMED', desiredYes: null, routeConfidence: null, current: 0 });
    expect(s.datasets.map((d) => d.id)).toEqual(['d1']);
    expect(s.slides).toHaveLength(1);
    expect(s.slides[0]).toMatchObject({ proofNeeds: ['OVERALL_CHANGE'], datasetRefs: ['d1'], referenceRecipes: ['TREND_LINE'], visual: null, status: 'NOT_STARTED' });
    expect(normalizeStory({ version: 2 })).toBeNull();
    expect(normalizeStory(null)).toBeNull();
  });
  it('Main Story の枚数：Supporting・Appendix・確認事項は数えず、Executive Summary は足した時だけ数える', () => {
    const s = newStory('ja', {
      slides: [emptySlide(), emptySlide(), emptySlide({ section: 'APPENDIX' }), emptySlide({ section: 'SUPPORTING' }), emptySlide({ questionPriority: 'COACHING_ONLY' })],
    });
    expect(mainCount(s)).toBe(2);
    // Executive Summary はメインのスライドとして足すので、足せば1枚増える（印だけでは数えない）
    const { story: withEs } = addExecSummary(s, 'ja');
    expect(mainCount(withEs)).toBe(3);
    expect(mainCount({ ...s, executiveSummary: { ...s.executiveSummary, enabled: true } })).toBe(2);
    expect(overSoftMax(newStory('ja', { slides: Array.from({ length: 11 }, () => emptySlide()) }))).toBe(true);
    expect(overSoftMax(newStory('ja', { slides: Array.from({ length: 10 }, () => emptySlide()) }))).toBe(false);
  });
  it('一覧の名前と進み具合', () => {
    const s = newStory('ja', { slides: [emptySlide({ question: '全体は', status: 'DONE' }), emptySlide({ status: 'IN_PROGRESS' }), emptySlide({ questionPriority: 'COACHING_ONLY' })] });
    expect(storyDisplayTitle(s)).toBe('全体は');
    expect(storyDisplayTitle({ ...s, decisionQuestion: 'どこを優先するか' })).toBe('どこを優先するか');
    expect(storyDisplayTitle({ ...s, title: '名前' })).toBe('名前');
    expect(storyProgress(s)).toEqual({ done: 1, inProgress: 1, total: 2 });
  });
  it('AIMED の役割：Anchor は設定だけ、Decision は独立スライドを強制しない。proof_needs は共通語彙', () => {
    expect(AIMED_ROLES.map((r) => r.id)).toEqual(['AIMED.ANCHOR', 'AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION', 'AIMED.DECISION']);
    expect(AIMED_ROLES.find((r) => r.id === 'AIMED.ANCHOR')!.settingOnly).toBe(true);
    expect(AIMED_ROLES.find((r) => r.id === 'AIMED.DECISION')!.noForcedSlide).toBe(true);
    expect(AIMED_ROLES.find((r) => r.id === 'AIMED.EXPLANATION')!.priority).toBe('CONDITIONAL');
    for (const r of AIMED_ROLES) for (const p of r.proofNeeds) expect(PROOF_NEED_IDS).toContain(p);
  });
});
