import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ProofNeedId } from '@/registry';
import { emptySlide, newStory } from './model';
import { addField, fallbackDataPack, updateField } from './dataPack';
import { buildDataPackBook, dataPackMail, safeSheetName } from './dataPackExport';
import { dataPackXlsx } from './dataPackXlsx';
import { type StoryDataPackPlan } from './dataPackPlan';

const q = (id: string, question: string, proofNeeds: ProofNeedId[], over = {}) => emptySlide({ id, question, proofNeeds, ...over });
const story = newStory('ja', {
  title: 'インバウンド', decisionQuestion: 'どの市場を優先するか', consultation: '社内の戦略メモ：A社を買収する前提で…',
  slides: [q('q1', '全体はどう変わってきたか', ['OVERALL_CHANGE']), q('q2', '今は何で構成されているか', ['CURRENT_MIX']), q('q3', 'Decision', [], { routeRole: 'AIMED.DECISION' })],
});
const plan = fallbackDataPack(story);
const text = (rows: ({ value: string } | null)[][]) => rows.flat().filter(Boolean).map((c) => c!.value);

describe('シート名', () => {
  it('使えない文字は _ に、前後の ' + "'" + ' と空白は外し、31文字に収める', () => {
    const taken = new Set<string>();
    expect(safeSheetName('02_市場/データ:[x]*?', taken)).toBe('02_市場_データ__x___');
    expect(safeSheetName("'quote'", taken)).toBe('quote');
    expect(safeSheetName('あ'.repeat(40), taken)).toHaveLength(31);
    expect(safeSheetName('   ', taken)).toBe('Data');
    expect(safeSheetName('History', taken)).not.toBe('History');
  });
  it('大文字小文字を区別せず重複を避け、重複しても31文字に収まる', () => {
    const taken = new Set<string>();
    const a = safeSheetName('Sales', taken);
    const b = safeSheetName('SALES', taken);
    const long1 = safeSheetName('x'.repeat(40), taken);
    const long2 = safeSheetName('x'.repeat(40), taken);
    expect(new Set([a, b].map((x) => x.toLowerCase())).size).toBe(2);
    expect(long1).not.toBe(long2);
    expect(long2.length).toBeLessThanOrEqual(31);
  });
  it('サロゲートペア（絵文字など）の途中では切らない', () => {
    const name = safeSheetName('😀'.repeat(20), new Set());
    expect(name.length).toBeLessThanOrEqual(31);
    expect([...name].every((c) => c === '😀')).toBe(true);
  });
});

describe('データパックの組み立て', () => {
  it('00_Overview が先頭、依頼の順に 01_…, 02_… が続く。列順・改名を反映する', () => {
    const edited = updateField(addField(plan, 'r-trend', '担当部署', 'dimension'), 'r-trend', 'value', { unit: '百万円' });
    const book = buildDataPackBook(story, edited);
    expect(book.sheets.map((s) => s.name)).toEqual(['00_Overview', '01_項目別の推移', '02_項目別の内訳']);
    expect(text(book.sheets[1]!.rows)).toEqual(['項目', '期間', '値（百万円）', '担当部署']);
    expect(book.sheets[1]!.stickyRows).toBe(1);
  });
  it('Overview：目的・Storyの流れ・Dataset一覧・共通キー・入力ルール・項目の説明が入る。元の相談文は既定で入らない', () => {
    const all = text(buildDataPackBook(story, plan).sheets[0]!.rows).join('\n');
    expect(all).toContain('どの市場を優先するか');
    expect(all).toContain('1. 全体はどう変わってきたか');
    expect(all).toContain('2. 今は何で構成されているか');
    // 最後の Decision も Story の流れの一部。Executive Summary は流れに入れない
    expect(all).toContain('3. Decision');
    expect(all).toContain('01_項目別の推移');
    expect(all).toContain('項目 × 期間');
    expect(all).toContain('01_項目別の推移：項目');
    expect(all).toContain('N/A');
    expect(all).not.toContain('社内の戦略メモ');
  });
  it('元の相談文は、公開を選んだ時だけ入る。ほかの見出しも公開の指定に従う', () => {
    const open: StoryDataPackPlan = { ...plan, overview: { include: { consultation: true, rules: false, questions: false } } };
    const all = text(buildDataPackBook(story, open).sheets[0]!.rows).join('\n');
    expect(all).toContain('社内の戦略メモ');
    expect(all).not.toContain('N/A');
    expect(all).not.toContain('1. 全体はどう変わってきたか');
  });
  it('Overview の上書き（名前・目的・背景・入力ルール）はそのまま使い、Story の本文は書き換えない', () => {
    const over: StoryDataPackPlan = { ...plan, overview: { titleOverride: '依頼用の名前', purposeOverride: '依頼用の目的', backgroundOverride: '依頼用の背景', rulesOverride: '百万円で入力' } };
    const all = text(buildDataPackBook(story, over).sheets[0]!.rows).join('\n');
    for (const s of ['依頼用の名前', '依頼用の目的', '依頼用の背景', '百万円で入力']) expect(all).toContain(s);
    expect(all).not.toContain('N/A');
    expect(story.title).toBe('インバウンド');
  });
  it('入力例は Dimension にだけ置き、数値の欄は空のまま', () => {
    const withExample = updateField(plan, 'r-trend', 'item', { example: '北米' });
    const sheet = buildDataPackBook(story, withExample).sheets[1]!;
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[1]!.map((c) => c?.value ?? null)).toEqual(['例：北米', null, null]);
    expect(buildDataPackBook(story, plan).sheets[1]!.rows).toHaveLength(1);
  });
  it('依頼が無ければ Overview だけ。名前が空の依頼は仮の名前で出す。英語の Story は英語', () => {
    expect(buildDataPackBook(story, { version: 1, overview: {}, requests: [] }).sheets.map((s) => s.name)).toEqual(['00_Overview']);
    const unnamed = buildDataPackBook(story, { ...plan, requests: [{ ...plan.requests[0]!, label: '' }] });
    expect(unnamed.sheets[1]!.name).toBe('01_データ');
    const en = buildDataPackBook(newStory('en', { slides: [q('q1', 'How has it changed?', ['OVERALL_CHANGE'])] }), fallbackDataPack(newStory('en', { slides: [q('q1', 'How has it changed?', ['OVERALL_CHANGE'])] })));
    expect(text(en.sheets[0]!.rows)).toContain('Datasets');
  });
  it('長い相談文でもセルは壊れない（上限で切る）', () => {
    const big = newStory('ja', { consultation: 'あ'.repeat(5000), slides: story.slides });
    const open: StoryDataPackPlan = { ...plan, overview: { include: { consultation: true } } };
    const cell = buildDataPackBook(big, open).sheets[0]!.rows.flat().find((c) => c && c.value.startsWith('あ'))!;
    expect(cell.value.length).toBeLessThanOrEqual(2000);
  });
  it('メール依頼：Dataset 名と Overview の案内が入り、元の相談文は入らない', () => {
    const m = dataPackMail(story, plan);
    expect(m.subject).toContain('インバウンド');
    expect(m.body).toContain('- 項目別の推移');
    expect(m.body).toContain('- 項目別の内訳');
    expect(m.body).toContain('00_Overview');
    expect(m.body).not.toContain('社内の戦略メモ');
    expect(m.filename.endsWith('.xlsx')).toBe(true);
  });
});

describe('.xlsx への書き出し', () => {
  async function open(book: ReturnType<typeof buildDataPackBook>) {
    const blob = await dataPackXlsx(book);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    const names = [...workbook.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]!);
    return { zip, names };
  }
  it('シートの順と名前が、組み立てた順のまま Workbook に入る', async () => {
    const { names } = await open(buildDataPackBook(story, plan));
    expect(names).toEqual(['00_Overview', '01_項目別の推移', '02_項目別の内訳']);
  });
  it('「=」「+」「@」「-」で始まる文字も、数式にせず文字列として書く', async () => {
    const evil = addField(addField(addField(plan, 'r-trend', '=SUM(A1)'), 'r-trend', '+1'), 'r-trend', '@cmd');
    const { zip } = await open(buildDataPackBook(story, evil));
    const sheet = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(sheet).not.toMatch(/<f[ >]/);
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string');
    expect(strings).toContain('=SUM(A1)');
    expect(strings).toContain('@cmd');
  });
  it('日本語・長文・列幅・ヘッダー固定が入る', async () => {
    const { zip } = await open(buildDataPackBook(story, plan));
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string');
    expect(strings).toContain('どの市場を優先するか');
    const sheet = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(sheet).toMatch(/<pane[^>]*ySplit="1"/);
    expect(sheet).toContain('<cols>');
  });
  it('入力シートの先頭行は列見出しだけで、貼り付けやすい（Overview の項目説明は別シートに置く）', async () => {
    const book = buildDataPackBook(story, plan);
    const input = book.sheets[1]!;
    expect(input.rows[0]!.map((c) => c!.value)).toEqual(['項目', '期間', '値']);
    expect(input.rows.slice(1).flat().filter(Boolean)).toHaveLength(0);
  });
});
