import { describe, expect, it } from 'vitest';
import { composeTemplate, heatColor, heatFills, deltaColor, deltaText, formatCell, kpiDelta, parseCell, alignOf, rowDelta, type DeltaContent, type IiaContent, type ComparisonContent, type ComparisonLook, type Kpi } from '@/engine/layout/templates';
import { itemTexts } from '@/engine/scene';
import { evaluate } from '../editor/preview';
import { duplicateSlide, initialProject, normalizeProject, viewOf, withView } from '../editor/project';
import { initialState, sampleFor } from '../editor/state';
import { comparisonChecks, conclusionChecks, deltaChecks, execChecks, heatChecks, iiaChecks, kpiChecks, numbersChecks } from './checks';
import {
  addCol, addRow, comparisonFromData, defaultComparisonLook, defaultConclusionLook, emptyConclusion, ensureTemplate, moveCol, moveReason,
  pasteCells, removeRow, sampleComparison, templateFilled, normalizeLook, defaultKpiLook, kpiFromData, pasteKpis, sampleKpi,
  defaultExecLook, draftFromMessages, emptyExec, insertMessages, updateBlock, insertFreeMessages, setExecMode,
  defaultDeltaLook, deltaFromData, pasteDeltaRows, sampleDelta, defaultIiaLook, emptyIia, insertIiaMessages, defaultHeatLook, defaultNumbersLook,
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

describe('KPI スコアカード', () => {
  const k = (over: Partial<Kpi>): Kpi => ({ id: 'x', name: '訪日客数', value: '3687', unit: '万人', period: '2024年', compare: '2507', basis: '前年比', good: 'up', ...over });
  it('増減はアプリが計算する：差・率・両方。% の指標は差を pt で。比較が無ければ出さない', () => {
    const d = kpiDelta(k({}))!;
    expect(d.diff).toBe(1180);
    expect(deltaText(k({}), d, 'pct', () => 0)).toBe('+47.1%');
    expect(deltaText(k({}), d, 'diff', () => 0)).toBe('+1,180万人');
    expect(deltaText(k({}), d, 'both', () => 0)).toBe('+47.1%（+1,180万人）');
    const p = k({ value: '44%', compare: '47%', unit: '' });
    expect(deltaText(p, kpiDelta(p)!, 'pct', () => 1)).toBe('−3.0pt');
    expect(kpiDelta(k({ compare: '' }))).toBeNull();
  });
  it('色：良い向きは紺、悪い向きは赤、色を付けないは灰', () => {
    const up = kpiDelta(k({}))!;
    expect(deltaColor(k({}), up)).toBe('#0B2D4D');
    expect(deltaColor(k({ good: 'down' }), up)).toBe('#C62828');
    expect(deltaColor(k({ good: 'none' }), up)).not.toBe('#C62828');
  });
  it('描く：入れた KPI だけ。4つまで1段、5つから2段。強調はアクセント色', () => {
    const look = { ...defaultKpiLook(), emphasis: 'b' };
    const kpis = ['a', 'b', 'c', 'd', 'e'].map((id) => k({ id, name: id }));
    const s = composeTemplate({ id: 'STORY_TABLE_KPI', title: 'x', source: '', locale: 'ja', kpi: { content: { kpis: [...kpis, k({ id: 'z', name: '', value: '' })], note: '' }, look } });
    const boxes = s.items.filter((i) => i.kind === 'box');
    expect(boxes).toHaveLength(5);
    expect(new Set(boxes.map((b) => (b.kind === 'box' ? Math.round(b.y * 100) : 0))).size).toBe(2);
    expect(boxes.filter((b) => b.kind === 'box' && b.line === '#D9772A')).toHaveLength(1);
    const one = composeTemplate({ id: 'STORY_TABLE_KPI', title: 'x', source: '', locale: 'ja', kpi: { content: { kpis: kpis.slice(0, 4), note: '' }, look: defaultKpiLook() } });
    expect(new Set(one.items.filter((i) => i.kind === 'box').map((b) => (b.kind === 'box' ? Math.round(b.y * 100) : 0))).size).toBe(1);
  });
  it('データから始める：列ごとに KPI、今＝最新の年、比較＝その前の年（「2024年比」）。年でないデータは見本', () => {
    const tr = sampleFor('trend', 'ja').dataset;
    const c = kpiFromData(tr, 'ja')!;
    expect(c.kpis.map((x) => x.name)).toEqual(tr.cols);
    expect(c.kpis[0]!.period).toBe(`${tr.rows.at(-1)}年`);
    expect(c.kpis[0]!.basis).toBe(`${tr.rows.at(-2)}年比`);
    expect(kpiFromData(initialState('ja').dataset, 'ja')).toBeNull();
    const b = initialState('ja');
    expect(ensureTemplate(b, 'STORY_TABLE_KPI', false).content!.kpi!.kpis.map((x) => x.name)).toEqual(['指標A', '指標B', '指標C']);
  });
  it('貼り付け：指標名の欄から右・下へ。KPI が足りなければ足す', () => {
    const c = pasteKpis(sampleKpi('ja'), 2, 'name', '売上\t120\t億円\t2024年\t100\t前年比\n利益率\t12%');
    expect(c.kpis).toHaveLength(4);
    expect(c.kpis[2]).toMatchObject({ name: '売上', value: '120', unit: '億円', compare: '100', basis: '前年比' });
    expect(c.kpis[3]).toMatchObject({ name: '利益率', value: '12%' });
  });
  it('確認：値が無い・数でない・単位が無い・比較が0・比較基準が無い・見本の名前', () => {
    const keys = kpiChecks({ kpis: [k({ name: '指標A', value: '' }), k({ id: 'b', value: '高い' }), k({ id: 'c', unit: '' }), k({ id: 'd', compare: '0' }), k({ id: 'e', basis: '' })], note: '' }, defaultKpiLook()).map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(['tpl.warn.kpiNoValue', 'tpl.warn.kpiNotNumber', 'tpl.warn.kpiNoUnit', 'tpl.warn.kpiZeroBase', 'tpl.warn.kpiNoBasis', 'tpl.warn.kpiSampleName']));
    expect(kpiChecks({ kpis: [], note: '' }, defaultKpiLook()).map((w) => w.key)).toEqual(['tpl.warn.kpiNone']);
  });
  it('保存して読み戻せる', () => {
    let p = initialProject('ja');
    const v = viewOf(p, 0);
    p = withView(p, 0, { ...v, ...ensureTemplate(v, 'STORY_TABLE_KPI', true) });
    const back = normalizeProject(JSON.parse(JSON.stringify(p)))!;
    expect(viewOf(back, 0).content!.kpi).toEqual(viewOf(p, 0).content!.kpi);
    expect(viewOf(back, 0).look!.kpi).toEqual(viewOf(p, 0).look!.kpi);
    expect(evaluate(viewOf(back, 0)).scene).toBeTruthy();
  });
});

describe('Executive Summary', () => {
  const others = [{ id: 's1', n: 2, title: '訪日客数は2019年を超えた' }, { id: 's2', n: 3, title: '中国だけ回復が遅い' }, { id: 's3', n: 4, title: '' }];
  it('描く：入れた項目だけ（項目名・本文・参照スライド）。結論はタイトルだけ', () => {
    const c = emptyExec();
    c.blocks[0] = { ...c.blocks[0]!, body: '全体は回復した。', refs: ['s1', 's2'] };
    c.blocks[3] = { ...c.blocks[3]!, label: '今回決めること', body: '優先市場を決める。', refs: [] };
    const nOf = new Map(others.map((o) => [o.id, o.n]));
    const s = composeTemplate({ id: 'STORY_TEXT_EXECUTIVE_SUMMARY', title: '結論', source: '', locale: 'ja', exec: { content: c, look: { ...defaultExecLook(), showRefs: true } }, slideNumber: (id) => nOf.get(id) ?? null });
    const ts = texts(s);
    // 参照は本文の後ろに *1、下に注記
    expect(ts).toEqual(expect.arrayContaining(['全体として確認されたこと', '全体は回復した。 *1', '*1 スライド 2・3', '今回決めること', '優先市場を決める。']));
    // 初めは参照を出さない
    expect(texts(composeTemplate({ id: 'STORY_TEXT_EXECUTIVE_SUMMARY', title: '結論', source: '', locale: 'ja', exec: { content: c, look: defaultExecLook() }, slideNumber: (id) => nOf.get(id) ?? null }))).toContain('全体は回復した。');
    expect(ts).not.toContain('判断を変える差・例外');
    expect(ts.filter((x) => x === '結論')).toHaveLength(1);
    const off = composeTemplate({ id: 'STORY_TEXT_EXECUTIVE_SUMMARY', title: '結論', source: '', locale: 'ja', exec: { content: c, look: { ...defaultExecLook(), showLabels: false, showRefs: false } }, slideNumber: (id) => nOf.get(id) ?? null });
    expect(texts(off)).not.toContain('全体として確認されたこと');
    expect(texts(off).some((x) => x.includes('*1'))).toBe(false);
  });
  it('自由に書く：本文をそのまま。定型の中身は残る。メッセージをまとめて入れられる', () => {
    let c = updateBlock(emptyExec(), 'overall', { body: '定型の中身' });
    c = setExecMode(c, 'free');
    c = insertFreeMessages(c, others, () => false);
    expect(c.free).toEqual({ body: '・訪日客数は2019年を超えた\n・中国だけ回復が遅い', refs: ['s1', 's2'] });
    const nOf = new Map(others.map((o) => [o.id, o.n]));
    const s = composeTemplate({ id: 'STORY_TEXT_EXECUTIVE_SUMMARY', title: '結論', source: '', locale: 'ja', exec: { content: c, look: { ...defaultExecLook(), showRefs: true } }, slideNumber: (id) => nOf.get(id) ?? null });
    expect(texts(s)).toEqual(expect.arrayContaining(['・訪日客数は2019年を超えた', '・中国だけ回復が遅い', '参照：スライド 2・3']));
    expect(texts(s)).not.toContain('定型の中身');
    expect(setExecMode(c, 'fixed').blocks[0]!.body).toBe('定型の中身');
    expect(execChecks('x', setExecMode(emptyExec(), 'free'), () => true, 'ja').map((w) => w.key)).toEqual(['tpl.warn.execEmpty']);
  });
  it('メッセージを入れる：書いたヘッダーをそのまま並べ、参照にも足す。空・見本・重複は入れない', () => {
    let c = insertMessages(emptyExec(), 'overall', others, (t) => t === '中国だけ回復が遅い');
    expect(c.blocks[0]).toMatchObject({ body: '・訪日客数は2019年を超えた', refs: ['s1'] });
    c = insertMessages(c, 'overall', others, () => false);
    expect(c.blocks[0]!.body).toBe('・訪日客数は2019年を超えた\n・中国だけ回復が遅い');
  });
  it('下書き：空の項目だけに入れる（書いた項目は変えない）', () => {
    const c0 = updateBlock(emptyExec(), 'overall', { body: '自分で書いた' });
    const c = draftFromMessages(c0, (id) => (id === 'overall' ? [others[0]!] : id === 'exceptions' ? [others[1]!] : []), () => false);
    expect(c.blocks[0]!.body).toBe('自分で書いた');
    expect(c.blocks[1]!.body).toBe('・中国だけ回復が遅い');
  });
  it('確認と保存', () => {
    expect(execChecks('', emptyExec(), () => true, 'ja').map((w) => w.key)).toEqual(['tpl.warn.noTitle', 'tpl.warn.execEmpty']);
    const c = updateBlock(emptyExec(), 'evidence', { body: 'あ'.repeat(121), refs: ['gone'] });
    expect(execChecks('x', c, () => false, 'ja').map((w) => w.key)).toEqual(['tpl.warn.execLong', 'tpl.warn.execRefGone']);
    let p = initialProject('ja');
    const v = viewOf(p, 0);
    const t = ensureTemplate(v, 'STORY_TEXT_EXECUTIVE_SUMMARY', true);
    p = withView(p, 0, { ...v, ...t, content: { ...t.content, exec: c } });
    expect(viewOf(normalizeProject(JSON.parse(JSON.stringify(p)))!, 0).content!.exec).toEqual(c);
  });
});

describe('増減付き表', () => {
  const content = (): DeltaContent => ({
    rows: [{ id: 'a', name: '中国', value: '17335', c1: '17704', c2: '' }, { id: 'b', name: '韓国', value: '9632', c1: '4247', c2: '' }],
    heads: { name: '市場', value: '2024年', c1: '2019年', c2: '計画' }, unit: '億円', lead: '', note: '',
  });
  const table = (c: DeltaContent, look = defaultDeltaLook()) => {
    const s = composeTemplate({ id: 'STORY_TABLE_DELTA', title: 'x', source: '', locale: 'ja', delta: { content: c, look } });
    const tb = s.items.find((i) => i.kind === 'table');
    return tb && tb.kind === 'table' ? tb : null;
  };
  it('差と率はアプリが計算する。見出しは比較の名前から（2019年差・2019年比）。マイナスは赤', () => {
    const tb = table(content())!;
    expect(tb.rows[0]!.map((c) => c.text)).toEqual(['市場', '2024年（億円）', '2019年（億円）', '2019年差', '2019年比']);
    expect(tb.rows[1]!.map((c) => c.text)).toEqual(['中国', '17335', '17704', '−369', '−2.1%']);
    expect(tb.rows[1]![3]!.color).toBe('#C62828');
    expect(tb.rows[2]![4]!.text).toBe('+126.8%');
  });
  it('比較2は値があれば出る。比較の値の列を隠せる。合計の行はアプリが計算（足せない単位では出さない）', () => {
    const c = content();
    c.rows[0]!.c2 = '19000';
    const look = { ...defaultDeltaLook(), showCompare: false, delta1: 'pct' as const, delta2: 'pct' as const, total: true };
    const tb = table(c, look)!;
    expect(tb.rows[0]!.map((x) => x.text)).toEqual(['市場', '2024年（億円）', '2019年比', '計画比']);
    expect(tb.rows.at(-1)![0]!.text).toBe('合計');
    expect(tb.rows.at(-1)![1]!.text).toBe('26967');
    expect(table({ ...c, unit: '%' }, look)!.rows.at(-1)![0]!.text).not.toBe('合計');
  });
  it('並べ方：今の値の大きい順・増減の大きい順（率だけの時は率で）', () => {
    const c = content();
    expect(table(c, { ...defaultDeltaLook(), sort: 'delta' })!.rows[1]![0]!.text).toBe('韓国');
    expect(table(c, { ...defaultDeltaLook(), sort: 'value' })!.rows[1]![0]!.text).toBe('中国');
  });
  it('% の値は差を pt で（率は出さない）', () => {
    expect(rowDelta('44%', '47%')).toMatchObject({ isPct: true, pct: null });
  });
  it('データから始める（列を項目に、最新の年とその前の年）。貼り付け。確認。保存', () => {
    const tr = sampleFor('trend', 'ja').dataset;
    const c = deltaFromData(tr, 'ja')!;
    expect(c.rows.map((r) => r.name)).toEqual(tr.cols);
    expect(c.heads.value).toBe(`${tr.rows.at(-1)}年`);
    expect(deltaFromData(initialState('ja').dataset, 'ja')).toBeNull();
    const p0 = pasteDeltaRows(sampleDelta('ja'), 0, 'name', '中国\t100\t90\n韓国\t50\t0\n台湾\t高い\t3\n香港\t3');
    expect(p0.rows[0]).toMatchObject({ name: '中国', value: '100', c1: '90' });
    const keys = deltaChecks(p0, defaultDeltaLook(), '').map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(['tpl.warn.kpiZeroBase', 'tpl.warn.deltaNotNumber', 'tpl.warn.deltaMissing']));
    let p = initialProject('ja');
    const v = viewOf(p, 0);
    p = withView(p, 0, { ...v, ...ensureTemplate(v, 'STORY_TABLE_DELTA', true) });
    const back = normalizeProject(JSON.parse(JSON.stringify(p)))!;
    expect(viewOf(back, 0).content!.delta).toEqual(viewOf(p, 0).content!.delta);
  });
});

describe('課題→示唆→アクション', () => {
  let n = 0;
  const it0 = (text: string, owner = '', due = '') => ({ id: `i${n++}`, text, owner, due });
  const content = (): IiaContent => ({ cols: [
    { id: 'issue', label: '', refs: ['s1'], items: [it0('中国の回復が遅い'), it0('')] },
    { id: 'insight', label: '', refs: [], items: [it0('伸びの中心は韓国・台湾')] },
    { id: 'action', label: '次の一手', refs: [], items: [it0('予算を寄せる', '営業企画部', '3月')] },
  ] });
  const draw = (c: IiaContent, look = defaultIiaLook()) => texts(composeTemplate({ id: 'STORY_TEXT_ISSUE_INSIGHT_ACTION', title: '結論', source: '', locale: 'ja', iia: { content: c, look }, slideNumber: (id) => (id === 's1' ? 2 : null) }));
  it('3つの枠と行（空の行は出さない）。見出しは変えられる。アクションの担当・期限は小さく後ろに', () => {
    const ts = draw(content());
    expect(ts).toEqual(expect.arrayContaining(['課題', '示唆', '次の一手', '・中国の回復が遅い', '・予算を寄せる', '　（営業企画部・3月）', '→']));
    expect(ts.filter((x) => x === '・')).toHaveLength(0);
    expect(draw(content(), { ...defaultIiaLook(), showOwner: false })).not.toContain('　（営業企画部・3月）');
  });
  it('参照は見出しの後ろに *1、下に注記（初めは出さない）', () => {
    expect(draw(content())).not.toContain('課題 *1');
    expect(draw(content(), { ...defaultIiaLook(), showRefs: true })).toEqual(expect.arrayContaining(['課題 *1', '*1 スライド 2']));
  });
  it('メッセージを入れる：空の行に入れ、足りなければ行を足す。参照にも足す', () => {
    const c = insertIiaMessages(content(), 'issue', [{ id: 'a', n: 2, title: 'A' }, { id: 'b', n: 3, title: 'B' }], () => false);
    expect(c.cols[0]!.items.map((i) => i.text)).toEqual(['中国の回復が遅い', 'A', 'B']);
    expect(c.cols[0]!.refs).toEqual(['s1', 'a', 'b']);
  });
  it('確認：アクションが無い・行が多い・長い', () => {
    const c = content();
    c.cols[2]!.items = [it0('')];
    c.cols[0]!.items = Array.from({ length: 5 }, (_, k) => it0('あ'.repeat(k === 0 ? 51 : 3) + k));
    const keys = iiaChecks('x', c, () => true, 'ja').map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(['tpl.warn.iiaNoAction', 'tpl.warn.iiaMany', 'tpl.warn.iiaLong']));
    expect(iiaChecks('', emptyIia(), () => true, 'ja').map((w) => w.key)).toEqual(['tpl.warn.noTitle', 'tpl.warn.iiaEmpty']);
  });
  it('保存して読み戻せる', () => {
    let p = initialProject('ja');
    const v = viewOf(p, 0);
    const t = ensureTemplate(v, 'STORY_TEXT_ISSUE_INSIGHT_ACTION', true);
    const c = content();
    p = withView(p, 0, { ...v, ...t, content: { ...t.content, iia: c } });
    expect(viewOf(normalizeProject(JSON.parse(JSON.stringify(p)))!, 0).content!.iia).toEqual(c);
  });
});

describe('ヒートマップ型の表', () => {
  const c = (): ComparisonContent => ({ ...sampleComparison('ja'), cells: [['項目', 'A', 'B', 'C'], ['規模', '100', '200', '300'], ['伸び', '-10%', '5%', '20%'], ['評価', '高', '低', '中']] });
  it('行ごと：その行の中で濃さを比べる（一番大きいセルが一番濃い）。言葉のセルは塗らない', () => {
    const f = heatFills(c(), { scale: 'row', direction: 'high' });
    expect(f.get('1:3')).toBe(f.get('2:3'));
    expect(f.get('1:1')).not.toBe(f.get('1:3'));
    expect(f.has('3:1')).toBe(false);
  });
  it('小さいほど濃い・プラスマイナス（0を白に、マイナスは赤の側）', () => {
    const lo = heatFills(c(), { scale: 'row', direction: 'low' });
    const hi = heatFills(c(), { scale: 'row', direction: 'high' });
    expect(lo.get('1:1')).toBe(hi.get('1:3'));
    const dv = heatFills(c(), { scale: 'row', direction: 'diverging' });
    expect(dv.get('2:1')).not.toBe(dv.get('2:2'));
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(dv.get('2:1')!.slice(k, k + 2), 16));
    expect(r! > b! && r! > g!).toBe(true);
  });
  it('描く：塗ったセルは濃ければ白い文字。中身と数の形は比較表と共有', () => {
    const s = initialState('ja');
    const t = ensureTemplate(s, 'STORY_TABLE_HEATMAP', true);
    expect(t.content!.comparison).toEqual(sampleComparison('ja'));
    const v = { ...s, ...t, content: { comparison: c() }, look: { ...t.look, comparison: { ...defaultComparisonLook(), formats: { '1': { kind: 'int' as const, unit: '億円' } } } } };
    const r = evaluate(v);
    const tb = r.scene!.items.find((i) => i.kind === 'table');
    expect(tb && tb.kind === 'table' && tb.rows[1]![3]!.text).toBe('300億円');
    expect(tb && tb.kind === 'table' && tb.rows[1]![3]!.color).toBe('#FFFFFF');
  });
  it('確認：表全体で単位の違う値を比べている・数が少ない', () => {
    const keys = heatChecks(c(), { ...defaultHeatLook(), scale: 'all' }, '').map((w) => w.key);
    expect(keys).toContain('tpl.warn.heatMixed');
    expect(heatChecks({ ...c(), cells: [['a', 'b'], ['x', '1']] }, defaultHeatLook(), '').map((w) => w.key)).toContain('tpl.warn.heatFew');
  });
  it('色を選べる（紺・明るい青・青緑・明るいオレンジ）。明るい色は濃いセルでも文字が濃いまま読める', () => {
    const navy = heatFills(c(), { scale: 'row', direction: 'high' });
    const sky = heatFills(c(), { scale: 'row', direction: 'high', palette: 'sky' });
    expect(sky.get('1:3')).not.toBe(navy.get('1:3'));
    expect(heatColor(1, false, 'amber')).not.toBe(heatColor(1, false, 'teal'));
    const s = initialState('ja');
    const t = ensureTemplate(s, 'STORY_TABLE_HEATMAP', true);
    const v = { ...s, ...t, content: { comparison: c() }, look: { ...t.look, heatmap: { ...t.look!.heatmap!, palette: 'amber' as const } } };
    const tb = evaluate(v).scene!.items.find((i) => i.kind === 'table');
    expect(tb && tb.kind === 'table' && tb.rows[1]![3]!.color).not.toBe('#FFFFFF');
    expect(normalizeLook({ heatmap: { palette: 'teal' } })!.heatmap!.palette).toBe('teal');
  });
});

describe('数字＋短い説明', () => {
  const items = () => [
    { id: 'a', value: '2.3倍', label: '韓国の消費額', body: '人数の回復を上回った', ref: 's2' },
    { id: 'b', value: '74%', label: 'リピーター比率', body: '', ref: null },
  ];
  const draw = (c: { items: ReturnType<typeof items> }, look = defaultNumbersLook()) =>
    texts(composeTemplate({ id: 'STORY_TEXT_NUMBERS', title: '結論', source: '', locale: 'ja', numbers: { content: c, look }, slideNumber: (id) => (id === 's2' ? 2 : null) }));
  it('数字は入れたまま（計算しない）。何の数字か・説明。空のかたまりは出さない', () => {
    const ts = draw({ items: [...items(), { id: 'z', value: '', label: '', body: '', ref: null }] });
    expect(ts).toEqual(expect.arrayContaining(['2.3倍', '74%', '韓国の消費額', 'リピーター比率', '人数の回復を上回った']));
  });
  it('参照は「何の数字か」の後ろに *1、下に注記（初めは出さない）', () => {
    expect(draw({ items: items() })).not.toContain('韓国の消費額 *1');
    expect(draw({ items: items() }, { ...defaultNumbersLook(), showRefs: true })).toEqual(expect.arrayContaining(['韓国の消費額 *1', '*1 スライド 2']));
  });
  it('1個なら大きく1つ（2〜3個より大きな数字）', () => {
    const size = (c: { items: ReturnType<typeof items> }) => {
      const s = composeTemplate({ id: 'STORY_TEXT_NUMBERS', title: '', source: '', locale: 'ja', numbers: { content: c, look: defaultNumbersLook() } });
      const t = s.items.find((i) => i.kind === 'text' && i.lines[0]?.t === '2.3倍');
      return t && t.kind === 'text' ? t.lines[0]!.size : 0;
    };
    expect(size({ items: [items()[0]!] })).toBeGreaterThan(size({ items: items() }));
  });
  it('確認：説明が無い・長い・4個以上・数字が無い。保存して読み戻せる', () => {
    const c = { items: [...items(), { id: 'c', value: '', label: 'x', body: 'あ'.repeat(41), ref: null }, { id: 'd', value: '1', label: '', body: 'y', ref: null }] };
    const keys = numbersChecks('x', c, () => true).map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(['tpl.warn.numNoBody', 'tpl.warn.numLong', 'tpl.warn.numMany', 'tpl.warn.numNoValue']));
    let p = initialProject('ja');
    const v = viewOf(p, 0);
    const t = ensureTemplate(v, 'STORY_TEXT_NUMBERS', true);
    p = withView(p, 0, { ...v, ...t, content: { ...t.content, numbers: { items: items() } } });
    expect(viewOf(normalizeProject(JSON.parse(JSON.stringify(p)))!, 0).content!.numbers).toEqual({ items: items() });
  });
});
