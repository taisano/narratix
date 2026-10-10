import { describe, expect, it } from 'vitest';
import { maskText } from './mask';
import { sanitize } from './journey';
import { summarizeChart } from './summary';

describe('相談文の伏せ字', () => {
  it('メール・URL・電話番号・郵便番号・長い数字・@アカウントを伏せる', () => {
    const m = maskText('連絡は taro@example.com か 03-1234-5678、https://example.com/a?x=1 、〒150-0001、口座 12345678、@taro_x まで。売上は2025年に伸びた');
    expect(m).not.toMatch(/example|03-1234|150-0001|12345678|taro/);
    expect(m).toContain('2025年');
    expect(m).toContain('[メール]');
  });
  it('長さを切る', () => { expect(maskText('あ'.repeat(2000)).length).toBe(600); });
});

describe('記録できる項目の許可リスト', () => {
  it('知らない種類は送らない', () => { expect(sanitize('secret', { a: 1 })).toBeNull(); });
  it('許可していない項目・自由記入の文字列は落ちる', () => {
    const out = sanitize('chart_saved', { slides: 3, title: '2025年 売上報告', rows: 4, rowNames: ['東京支店'], recipes: ['R01', '東京 支店'], source: '社内資料', cells: [[100, 200]] });
    expect(out).toEqual({ slides: 3, rows: 4, recipes: ['R01'] });
    expect(JSON.stringify(out)).not.toMatch(/東京|売上|社内|100/);
  });
  it('相談文は伏せ字を通してだけ入る', () => {
    expect(sanitize('consult', { text: 'a@b.com に説明', classifier: 'ai' })).toEqual({ text: '[メール] に説明', classifier: 'ai' });
  });
  it('数は丸めて範囲に収める', () => { expect(sanitize('export', { slides: 3.6, kind: 'ppt' })).toEqual({ slides: 4, kind: 'ppt' }); });
});

describe('保存したチャートの要約に、データの値が混ざらない', () => {
  const secret = '極秘商事';
  const project = {
    dataset: { rows: [secret, '東京'], cols: ['売上高1234567'], periods: { base: { label: secret, values: [[987654321]] }, current: { label: '2025', values: [[1]] } } },
    slides: [{ recipe: 'R01', chart: 'mekko', title: secret, complements: { aligned_table: true, delta_labels: false }, controls: { highlight: secret } }],
    recommendation: { entry_mode: 'CONSULTATION', creation_mode: 'COACH_RECOMMEND', consultation_text: secret, recommended_recipe_ids: ['R01'], selected_recipe_ids: ['R01'], consultation_history_id: 'h1' },
  };
  it('形だけが出る', () => {
    const s = summarizeChart(project as never);
    expect(s).toMatchObject({ slides: 1, rows: 2, cols: 1, periods: 2, recipes: ['R01'], charts: ['mekko'], complements: ['aligned_table'], entry: 'consultation', fromConsult: true });
    const clean = sanitize('chart_saved', s);
    expect(JSON.stringify(clean)).not.toMatch(/極秘|東京|1234567|987654321|売上/);
  });
});
