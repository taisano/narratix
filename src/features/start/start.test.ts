import { describe, expect, it } from 'vitest';
import { isSampleData } from '@/features/editor/fromRecipe';
import { newProject, viewOf } from '@/features/editor/project';
import { initialState, sampleFor } from '@/features/editor/state';
import { chartThumbs } from './chart-catalog';

const JA = /[぀-ヿ一-鿿]/;

describe('英語のスライドの見本', () => {
  it('項目名・単位・見出しが英語になる（数字は日本語の見本と同じ）', () => {
    for (const p of ['composition', 'trend', 'contribution', 'relationship'] as const) {
      const en = sampleFor(p, 'en');
      const ja = sampleFor(p, 'ja');
      const d = en.dataset;
      expect([d.unit ?? '', ...d.rows, ...d.cols, ...(d.groups ?? []).map(String), ...Object.values(d.dimensions ?? {}), en.title, en.source].join(' ')).not.toMatch(JA);
      expect(d.periods.current.values).toEqual(ja.dataset.periods.current.values);
    }
  });
  it('英語の見本も「見本のまま」と分かる', () => {
    expect(isSampleData(initialState('en'))).toBe(true);
    expect(isSampleData({ ...initialState('en'), ...sampleFor('trend', 'en') })).toBe(true);
  });
  it('英語で新しく始めると、見本のデータも英語', () => {
    const p = newProject('en');
    expect(p.slideLocale).toBe('en');
    expect(viewOf(p).dataset.rows).toContain('North America');
    expect(viewOf(p).mekko.growthRows).toContain('series:Dual');
  });
  it('/start のチャートの絵：英語の画面では日本語の文字が出ない', () => {
    const th = chartThumbs('en');
    expect(Object.keys(th).length).toBeGreaterThan(10);
    for (const [id, svg] of Object.entries(th)) expect(svg, id).not.toMatch(JA);
  });
});
