import { describe, expect, it } from 'vitest';
import type { ProofNeedId } from '@/registry';
import { emptySlide, newStory, normalizeStory } from './model';
import {
  addCandidateField, addField, addRequest, canBuildDataPack, dataPackIssues, fallbackDataPack, moveField, moveRequest, pruneQuestionRefs, removeField, removeRequest,
  renameField, toggleSharedKey, updateField, updateRequest,
} from './dataPack';
import { emptyDataPackPlan } from './dataPackPlan';

const q = (id: string, proofNeeds: ProofNeedId[], over = {}) => emptySlide({ id, question: id, proofNeeds, ...over });

describe('規則による提案（AI なし）', () => {
  it('行の粒度が同じ Question は1つの依頼にまとめ、違えば別の依頼にする', () => {
    const story = newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE']), q('q2', ['SEGMENT_DIFFERENCE']), q('q3', ['CURRENT_MIX'])] });
    const plan = fallbackDataPack(story);
    expect(plan.requests.map((r) => r.id)).toEqual(['r-trend', 'r-mix']);
    expect(plan.requests[0]).toMatchObject({ questionRefs: ['q1', 'q2'], grain: ['項目', '期間'], origin: 'coach', importance: 'required' });
    expect(plan.requests[1]).toMatchObject({ questionRefs: ['q3'], grain: ['項目', '内訳', '期間'] });
    expect(plan.requests[0]!.fields.map((x) => x.label)).toEqual(['項目', '期間', '値']);
    expect(plan.requests.flatMap((r) => r.fields).every((x) => x.origin === 'coach')).toBe(true);
  });
  it('依頼が複数ある時は「項目」を共通キーにする。1つだけなら付けない', () => {
    const two = fallbackDataPack(newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE']), q('q2', ['RELATIONSHIP'])] }));
    expect(two.requests.map((r) => r.sharedKeys)).toEqual([['item'], ['item']]);
    const one = fallbackDataPack(newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE'])] }));
    expect(one.requests[0]!.sharedKeys).toEqual([]);
  });
  it('提案は4件まで。超えた分は最後の依頼にまとめ、Question の紐づけは残す', () => {
    const story = newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE']), q('q2', ['CURRENT_MIX']), q('q3', ['TARGET_GAP']), q('q4', ['RELATIONSHIP']), q('q5', ['BRIDGE'])] });
    const plan = fallbackDataPack(story);
    expect(plan.requests).toHaveLength(4);
    expect(plan.requests.flatMap((r) => r.questionRefs).sort()).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    const last = plan.requests[3]!;
    expect(last.fields.some((x) => x.label === '増減の要因')).toBe(true);
    expect(new Set(last.fields.map((x) => x.id)).size).toBe(last.fields.length);
  });
  it('言葉だけのスライド・確認事項・proof_needs が無い Question は対象にしない。何も無ければ推移を1つ置く', () => {
    const story = newStory('ja', { slides: [q('q1', [], { presentationMode: 'TEXT' }), q('q2', ['OVERALL_CHANGE'], { questionPriority: 'COACHING_ONLY' })] });
    const plan = fallbackDataPack(story);
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0]).toMatchObject({ id: 'r-trend', questionRefs: [] });
  });
  it('AI の具体化の「必要なデータ」があれば、依頼の名前に使う。英語の Story は英語で出す', () => {
    const personalization = { explanation: '全体', confidence: 'proposed' as const, requiredDataHints: ['市場別の訪日客数'] };
    const ja = fallbackDataPack(newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE'], { personalization })] }));
    expect(ja.requests[0]!.label).toBe('市場別の訪日客数');
    const en = fallbackDataPack(newStory('en', { slides: [q('q1', ['OVERALL_CHANGE'])] }));
    expect(en.requests[0]).toMatchObject({ label: 'Items over time', grain: ['Item', 'Period'] });
  });
  it('提案は保存して読み戻しても同じ（正規化で変わらない）', () => {
    const story = newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE']), q('q2', ['CURRENT_MIX'])] });
    const plan = fallbackDataPack(story);
    const back = normalizeStory(JSON.parse(JSON.stringify({ ...story, dataPackPlan: plan })));
    expect(back!.dataPackPlan).toEqual(plan);
  });
});

describe('編集の操作', () => {
  const base = fallbackDataPack(newStory('ja', { slides: [q('q1', ['OVERALL_CHANGE']), q('q2', ['CURRENT_MIX'])] }));
  const r0 = 'r-trend';

  it('項目を足す（自由項目は出どころ＝ユーザー）。空・同じ名前は足さない。元の計画は書き換えない', () => {
    const next = addField(base, r0, '  担当部署 ', 'dimension', { example: '営業部' });
    const added = next.requests[0]!.fields.at(-1)!;
    expect(added).toMatchObject({ label: '担当部署', kind: 'dimension', origin: 'user', example: '営業部', required: false });
    expect(base.requests[0]!.fields).toHaveLength(3);
    expect(addField(next, r0, '担当部署').requests[0]!.fields).toHaveLength(4);
    expect(addField(base, r0, '   ')).toBe(base);
    expect(addField(base, r0, '値').requests[0]!.fields).toHaveLength(3);
    // 数値の項目に入力例は置かない
    expect(addField(base, r0, '利益', 'measure', { example: '100' }).requests[0]!.fields.at(-1)!.example).toBeUndefined();
  });
  it('Coach の依頼にユーザーが項目を足しても、Coach が足した項目の出どころは変わらない', () => {
    const next = renameField(addField(base, r0, '備考', 'dimension'), r0, 'item', '市場');
    expect(next.requests[0]!.origin).toBe('coach');
    expect(next.requests[0]!.fields.map((x) => [x.label, x.origin])).toEqual([['市場', 'coach'], ['期間', 'coach'], ['値', 'coach'], ['備考', 'user']]);
  });
  it('名前の変更：空や同じ依頼内の重複は変えない', () => {
    expect(renameField(base, r0, 'item', '  ')).toBe(base);
    expect(renameField(base, r0, 'item', '期間').requests[0]!.fields[0]!.label).toBe('項目');
  });
  it('削除と並べ替え：共通キーから外れる。端では動かない', () => {
    const removed = removeField(base, r0, 'item');
    expect(removed.requests[0]!.fields.map((x) => x.id)).toEqual(['period', 'value']);
    expect(removed.requests[0]!.sharedKeys).toEqual([]);
    expect(moveField(base, r0, 'value', -1).requests[0]!.fields.map((x) => x.id)).toEqual(['item', 'value', 'period']);
    expect(moveField(base, r0, 'item', -1)).toBe(base);
    expect(moveField(base, r0, 'value', 1)).toBe(base);
    expect(moveRequest(base, 'r-mix', -1).requests.map((r) => r.id)).toEqual(['r-mix', 'r-trend']);
    expect(moveRequest(base, 'r-trend', -1)).toBe(base);
  });
  it('依頼を足す・直す・消す。上限を超えて足さない', () => {
    const added = addRequest(base, '追加データ');
    expect(added.requests.at(-1)).toMatchObject({ label: '追加データ', origin: 'user', fields: [], questionRefs: [] });
    const id = added.requests.at(-1)!.id;
    expect(new Set(added.requests.map((r) => r.id)).size).toBe(added.requests.length);
    const edited = updateRequest(added, id, { label: '市場データ', importance: 'optional', role: '補足' });
    expect(edited.requests.at(-1)).toMatchObject({ label: '市場データ', importance: 'optional', role: '補足' });
    expect(removeRequest(edited, id).requests).toHaveLength(2);
    let full = emptyDataPackPlan();
    for (let i = 0; i < 12; i++) full = addRequest(full, `d${i}`);
    expect(full.requests).toHaveLength(8);
  });
  it('項目の説明・単位・必須を直す。共通キーの切り替えは、その依頼の項目だけ', () => {
    const next = updateField(base, r0, 'value', { unit: '百万円', description: '売上', required: false });
    expect(next.requests[0]!.fields[2]).toMatchObject({ unit: '百万円', description: '売上', required: false });
    expect(updateField(next, r0, 'value', { unit: '' }).requests[0]!.fields[2]!.unit).toBeUndefined();
    expect(toggleSharedKey(base, r0, 'period').requests[0]!.sharedKeys).toEqual(['item', 'period']);
    expect(toggleSharedKey(base, r0, 'item').requests[0]!.sharedKeys).toEqual([]);
    expect(toggleSharedKey(base, r0, 'zzz')).toBe(base);
  });
  it('外した提案の項目を、候補から戻せる（出どころは Coach のまま。同じ項目は二重に入らない）', () => {
    const original = base.requests[0]!.fields[1]!;
    const removed = removeField(base, r0, 'period');
    const back = addCandidateField(removed, r0, original);
    expect(back.requests[0]!.fields.map((x) => [x.id, x.origin])).toEqual([['item', 'coach'], ['value', 'coach'], ['period', 'coach']]);
    expect(addCandidateField(back, r0, original)).toBe(back);
  });
  it('Question が減った時は参照だけを外す', () => {
    const pruned = pruneQuestionRefs(base, new Set(['q2']));
    expect(pruned.requests.map((r) => r.questionRefs)).toEqual([[], ['q2']]);
  });
  it('作成できる条件：依頼が1つ以上あり、各依頼に名前・Dimension・Measure がある。足りないものは具体的に返す', () => {
    expect(canBuildDataPack(base)).toBe(true);
    expect(canBuildDataPack(emptyDataPackPlan())).toBe(false);
    const withNew = addRequest(base, '');
    const newId = withNew.requests[2]!.id;
    expect(dataPackIssues(withNew).map((i) => [i.requestId, i.missing])).toEqual([[newId, 'label'], [newId, 'dimension'], [newId, 'measure']]);
    const noMeasure = removeField(base, r0, 'value');
    expect(dataPackIssues(noMeasure)).toEqual([{ requestId: r0, label: '項目別の推移', missing: 'measure' }]);
    expect(canBuildDataPack(noMeasure)).toBe(false);
  });
});

describe('AI の提案から依頼を組む（Phase 5）', async () => {
  const { dataPackFromSuggestions } = await import('./dataPack');
  const { storyFromReading } = await import('./questionMap');
  const reading = {
    decisionQuestion: 'どの市場を優先するか', desiredYes: 'SELECTION' as const, primaryBarrier: null, proofNeeds: ['OVERALL_CHANGE' as const, 'CURRENT_MIX' as const],
    scopeCandidate: 'STORY_FLOW' as const, routeSignals: [], outcomeDirection: 'MIXED' as const, explicitSize: null, confidence: 0.9,
  };
  const sg = (label: string, needs: ('OVERALL_CHANGE' | 'CURRENT_MIX')[]) => ({
    needs, label, role: '役割', importance: 'required' as const, grain: ['地域', '年'],
    fields: [
      { label: '地域', description: '', kind: 'dimension' as const, valueType: 'text' as const, example: '東京' },
      { label: '売上', description: '', kind: 'measure' as const, valueType: 'number' as const, unit: '円' },
    ],
  });
  it('AI の提案があれば Story の下書きに計画を持たせる。Question へは proof_needs の重なりで結び、共通キーを付ける', () => {
    const s = storyFromReading('相談', { ...reading, dataPack: [sg('地域別の売上', ['OVERALL_CHANGE']), sg('内訳', ['CURRENT_MIX'])] }, 'ja');
    const plan = s.dataPackPlan!;
    expect(plan.requests.map((r) => r.id)).toEqual(['r-ai1', 'r-ai2']);
    expect(plan.requests[0]).toMatchObject({ origin: 'coach', importance: 'required', sharedKeys: ['f1'] });
    const ids = new Set(s.slides.map((x) => x.id));
    expect(plan.requests.every((r) => r.questionRefs.length > 0 && r.questionRefs.every((id) => ids.has(id)))).toBe(true);
    expect(plan.requests[0]!.questionRefs).not.toEqual(plan.requests[1]!.questionRefs);
    expect(dataPackFromSuggestions(s, plan.requests.length ? [] : undefined)).toBeUndefined();
  });
  it('AI の提案が無い・空なら、計画は付けない（画面が規則の提案を出す）', () => {
    expect('dataPackPlan' in storyFromReading('相談', reading, 'ja')).toBe(false);
    expect('dataPackPlan' in storyFromReading('相談', { ...reading, dataPack: [] }, 'ja')).toBe(false);
  });
});
