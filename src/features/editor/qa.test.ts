import { describe, expect, it } from 'vitest';
import { isTimeAxis } from '@/engine/transform/cagr';
import { dataSuggestions } from './advice';
import { replaceWithTable } from './edit';
import { switchSlideLocale } from './localeSwitch';
import { initialState, sampleFor, type BuilderState } from './state';

describe('公開前 QA の修正', () => {
  it('ウォーターフォール：始点と終点だけ年らしい表に、折れ線を勧めない', () => {
    const s: BuilderState = { ...initialState(), chart: 'waterfall', ...sampleFor('contribution') };
    expect(dataSuggestions(s).some((x) => x.code === 'years_rows')).toBe(false);
    expect(isTimeAxis(['2024年度 営業利益', '販売数量', '価格', '2025年度 営業利益'])).toBe(false);
    expect(isTimeAxis(['2021', '2022', '2023'])).toBe(true);
  });
  it('表を貼り替えて名前が変わったら、前のデータに結びついた設定（軸の名前・出典など）を外す', () => {
    const s: BuilderState = { ...initialState(), controls: { x_title: 'Implementation Ease', source_left: 'JNTO', highlight: '北米', data_labels: 'all' } };
    const n = replaceWithTable(s, 'current', { rows: ['X', 'Y'], cols: ['P', 'Q'], values: [[1, 2], [3, 4]], hasColNames: true, hasRowNames: true } as never);
    expect(n.controls.x_title).toBeUndefined();
    expect(n.controls.source_left).toBeUndefined();
    expect(n.controls.highlight).toBeUndefined();
    expect(n.controls.data_labels).toBe('all');
  });
  it('スライドの言語：見本のままなら、その言語の見本（データ・タイトル・出典・強調の名前）に替える。入力した文言は替えない', () => {
    const s: BuilderState = { ...initialState(), controls: { highlight: '中国' } };
    const en = switchSlideLocale(s, 'en');
    expect(en.slideLocale).toBe('en');
    expect(en.dataset.rows).toContain('North America');
    expect(en.controls.highlight).toBe('China');
    expect(en.mekko.growthRows).toContain('series:Dual');
    expect(en.source).toContain('Source');
    const mine = switchSlideLocale({ ...s, title: '自分のタイトル', dataset: { ...s.dataset, rows: ['自社'], periods: { ...s.dataset.periods } } }, 'en');
    expect(mine.title).toBe('自分のタイトル');
    expect(mine.dataset.rows).toEqual(['自社']);
  });
});
