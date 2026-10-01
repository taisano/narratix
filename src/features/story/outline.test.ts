import { describe, expect, it } from 'vitest';
import { STORY_TEMPLATES } from '@/registry';
import { outlineQuestionMap, readCriteria, readKpis, readOptions, readOutline } from './outline';
import { storyFromReading } from './questionMap';
import { projectOfStory, mergeProject } from './storyProject';
import { renameQuestion } from './storyOps';
import { viewOf } from '../editor/project';

const TEXT = '来週の経営会議で、モバイル会員プログラムの試験導入結果と次フェーズへの投資判断を説明したい。2025年の会員数は12万人で計画10万人を上回り、関連売上は8.4億円（計画7.5億円）、モバイルCVRは4.8%（前年4.2%）、顧客獲得単価は6,200円（前年6,800円）まで改善した。一方で、90日継続率は42%で目標45%未達、問い合わせ件数は前年より25%増えており、オンボーディングとサポート体制に課題がある。次フェーズの選択肢は、A：ネイティブアプリへ大型投資、B：LINEミニアプリを拡張、C：WebとLINEを組み合わせる案の3つ。投資額、立ち上がり速度、顧客リーチ、データ活用、運用難易度を比較し、私はC案を推したい。最初にExecutive Summaryを置き、KPIスコアカード、推移グラフ、選択肢の比較表、課題と示唆、最後に担当・期限付きの次のアクションを置く、6〜7枚程度のStoryにしたい。表と言葉のスライドを積極的に使いたい。';

describe('相談文のスライドの並び', () => {
  it('見せ方の名前を現れた順に読む（課題と示唆のアクションを次のアクションと読まない）', () => {
    expect(readOutline(TEXT)).toEqual(['STORY_TEXT_EXECUTIVE_SUMMARY', 'STORY_TABLE_KPI', 'GRAPH_TREND', 'STORY_TABLE_COMPARISON', 'STORY_TEXT_ISSUE_INSIGHT_ACTION', 'STORY_TEXT_NEXT_ACTIONS']);
    expect(readOutline('売上の推移を見せたい')).toBeNull();
  });
  it('数字を KPI の下書きに（期間・比較基準・小さいほど良い）', () => {
    const ks = readKpis(TEXT).map((k) => [k.name, k.value, k.unit, k.compare, k.basis, k.period, k.good]);
    expect(ks).toEqual([
      ['会員数', '12', '万人', '10', '計画', '2025年', 'up'],
      ['関連売上', '8.4', '億円', '7.5', '計画', '2025年', 'up'],
      ['モバイルCVR', '4.8%', '', '4.2%', '前年', '2025年', 'up'],
      ['顧客獲得単価', '6,200', '円', '6,800', '前年', '2025年', 'down'],
      ['90日継続率', '42%', '', '45%', '目標', '2025年', 'up'],
    ]);
  });
  it('選択肢と比較項目を比較表の見出しに。推している案を強調', () => {
    expect(readOptions(TEXT).map((o) => o.id)).toEqual(['A', 'B', 'C']);
    expect(readCriteria(TEXT)).toEqual(['投資額', '立ち上がり速度', '顧客リーチ', 'データ活用', '運用難易度']);
    const qs = outlineQuestionMap(TEXT, readOutline(TEXT)!, 'ja');
    const cmp = qs[3]!;
    expect(cmp.seed!.content.comparison!.cells[0]).toEqual(['比較項目', 'A：ネイティブアプリへ大型投資', 'B：LINEミニアプリを拡張', 'C：WebとLINEを組み合わせる案']);
    expect(cmp.seed!.look!.comparison!.emphasis).toEqual({ kind: 'col', index: 3 });
  });
  it('ストーリーをその並びで作り、各スライドをその型で始める。Executive Summary を有効に', () => {
    const story = storyFromReading(TEXT, { decisionQuestion: null, desiredYes: 'SELECTION', primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE'], scopeCandidate: 'STORY_FLOW', routeSignals: [], outcomeDirection: 'MIXED' as never, explicitSize: 'MULTIPLE', confidence: 0.8 }, 'ja');
    expect(story.executiveSummary.enabled).toBe(true);
    const p = projectOfStory(story, 'ja');
    expect(p.slides.map((s) => s.view ?? 'graph')).toEqual(['STORY_TEXT_EXECUTIVE_SUMMARY', 'STORY_TABLE_KPI', 'graph', 'STORY_TABLE_COMPARISON', 'STORY_TEXT_ISSUE_INSIGHT_ACTION', 'STORY_TEXT_NEXT_ACTIONS']);
    expect(viewOf(p, 1).content!.kpi!.kpis[0]).toMatchObject({ name: '会員数', value: '12' });
    expect(viewOf(p, 1).content!.kpi!.fromConsultation).toBe(true);
    expect(story.slides[1]!.question).toBe(STORY_TEMPLATES.STORY_TABLE_KPI.question.ja);
  });
  it('見せ方を替えたら問いも替える。自分で書き換えた問いは替えない', () => {
    const story = storyFromReading(TEXT, { decisionQuestion: null, desiredYes: 'SELECTION', primaryBarrier: null, proofNeeds: [], scopeCandidate: 'STORY_FLOW', routeSignals: [], outcomeDirection: 'MIXED' as never, explicitSize: 'MULTIPLE', confidence: 0.8 }, 'ja');
    const p = projectOfStory(story, 'ja');
    const p2 = { ...p, slides: p.slides.map((s, i) => (i === 3 ? { ...s, view: 'STORY_TEXT_TWO_COLUMN' as const } : s)) };
    expect(mergeProject(story, p2, 'ja').slides[3]!.question).toBe(STORY_TEMPLATES.STORY_TEXT_TWO_COLUMN.question.ja);
    // 元に戻せば元の問い
    expect(mergeProject(story, p, 'ja').slides[3]!.question).toBe(STORY_TEMPLATES.STORY_TABLE_COMPARISON.question.ja);
    const edited = renameQuestion(mergeProject(story, p, 'ja'), story.slides[3]!.id, '3案のどれを選ぶか');
    expect(mergeProject(edited, p2, 'ja').slides[3]!.question).toBe('3案のどれを選ぶか');
  });
});
