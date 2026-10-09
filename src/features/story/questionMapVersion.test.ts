import { describe, expect, it } from 'vitest';
import { CURRENT_QUESTION_MAP_VERSION, EXEC_SUMMARY_ROLE, routeRoleDef, localize, type QuestionMapVersion, type StoryReading, type StoryRouteId } from '@/registry';
import { emptySlide, newStory, normalizeStory, type StoryState } from './model';
import { aimedQuestionMap, questionFor, questionOf, roleOrdinal, routeQuestionMap, storyFromReading, supportLineFor, usesRoleQuestion } from './questionMap';
import { addQuestion, mergeWithNext, moveQuestion, removeNeed, renameQuestion, setCoachingOnly, splitQuestion, toggleNeed, upgradeQuestionMap } from './storyOps';
import { mergeProject, projectOfStory } from './storyProject';

const R = (over: Partial<StoryReading> = {}): StoryReading => ({
  decisionQuestion: '市場の回復をどう見るか', desiredYes: 'INTERPRETATION', primaryBarrier: null,
  proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'CONTRIBUTION'], scopeCandidate: 'STORY_FLOW', routeSignals: [], outcomeDirection: 'MIXED',
  explicitSize: null, confidence: 0.9, ...over,
});
const noExec = (s: StoryState): StoryState => ({ ...s, slides: s.slides.filter((x) => x.routeRole !== EXEC_SUMMARY_ROLE) });
const v2 = (reading = R()): StoryState => noExec(storyFromReading('相談', reading, 'ja'));
/** 版1のStory：版2で作ったものの版だけを替えるのではなく、版1の規則で問いも作り直す（導入前に保存されたStoryと同じ形） */
const legacy = (s: StoryState, reading: StoryReading = R()): StoryState => ({
  ...s, questionMapVersion: 1,
  slides: s.slides.map((x) => x.proofNeeds.length && x.routeRole && !x.questionEdited ? { ...x, question: questionOf(x.proofNeeds, 'ja', { route: s.primaryRoute, outcomeDirection: reading.outcomeDirection }) } : x),
});

/** 版1の保存例：questionMapVersion が無い（導入前に保存したAIMED Story） */
const OLD_SAVED = () => {
  const { questionMapVersion: _v, ...json } = JSON.parse(JSON.stringify(aimedStory())) as Record<string, unknown>;
  return { json };
};
const aimedStory = () => {
  const slides = aimedQuestionMap(R(), 'ja');
  return newStory('ja', { consultation: '相談', slides, primaryRoute: 'AIMED', questionMapVersion: 1 });
};

describe('保存形式と後方互換', () => {
  it('newStory() は現在仕様(版2)。旧形式が必要なテストは版1を明示する', () => {
    expect(newStory('ja').questionMapVersion).toBe(CURRENT_QUESTION_MAP_VERSION);
    expect(CURRENT_QUESTION_MAP_VERSION).toBe(2);
  });

  it('フィールドなしの保存データは版1として開き、問い・並び・idを一切変えない', () => {
    const saved = aimedStory();
    const { questionMapVersion: _drop, ...json } = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    const opened = normalizeStory(json)!;
    expect(opened.questionMapVersion).toBe(1);
    expect(opened.slides.map((x) => [x.id, x.routeRole, x.question, x.proofNeeds])).toEqual(saved.slides.map((x) => [x.id, x.routeRole, x.question, x.proofNeeds]));
    // 開いて保存し直しても版1のまま
    expect(normalizeStory(JSON.parse(JSON.stringify(opened)))!.questionMapVersion).toBe(1);
  });

  it('不正な値は版1、版2はそのまま読む', () => {
    for (const bad of [0, 3, '2', null, undefined, true, {}]) expect(normalizeStory({ ...aimedStory(), questionMapVersion: bad })!.questionMapVersion).toBe(1);
    expect(normalizeStory({ ...aimedStory(), questionMapVersion: 2 })!.questionMapVersion).toBe(2);
    expect(normalizeStory(JSON.parse(JSON.stringify(v2())))!.questionMapVersion).toBe(2);
  });

  it('旧AIMED Storyは、開いたあと編集しても従来のQuestionの作り方のまま（役割の問いに変わらない）', () => {
    const { json } = OLD_SAVED();
    let s = normalizeStory(json)!;
    const before = s.slides.map((x) => x.question);
    s = addQuestion(s, ['RANKING'], 'ja');
    s = moveQuestion(s, s.slides[0]!.id, 1);
    // 既存の問いは文のまま
    for (const q of before) expect(s.slides.some((x) => x.question === q)).toBe(true);
    for (const slide of s.slides) {
      if (slide.proofNeeds.length) expect(slide.question).toBe(questionOf(slide.proofNeeds, 'ja', { route: 'AIMED', outcomeDirection: s.outcomeDirection }));
    }
    expect(s.questionMapVersion).toBe(1);
  });
});

describe('新規AIMED（版2）の生成', () => {
  it('版2で、役割の問いを前面に出し、proof_needsは保持する。枚数は固定しない', () => {
    const s = v2();
    expect(s.questionMapVersion).toBe(2);
    expect(s.slides.map((x) => [x.routeRole, x.question])).toEqual([
      ['AIMED.IMPACT', '全体として何が起きているか'],
      ['AIMED.MISMATCH', '全体の裏にどんな差・例外があるか'],
      ['AIMED.EXPLANATION', '違いをどこまで説明できるか'],
      ['AIMED.DECISION', '次に何を判断・確認するか'],
    ]);
    expect(s.slides.map((x) => x.proofNeeds)).toEqual([['OVERALL_CHANGE'], ['SEGMENT_DIFFERENCE'], ['CONTRIBUTION'], []]);
    expect(s.slides[2]!.referenceRecipes.length).toBeGreaterThan(0);
    // 事実の認識までなら説明には広げない（従来の停止規則のまま）
    const rec = noExec(storyFromReading('相談', R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'] }), 'ja'));
    expect(rec.slides.map((x) => x.routeRole)).toEqual(['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.DECISION']);
  });

  it('相談文で「要因・背景」を名指しすれば、説明は必須で残る', () => {
    const story = noExec(storyFromReading('背景の要因も説明したい', R({ desiredYes: 'RECOGNITION', proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE'] }), 'ja'));
    expect(story.slides.find((x) => x.routeRole === 'AIMED.EXPLANATION')).toMatchObject({ questionPriority: 'REQUIRED' });
  });

  it('同じ役割の2組目は役割の問いを重ねず、proof_needsの問いにする', () => {
    const map = routeQuestionMap(R({ proofNeeds: ['SEGMENT_DIFFERENCE', 'SECOND_METRIC'], desiredYes: 'RECOGNITION' }), 'ja', 'AIMED');
    const mismatch = map.filter((x) => x.routeRole === 'AIMED.MISMATCH');
    if (mismatch.length > 1) expect(mismatch[1]!.question).not.toBe(mismatch[0]!.question);
    expect(mismatch[0]!.question).toBe('全体の裏にどんな差・例外があるか');
  });

  it('個別化の説明が付く問いには補助行を出さない（重複させない）。無い問いには出す', () => {
    const s = v2(R({ personalizations: [{ target: 'SEGMENT_DIFFERENCE', explanation: '市場別の差を確かめます。', confidence: 'proposed', requiredDataHints: [] }] }));
    const mismatch = s.slides.find((x) => x.routeRole === 'AIMED.MISMATCH')!;
    expect(mismatch.personalization).toBeTruthy();
    expect(supportLineFor(s, mismatch)).toBeNull();
    const impact = s.slides.find((x) => x.routeRole === 'AIMED.IMPACT')!;
    expect(supportLineFor(s, impact)).toBe(questionOf(['OVERALL_CHANGE'], 'ja', { route: 'AIMED', outcomeDirection: 'MIXED' }));
    // 自分で書き換えた問い・従来方式・proof_needsが無い問いには出さない
    expect(supportLineFor(renameQuestion(s, impact.id, '自分の問い'), renameQuestion(s, impact.id, '自分の問い').slides[0]!)).toBeNull();
    expect(supportLineFor(legacy(s), impact)).toBeNull();
    expect(supportLineFor(s, s.slides.find((x) => x.routeRole === 'AIMED.DECISION')!)).toBeNull();
  });

  it('見せ方を替えても、版2の役割の問いは替わらない。版1は従来どおり替わる', () => {
    const story = v2();
    const p = projectOfStory(story, 'ja');
    const p2 = { ...p, slides: p.slides.map((x, i) => (i === 0 ? { ...x, view: 'STORY_TEXT_TWO_COLUMN' as const } : x)) };
    expect(mergeProject(story, p2, 'ja').slides[0]!.question).toBe(story.slides[0]!.question);
    const old = legacy(story);
    expect(mergeProject(old, projectOfStory(old, 'ja'), 'ja').slides[0]!.question).toBe(old.slides[0]!.question);
  });
});

/** 問いを作る規則：版ごとに、システムが作った問いが規則どおりか */
function violations(s: StoryState): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  for (const slide of s.slides) {
    if (!slide.routeRole || slide.routeRole === EXEC_SUMMARY_ROLE || slide.questionEdited || slide.template || !slide.proofNeeds.length) continue;
    const key = `${slide.routeRole}|${slide.questionPriority === 'COACHING_ONLY' ? 'out' : 'in'}`;
    const index = seen.get(key) ?? 0; seen.set(key, index + 1);
    const want = questionFor({ version: s.questionMapVersion, route: s.primaryRoute, role: slide.routeRole, needs: slide.proofNeeds, index, locale: 'ja', context: { route: s.primaryRoute, outcomeDirection: s.outcomeDirection } });
    if (slide.question !== want) out.push(`${slide.routeRole}[${index}]: ${slide.question} ≠ ${want}`);
  }
  return out;
}

describe('追加・選び直し・分割・統合・復元しても、新旧の方式が混ざらない', () => {
  const run = (start: StoryState): StoryState[] => {
    const states: StoryState[] = [start];
    const push = (s: StoryState) => { states.push(s); return s; };
    let s = start;
    s = push(addQuestion(s, ['RANKING'], 'ja'));
    const mismatchIdx = s.slides.findIndex((x) => x.routeRole === 'AIMED.MISMATCH' || x.routeRole === 'CHOICE.OPTIONS');
    s = push(mergeWithNext(s, s.slides[mismatchIdx]!.id, 'ja'));
    s = push(splitQuestion(s, s.slides[mismatchIdx]!.id, 'ja'));
    s = push(moveQuestion(s, s.slides[mismatchIdx + 1]!.id, -1));
    s = push(toggleNeed(s, 'OVERALL_CHANGE', 'ja'));
    s = push(toggleNeed(s, 'OVERALL_CHANGE', 'ja'));
    s = push(setCoachingOnly(s, s.slides[mismatchIdx]!.id, true));
    s = push(setCoachingOnly(s, s.slides[mismatchIdx]!.id, false));
    s = push(removeNeed(s, 'RANKING', 'ja'));
    s = push(toggleNeed(s, 'GROWTH_SPEED', 'ja'));
    return states;
  };

  for (const [route, reading] of [
    ['AIMED', R()], ['CHOICE', R({ routeSignals: ['PRIORITIZATION'], desiredYes: 'SELECTION', proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'] })],
  ] as [StoryRouteId, StoryReading][]) {
    it(`${route}：版2は全ステップで版が変わらず、すべて版2の規則どおり`, () => {
      const start = noExec(storyFromReading('相談', reading, 'ja'));
      expect(start.primaryRoute).toBe(route);
      for (const s of run(start)) {
        expect(s.questionMapVersion).toBe(2);
        expect(violations(s)).toEqual([]);
      }
    });
    it(`${route}：版1は全ステップで版が変わらず、すべて版1の規則どおり（proof_needsの問い）`, () => {
      const start = legacy(noExec(storyFromReading('相談', reading, 'ja')), reading);
      for (const s of run(start)) {
        expect(s.questionMapVersion).toBe(1);
        expect(violations(s)).toEqual([]);
      }
    });
  }

  it('版2：先頭の問いを外すと、同じ役割の次の問いが役割の問いになり、戻すと元の並びの規則に戻る', () => {
    const s0 = noExec(storyFromReading('相談', R({ proofNeeds: ['OVERALL_CHANGE', 'SEGMENT_DIFFERENCE', 'SECOND_METRIC'], desiredYes: 'RECOGNITION' }), 'ja'));
    const s1 = addQuestion(s0, ['RANKING'], 'ja'); // 差の2つ目（まとめられない組を想定せず、規則が成り立つことだけを見る）
    const head = s1.slides.find((x) => x.routeRole === 'AIMED.MISMATCH')!;
    const out = setCoachingOnly(s1, head.id, true);
    expect(violations(out)).toEqual([]);
    expect(violations(setCoachingOnly(out, head.id, false))).toEqual([]);
  });

  it('自分で書き換えた問いは、操作しても変わらない', () => {
    const s0 = v2();
    const edited = renameQuestion(s0, s0.slides[0]!.id, '市場全体は戻ったのか');
    const after = toggleNeed(toggleNeed(edited, 'SEGMENT_DIFFERENCE', 'ja'), 'SEGMENT_DIFFERENCE', 'ja');
    expect(after.slides.find((x) => x.id === s0.slides[0]!.id)!.question).toBe('市場全体は戻ったのか');
  });
});

describe('「再提案」の3つの区別', () => {
  it('① 新しいStoryとして作り直す（chosenNeedsで選び直した下書きも含む）→ 版2', () => {
    const s = storyFromReading('相談', R(), 'ja', ['OVERALL_CHANGE', 'RANKING']);
    expect(s.questionMapVersion).toBe(2);
    expect(noExec(s).slides.map((x) => x.proofNeeds)).toEqual(expect.arrayContaining([['OVERALL_CHANGE'], ['RANKING']]));
    expect(violations(noExec(s))).toEqual([]);
  });

  it('② 既存Story内で問いを選び直す（toggleNeed）→ 元の版を維持', () => {
    for (const version of [1, 2] as QuestionMapVersion[]) {
      const s = { ...noExec(storyFromReading('相談', R(), 'ja')), questionMapVersion: version };
      expect(toggleNeed(toggleNeed(s, 'RANKING', 'ja'), 'RANKING', 'ja').questionMapVersion).toBe(version);
    }
  });

  it('③ 既存Storyを新方式へ更新するのは、明示的な操作（upgradeQuestionMap）だけ', () => {
    const old = legacy(noExec(storyFromReading('相談', R(), 'ja')));
    const edited = renameQuestion(old, old.slides[1]!.id, '自分で書いた問い');
    const up = upgradeQuestionMap(edited);
    expect(up.questionMapVersion).toBe(2);
    expect(up.slides).toHaveLength(edited.slides.length);
    expect(up.slides[0]!.question).toBe('全体として何が起きているか');
    expect(up.slides[1]!.question).toBe('自分で書いた問い');
    expect(violations(up)).toEqual([]);
    // 何もしなければ版1のまま。すでに最新なら変えない
    expect(old.questionMapVersion).toBe(1);
    expect(upgradeQuestionMap(up)).toBe(up);
    // 操作や読み込みでは、勝手に版2にならない
    expect(normalizeStory(JSON.parse(JSON.stringify(addQuestion(old, ['RANKING'], 'ja'))))!.questionMapVersion).toBe(1);
  });
});

describe('前提の確認', () => {
  it('役割の問いを前面に出すのは、版2かつ対象のRouteだけ（Diagnosisは対象外）', () => {
    expect(usesRoleQuestion(2, 'AIMED')).toBe(true);
    expect(usesRoleQuestion(1, 'AIMED')).toBe(false);
    expect(usesRoleQuestion(2, 'DIAGNOSIS')).toBe(false);
    expect(localize(routeRoleDef('AIMED', 'AIMED.IMPACT')!.question, 'ja')).toBe('全体として何が起きているか');
  });
  it('emptySlide だけで組んだ版2のStoryを操作しても壊れない', () => {
    const s = newStory('ja', { slides: [emptySlide({ routeRole: 'AIMED.IMPACT', proofNeeds: ['OVERALL_CHANGE'], question: 'x' })] });
    expect(() => toggleNeed(s, 'RANKING', 'ja')).not.toThrow();
  });
});

describe('同じ役割の2つ目以降の見分け方', () => {
  it('専用ロール方式で、同じ役割の2つ目以降に順番を返す。1つ目・外した問い・版1・対象外は0', () => {
    const s = addQuestion(v2(), ['GROWTH_SPEED'], 'ja');
    const impact = s.slides.filter((x) => x.routeRole === 'AIMED.IMPACT');
    expect(impact.map((x) => roleOrdinal(s, x))).toEqual([0, 2]);
    expect(roleOrdinal(s, s.slides.find((x) => x.routeRole === 'AIMED.DECISION')!)).toBe(0);
    const out = setCoachingOnly(s, impact[1]!.id, true);
    expect(roleOrdinal(out, out.slides.find((x) => x.id === impact[1]!.id)!)).toBe(0);
    expect(roleOrdinal(legacy(s), impact[1]!)).toBe(0);
  });
});
