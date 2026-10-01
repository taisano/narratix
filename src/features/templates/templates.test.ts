import { describe, expect, it } from 'vitest';
import { composeTemplate, formatCell, parseCell, alignOf, type ComparisonContent, type ComparisonLook } from '@/engine/layout/templates';
import { itemTexts } from '@/engine/scene';
import { evaluate } from '../editor/preview';
import { duplicateSlide, initialProject, normalizeProject, viewOf, withView } from '../editor/project';
import { initialState, sampleFor } from '../editor/state';
import { comparisonChecks, conclusionChecks } from './checks';
import {
  addCol, addRow, comparisonFromData, defaultComparisonLook, defaultConclusionLook, emptyConclusion, ensureTemplate, moveCol, moveReason,
  pasteCells, removeRow, sampleComparison, templateFilled,
} from './content';

const texts = (s: ReturnType<typeof composeTemplate>) => s.items.flatMap(itemTexts);

describe('セルの数の読み書き', () => {
  it('数・%・通貨・単位を読む。文は数にしない', () => {
    expect(parseCell('1,234')).toMatchObject({ value: 1234, mark: 'plain' });
    expect(parseCell('12%')).toMatchObject({ value: 12, mark: 'pct' });
    expect(parseCell('¥3,000')).toMatchObject({ value: 3000, mark: 'currency' });
    expect(parseCell('12.5億円')).toMatchObject({ value: 12.5, mark: 'currency', suffix: '億円' });
    expect(parseCell('−3')).toMatchObject({ value: -3 });
    expect(parseCell('3社が参入している市場').value).toBeNull();
    expect(parseCell('高').value).toBeNull();
  });
  it('数の形：12 → 12%（0.12 を 12% にしない）、整数・小数・通貨・単位。言葉はそのまま', () => {
    expect(formatCell('12', { kind: 'pct' })).toBe('12%');
    expect(formatCell('1234.56', { kind: 'int' })).toBe('1,235');
    expect(formatCell('1234.56', { kind: 'dec' })).toBe('1,234.6');
    expect(formatCell('3000', { kind: 'currency', symbol: '¥' })).toBe('¥3,000');
    expect(formatCell('120', { kind: 'int', unit: '億円' })).toBe('120億円');
    expect(formatCell('高', { kind: 'int' })).toBe('高');
  });
  it('揃え：数は右、短い評価の語は中央、文は左', () => {
    expect(alignOf('1,234')).toBe('right');
    expect(alignOf('高')).toBe('center');
    expect(alignOf('規制と決済の対応が必要')).toBe('left');
  });
});

describe('比較表', () => {
  it('見本のデータなら空の見本、入れたデータなら最新の期間を文字の表にして始める', () => {
    const b = initialState('ja');
    expect(ensureTemplate(b, 'STORY_TABLE_COMPARISON', true).content!.comparison).toEqual(sampleComparison('ja'));
    // 行が年（推移）：最新の年の1行。比較対象は列
    const tr = sampleFor('trend', 'ja').dataset;
    const c = comparisonFromData(tr, 'ja');
    expect(c.cells[0]!.slice(1)).toEqual(tr.cols);
    expect(c.cells).toHaveLength(2);
    expect(c.cells[1]![0]).toBe(tr.rows.at(-1));
    // 行が項目：項目を比較対象（列）に、列を比較項目（行）に
    const m = comparisonFromData(b.dataset, 'ja');
    expect(m.cells[0]!.slice(1)).toEqual(b.dataset.rows);
    expect(m.cells.slice(1).map((r) => r[0])).toEqual(b.dataset.cols);
  });
  it('貼り付け：始めのセルから右下へ。足りない行・列を足す', () => {
    let t = { content: sampleComparison('ja'), look: defaultComparisonLook() };
    t = pasteCells(t, 1, 1, '10\t20\t30\t40\t50\n1%\t2%\n');
    expect(t.content.cells[1]).toEqual(['市場規模', '10', '20', '30', '40', '50']);
    expect(t.content.cells[2]!.slice(1, 3)).toEqual(['1%', '2%']);
  });
  it('行・列の追加・削除・並べ替えで、強調と数の形の位置もついてくる', () => {
    let t: { content: ComparisonContent; look: ComparisonLook } = { content: sampleComparison('ja'), look: { ...defaultComparisonLook(), emphasis: { kind: 'col', index: 2 }, formats: { '2': { kind: 'pct' } } } };
    t = moveCol(t, 2, 1);
    expect(t.look.emphasis).toEqual({ kind: 'col', index: 3 });
    t = addCol(t, 0);
    expect(t.look.emphasis).toEqual({ kind: 'col', index: 4 });
    t = addRow(t, 1);
    expect(t.look.formats).toEqual({ '3': { kind: 'pct' } });
    t = removeRow(t, 3);
    expect(t.look.formats).toEqual({});
  });
  it('描く：見出しは紺に白、強調した列はアクセント色。文字と表は編集できる表のまま', () => {
    const content = { ...sampleComparison('ja'), cells: [['項目', 'A', 'B'], ['規模', '100', '200'], ['評価', '高', '低']] };
    const look = { ...defaultComparisonLook(), emphasis: { kind: 'col' as const, index: 2 } };
    const s = composeTemplate({ id: 'STORY_TABLE_COMPARISON', title: 'B が大きい', source: '出典：社内', locale: 'ja', comparison: { content, look } });
    const table = s.items.find((x) => x.kind === 'table');
    expect(table && table.kind === 'table' && table.rows[0]![0]!.fill).toBe('#0B2D4D');
    expect(table && table.kind === 'table' && table.rows[0]![2]!.fill).not.toBe('#0B2D4D');
    expect(table && table.kind === 'table' && table.rows[1]![1]!.align).toBe('right');
    expect(texts(s)).toContain('出典：社内');
    const off = composeTemplate({ id: 'STORY_TABLE_COMPARISON', title: 'x', source: '出典：社内', locale: 'ja', comparison: { content, look: { ...look, showSource: false } } });
    expect(texts(off)).not.toContain('出典：社内');
  });
  it('確認：数に文字が混じる・単位が揃わない・空や同じ名前の見出し・見本の名前・見本の出典・大きすぎる表', () => {
    const c = { ...sampleComparison('ja'), cells: [['項目', 'A', 'A', ''], ['規模', '100', '200', 'n/a'], ['伸び', '10%', '¥20', '30%']] };
    const keys = comparisonChecks(c, defaultComparisonLook(), '出典：サンプルデータ（実データに置き換えてください）').map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(['tpl.warn.mixedText', 'tpl.warn.mixedUnit', 'tpl.warn.emptyHead', 'tpl.warn.dupHead']));
    expect(comparisonChecks(sampleComparison('ja'), defaultComparisonLook(), '').map((w) => w.key)).toContain('tpl.warn.sampleHead');
    const big = { ...c, cells: Array.from({ length: 10 }, (_, i) => Array.from({ length: 7 }, (_, j) => `${i}-${j}`)) };
    expect(comparisonChecks(big, defaultComparisonLook(), '').map((w) => w.key)).toEqual(expect.arrayContaining(['tpl.warn.manyCols', 'tpl.warn.manyRows']));
  });
});

describe('結論＋3つの根拠', () => {
  const reasons = [
    { id: 'a', heading: '伸びが大きい', body: '2倍に回復した。', ref: 's2' },
    { id: 'b', heading: '', body: '', ref: null },
    { id: 'c', heading: '実行しやすい', body: '距離が近い。', ref: null },
  ];
  it('結論はタイトルだけ（本文に重ねない）。空の根拠は出さない。番号は出した順', () => {
    const s = composeTemplate({
      id: 'STORY_TEXT_CONCLUSION_REASONS', title: '韓国を優先する', source: '', locale: 'ja',
      conclusion: { content: { reasons, caveat: '' }, look: defaultConclusionLook() }, slideNumber: (id) => (id === 's2' ? 2 : null),
    });
    const ts = texts(s);
    expect(ts.filter((x) => x === '韓国を優先する')).toHaveLength(1);
    expect(ts).toEqual(expect.arrayContaining(['01', '02', '伸びが大きい', '実行しやすい', '参照：スライド 2']));
    expect(ts).not.toContain('03');
  });
  it('何も入れていなければ、タイトル以外は描かない（見本の文言を PPT に出さない）', () => {
    const s = composeTemplate({ id: 'STORY_TEXT_CONCLUSION_REASONS', title: '', source: '', locale: 'ja', conclusion: { content: emptyConclusion(), look: defaultConclusionLook() } });
    expect(texts(s).filter((x) => x.trim())).toEqual([]);
  });
  it('確認：結論が空・根拠が無い・説明が無い・長すぎる・参照先が無い', () => {
    expect(conclusionChecks('', emptyConclusion(), () => true).map((w) => w.key)).toEqual(['tpl.warn.noTitle', 'tpl.warn.noReason']);
    const keys = conclusionChecks('x'.repeat(61), { reasons: [{ id: 'a', heading: 'あ'.repeat(21), body: '', ref: 'gone' }], caveat: '' }, () => false).map((w) => w.key);
    expect(keys).toEqual(['tpl.warn.longTitle', 'tpl.warn.noBody', 'tpl.warn.longHeading', 'tpl.warn.refGone']);
  });
  it('並べ替えで強調もついてくる', () => {
    const r = moveReason({ reasons, caveat: '' }, { ...defaultConclusionLook(), emphasis: 0 }, 0, 1);
    expect(r.content.reasons[1]!.id).toBe('a');
    expect(r.look.emphasis).toBe(1);
  });
});

describe('見せ方を行き来しても、データも中身も失わない', () => {
  it('グラフ → 比較表 → 言葉 → グラフ：データ・グラフの設定・表と言葉の中身が残る。保存して読み戻しても同じ', () => {
    let p = duplicateSlide(initialProject('ja'), 0);
    const v0 = viewOf(p, 1);
    const data = JSON.stringify(v0.dataset);
    p = withView(p, 1, { ...v0, ...ensureTemplate(v0, 'STORY_TABLE_COMPARISON', false) });
    let v = viewOf(p, 1);
    p = withView(p, 1, { ...v, content: { ...v.content, comparison: { ...v.content!.comparison!, note: '注記' } } });
    v = viewOf(p, 1);
    p = withView(p, 1, { ...v, ...ensureTemplate(v, 'STORY_TEXT_CONCLUSION_REASONS', false) });
    v = viewOf(p, 1);
    p = withView(p, 1, { ...v, view: undefined });
    v = viewOf(p, 1);
    expect(v.view).toBeUndefined();
    expect(v.chart).toBe(v0.chart);
    expect(JSON.stringify(v.dataset)).toBe(data);
    expect(v.content!.comparison!.note).toBe('注記');
    expect(v.content!.conclusion).toBeTruthy();
    // 比較表に戻すと前の中身
    expect(ensureTemplate(v, 'STORY_TABLE_COMPARISON', true).content!.comparison!.note).toBe('注記');
    // ほかのスライドは変わらない
    expect(viewOf(p, 0).view).toBeUndefined();
    const back = normalizeProject(JSON.parse(JSON.stringify(p)))!;
    expect(viewOf(back, 1).content).toEqual(v.content);
  });
  it('表・言葉のスライドも描けて、出力の数に入る（データの注意で止めない）', () => {
    const b = initialState('ja');
    const t = { ...b, ...ensureTemplate(b, 'STORY_TEXT_CONCLUSION_REASONS', true), title: '結論' };
    const r = evaluate(t);
    expect(r.scene).toBeTruthy();
    expect(r.warnings.map((w) => w.key)).not.toContain('warn.no_data');
    expect(templateFilled(t)).toBe(false);
  });
});

describe('文字の揃え', () => {
  it('比較表：選んだ揃えを本文と見出しの行に（比較項目の列は左のまま）。自動は数で右', () => {
    const content = { ...sampleComparison('ja'), cells: [['項目', 'A'], ['規模', '100']] };
    const cellAlign = (align?: 'auto' | 'left' | 'center' | 'right') => {
      const s = composeTemplate({ id: 'STORY_TABLE_COMPARISON', title: 'x', source: '', locale: 'ja', comparison: { content, look: { ...defaultComparisonLook(), align } } });
      const tb = s.items.find((x) => x.kind === 'table');
      return tb && tb.kind === 'table' ? [tb.rows[1]![0]!.align, tb.rows[1]![1]!.align, tb.rows[0]![1]!.align] : [];
    };
    expect(cellAlign()).toEqual(['left', 'right', 'center']);
    expect(cellAlign('center')).toEqual(['left', 'center', 'center']);
    expect(cellAlign('left')).toEqual(['left', 'left', 'left']);
  });
  it('結論＋根拠：カードの中の文字を揃える（タイトルはそのまま左）', () => {
    const s = composeTemplate({ id: 'STORY_TEXT_CONCLUSION_REASONS', title: '結論', source: '', locale: 'ja',
      conclusion: { content: { reasons: [{ id: 'a', heading: '見出し', body: '説明', ref: null }], caveat: '' }, look: { ...defaultConclusionLook(), align: 'center' } } });
    const align = (t: string) => s.items.find((x) => x.kind === 'text' && x.lines[0]?.t === t);
    expect(align('見出し')).toMatchObject({ align: 'center' });
    expect(align('結論')).toMatchObject({ align: 'left' });
  });
  it('揃えは保存して読み戻せる', () => {
    let p = initialProject('ja');
    const v = viewOf(p, 0);
    const t = ensureTemplate(v, 'STORY_TEXT_CONCLUSION_REASONS', true);
    p = withView(p, 0, { ...v, ...t, look: { ...t.look, conclusion: { ...t.look!.conclusion!, align: 'right' } } });
    expect(viewOf(normalizeProject(JSON.parse(JSON.stringify(p)))!, 0).look!.conclusion!.align).toBe('right');
  });
});
